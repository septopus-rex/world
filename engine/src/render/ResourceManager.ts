import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SplatMesh } from '@sparkjsdev/spark';
import { IDataSource } from '../core/services/DataSource';
import { isCid } from '../core/services/ipfs';
import type { IpfsRouter } from '../core/services/ipfs';
import { IModelLoader, ModelLoader } from './loaders/ModelLoader';
import { reportError, ResourceError } from '../core/errors';

/**
 * ResourceManager — the single load-once-by-id authority for external 3D assets
 * (models AND textures). It is the new-engine port of the old engine's
 * ['resource','module',id] / ['resource','texture',id] cache + render_3d's
 * parseModule/parseTexture (the load-once/instance-many core).
 *
 * THE CONTRACT (the whole point of this service):
 *   A raw model/texture file is fetched + decoded EXACTLY ONCE per resource id.
 *   Every placement gets a cheap CLONE that shares the one decoded
 *   geometry/material by reference — N robots = 1 file in memory. Textures are
 *   shared by reference (not cloned), since a GPU texture is cheap to reference
 *   and expensive to duplicate.
 *
 * Two upgrades over the old engine:
 *   1. Keying the cache on the in-flight PROMISE (not the resolved value)
 *      replaces the fragile `row.three = null` lock + setTimeout(1000/300) dance:
 *      a burst of getModel(id) for the same id in one frame all await the SAME
 *      promise, so the file loads once even under concurrent placement.
 *   2. Ref-counting + release() (the old engine NEVER freed — resources leaked
 *      forever). Tied into block eviction so memory stays bounded as the player
 *      roams.
 */

export interface ModelEntry {
    /** The ONE decoded template. Never added to the scene directly — only cloned. */
    template: THREE.Object3D;
    /** Source-space bounding box, for scaling clones to an authored size. */
    bounds: THREE.Box3;
    /** Pre-computed [width, height, depth] of bounds — renderer-agnostic convenience. */
    boundsSize: [number, number, number];
    /** Whether the template contains skinned meshes (needs SkeletonUtils.clone). */
    rigged: boolean;
    /**
     * The decoded AnimationClip instances (e.g. GLTF animations). First-class
     * here because clips must NOT travel through cloned userData: Object3D.copy
     * round-trips userData through JSON, stripping KeyframeTrack prototypes — a
     * mixer fed those dies with "tracks[i].createInterpolant is not a function".
     * Clips target nodes BY NAME, so the template's clips drive every clone.
     */
    animations: THREE.AnimationClip[];
    /** Live clone count; template is disposed when this returns to 0 on release. */
    refCount: number;
    /** The unresolved source (CID/URL/path). Kept so release() can revoke a
     *  router-cached blob: URL once the last instance is gone. */
    src?: string;
}

interface TextureEntry {
    texture: THREE.Texture;
    refCount: number;
    /** See ModelEntry.src — drives blob:-URL revocation on releaseTexture(). */
    src?: string;
}

/** Loader that turns an already-resolved URL into a THREE.Texture. Injectable for tests. */
export interface ITextureLoader {
    loadAsync(url: string): Promise<THREE.Texture>;
}

export interface ResourceManagerConfig {
    /** Injectable model loader (default real ModelLoader; tests inject a fake + counter). */
    loader?: IModelLoader;
    /** Injectable texture loader (default THREE.TextureLoader; tests inject a fake). */
    textureLoader?: ITextureLoader;
    ipfsGateway?: string;
    /** Content-addressed resolver: a CID raw is fetched through this (mock CAS /
     *  real IPFS) instead of the gateway. See core/services/ipfs. */
    ipfsRouter?: IpfsRouter;
    maxConcurrent?: number;
    /**
     * LRU cap on resolved audio URLs. Audio is transient (play-and-forget), so it
     * has no per-instance holder to refcount — instead the least-recently-used
     * entries are evicted past this cap, and any router-cached blob: URL they hold
     * is revoked. Keeps memory bounded without thrashing decode of hot sounds.
     */
    maxAudioUrls?: number;
    /**
     * Max texture anisotropy (from renderer.capabilities.getMaxAnisotropy()).
     * Raising anisotropy is the single biggest defense against grazing-angle
     * shimmer/blur on long or large faces (floors, walls, pipes) — the main
     * texture-quality gap that left the old engine looking mosaic-y.
     */
    maxAnisotropy?: number;
}

export class ResourceManager {
    private readonly datasource: IDataSource;
    private readonly loader: IModelLoader;
    private readonly textureLoader: ITextureLoader;
    private readonly ipfsGateway: string;
    private readonly ipfsRouter?: IpfsRouter;
    private readonly maxConcurrent: number;
    private readonly maxAnisotropy: number;
    private readonly maxAudioUrls: number;

    // Promise-keyed caches: fetch+decode dedup under concurrent bursts.
    private models = new Map<string, Promise<ModelEntry>>();
    private textures = new Map<string, Promise<THREE.Texture>>();
    // Resolved entries for synchronous instance()/refcount access post-load.
    private modelEntries = new Map<string, ModelEntry>();
    private textureEntries = new Map<string, TextureEntry>();

    private active = 0;
    private queue: Array<() => void> = [];

    constructor(datasource: IDataSource, config: ResourceManagerConfig = {}) {
        this.datasource = datasource;
        this.loader = config.loader ?? new ModelLoader();
        this.textureLoader = config.textureLoader ?? (new THREE.TextureLoader() as ITextureLoader);
        this.ipfsGateway = config.ipfsGateway ?? 'https://gateway.pinata.cloud/ipfs/';
        this.ipfsRouter = config.ipfsRouter;
        this.maxConcurrent = config.maxConcurrent ?? 3;
        // Cap anisotropy at 8: near-indistinguishable from higher on most GPUs but
        // cheaper. 0/undefined renderer caps fall back to 1 (no anisotropic filtering).
        this.maxAnisotropy = Math.max(1, Math.min(8, config.maxAnisotropy ?? 8));
        this.maxAudioUrls = Math.max(1, config.maxAudioUrls ?? 64);
    }

    // ── Audio ─────────────────────────────────────────────────────────────────

    // id → { resolved URL, unresolved src }. LRU-ordered (Map insertion order):
    // a cache hit is re-inserted at the tail, the head is the eviction victim.
    private audioUrls = new Map<string, Promise<{ url: string; src: string }>>();

    /**
     * Resolve an audio resource id (or a direct URL/CID) to a playable URL. Served
     * through the dedicated audio channel when the source provides one, else the
     * module channel; CID/path/data go through resolveUrl (same as models). The
     * decode → AudioBuffer is cached separately by the render layer.
     *
     * LRU-bounded: audio is play-and-forget with no instance to refcount, so entries
     * past maxAudioUrls are evicted (and their blob: URL bytes reclaimed) rather than
     * kept forever — the fix for the old unbounded audioUrls growth.
     */
    async getAudioUrl(resourceId: string | number): Promise<string> {
        const id = String(resourceId);
        let entry = this.audioUrls.get(id);
        if (entry) {
            this.audioUrls.delete(id);        // LRU touch: move to the tail
            this.audioUrls.set(id, entry);
            return entry.then(r => r.url);
        }
        entry = (async () => {
            const direct = isCid(id) || /^(https?:|data:|blob:|file:)/.test(id);
            let src: string;
            if (direct) {
                src = id;
            } else {
                const fetchAudio = this.datasource.audio ?? this.datasource.module;
                const records = await fetchAudio.call(this.datasource, [Number(id)]);
                const rec = records?.[id] ?? records?.[Number(id)];
                if (!rec?.raw) throw new Error(`[ResourceManager] no audio record for id ${id}`);
                src = rec.raw;
            }
            return { url: await this.resolveUrl(src), src };
        })();
        this.audioUrls.set(id, entry);
        // Drop a failed lookup so a later play retries (Actuator reports the failure).
        entry.catch(() => { if (this.audioUrls.get(id) === entry) this.audioUrls.delete(id); });
        this.evictAudioOverCap();
        return entry.then(r => r.url);
    }

    // id → resolved URL. Deduped so N screens of one video share ONE fetch/blob.
    // NOT LRU-revoked like audio: a live <video> streams from the blob for its whole
    // lifetime, so revoking on a cap would break playback. Reclaim is tied to screen
    // removal instead (RenderEngine.removeHandle) — MVP leaves the blob (spec §10).
    private videoUrls = new Map<string, Promise<string>>();

    /** Resolve a video resource id (or direct URL/CID) to a playable URL. */
    async getVideoUrl(resourceId: string | number): Promise<string> {
        const id = String(resourceId);
        let promise = this.videoUrls.get(id);
        if (!promise) {
            promise = (async () => {
                const direct = isCid(id) || /^(https?:|data:|blob:|file:)/.test(id);
                if (direct) return this.resolveUrl(id);
                const fetchVideo = this.datasource.video ?? this.datasource.module;
                const records = await fetchVideo.call(this.datasource, [Number(id)]);
                const rec = records?.[id] ?? records?.[Number(id)];
                if (!rec?.raw) throw new Error(`[ResourceManager] no video record for id ${id}`);
                return this.resolveUrl(rec.raw);
            })();
            this.videoUrls.set(id, promise);
            promise.catch(() => { if (this.videoUrls.get(id) === promise) this.videoUrls.delete(id); });
        }
        return promise;
    }

    /** Evict LRU audio entries past the cap; revoke any blob: URL they still hold. */
    private evictAudioOverCap(): void {
        while (this.audioUrls.size > this.maxAudioUrls) {
            const victim = this.audioUrls.keys().next().value as string | undefined;
            if (victim === undefined) break;
            const evicted = this.audioUrls.get(victim)!;
            this.audioUrls.delete(victim);
            evicted.then(r => this.revokeIfUnused(r.src)).catch(() => { /* failed entry never made a URL */ });
        }
    }

    // ── Models ────────────────────────────────────────────────────────────────

    /**
     * Load (fetch + decode) the model for a resource id, ONCE. Concurrent calls
     * for the same id await the same in-flight promise — the file is fetched and
     * parsed exactly once even under a burst of placements in a single frame.
     */
    async getModel(resourceId: string | number): Promise<ModelEntry> {
        const id = String(resourceId);
        const existing = this.models.get(id);
        if (existing) return existing;

        const promise = this.withSlot(async (): Promise<ModelEntry> => {
            // Direct locator: an explicit URL is already the address — resolve it
            // without a datasource id lookup, the same bypass getTexture/getAudioUrl/
            // getVideoUrl already have (the id map is only for numeric ids). Lets
            // runtime-generated content (e.g. an AI world-generation service's splat
            // output) be placed as a module without a static manifest entry. Unlike
            // those three, a model MUST know its format up front to pick a loader, so
            // (unlike them) a bare CID isn't accepted here — it carries no extension
            // to infer one from. `<cid>.<ext>` IS accepted: the filename-style suffix
            // carries the format while the stem stays content-addressed (bytes route
            // through resolveUrl(cid) → IpfsRouter CAS tiers), and the whole reference
            // remains a single string that fits an a4 resource slot / draft row.
            const direct = /^(https?:|data:|blob:|file:)/.test(id);
            const dot = direct ? -1 : id.lastIndexOf('.');
            const cidStem = dot > 0 && isCid(id.slice(0, dot)) ? id.slice(0, dot) : null;
            let format: string, rawSrc: string;
            if (cidStem) {
                rawSrc = cidStem;
                format = id.slice(dot + 1).toLowerCase();
            } else if (isCid(id)) {
                throw new Error(`[ResourceManager] bare CID carries no model format — reference it as '<cid>.<ext>': ${id}`);
            } else if (direct) {
                rawSrc = id;
                const ext = id.split(/[?#]/)[0].split('.').pop()?.toLowerCase();
                if (!ext) throw new Error(`[ResourceManager] direct model URL has no extension to infer a format from: ${id}`);
                format = ext;
            } else {
                const records = await this.datasource.module([Number(id)]);
                const rec = records?.[id] ?? records?.[Number(id)];
                if (!rec || !rec.format) {
                    throw new Error(`[ResourceManager] no model record for id ${id}`);
                }
                format = rec.format;
                rawSrc = rec.raw;
            }
            const url = await this.resolveUrl(rawSrc);
            const template = await this.loader.parse(format, url);

            let rigged = false;
            template.traverse((o: any) => { if (o.isSkinnedMesh) rigged = true; });
            // Mark the template's own meshes shared so it survives a stray removeHandle.
            this.markShared(template);

            const bounds = ModelLoader.computeBounds(template);
            const bsz = new THREE.Vector3();
            bounds.getSize(bsz);
            const entry: ModelEntry = {
                template,
                bounds,
                boundsSize: [bsz.x, bsz.y, bsz.z],
                rigged,
                // ModelLoader stashes the decoded clips on the template's userData;
                // lift them out while they are still real AnimationClip instances.
                animations: (template.userData?.animations as THREE.AnimationClip[]) ?? [],
                refCount: 0,
                src: rawSrc,
            };
            this.modelEntries.set(id, entry);
            return entry;
        });

        this.models.set(id, promise);
        // If the load fails, drop the cached promise so a later request can retry,
        // and surface it (was silent) — revives resource.failed via WorldEventSink.
        promise.catch((e) => {
            if (this.models.get(id) === promise) this.models.delete(id);
            reportError(e, { tag: '[ResourceManager]', severity: 'warn', code: 'RESOURCE_LOAD', kind: 'model', id });
        });
        return promise;
    }

    /** Resolved entry (sync) — only valid after getModel(id) has resolved. */
    getModelEntry(resourceId: string | number): ModelEntry | undefined {
        return this.modelEntries.get(String(resourceId));
    }

    /**
     * Produce ONE placement instance of a loaded model: a clone that shares the
     * template's geometry + material by reference (only node trees are new).
     * Rigged templates use SkeletonUtils.clone (independent bones per clone);
     * plain Groups use Object3D.clone. Increments the entry's refCount.
     *
     * Sync by design — call only after getModel(id) has resolved.
     */
    instance(resourceId: string | number): THREE.Object3D {
        const id = String(resourceId);
        const entry = this.modelEntries.get(id);
        if (!entry) {
            throw new Error(`[ResourceManager] instance('${id}') before getModel resolved`);
        }

        // Splats: SplatMesh has no working clone()/copy() (THREE's default knows
        // nothing about its Dyno/GPU-buffer internals — cloning the template
        // directly would silently produce an empty, non-rendering object). Mint a
        // FRESH SplatMesh sharing the template's already-decoded PackedSplats
        // instead — cheap (no re-fetch/re-decode), and Spark's own intended reuse
        // path. `isSplatInstance` tells RenderEngine's disposal path to call this
        // instance's own .dispose() rather than the generic geometry/material
        // traversal (a SplatMesh has neither, so that traversal would no-op and
        // leak its GPU resources). Known simplification (v1, exhibit-scale
        // content only): each instance is disposed independently on removal —
        // untested against Spark's internals for many concurrent instances of the
        // SAME resource id sharing one PackedSplats; revisit if splats become a
        // mass-placed content type rather than rare showcase exhibits.
        if (entry.template instanceof SplatMesh) {
            const splatClone = new SplatMesh({ packedSplats: (entry.template as any).packedSplats });
            (splatClone as any).userData = { ...(splatClone as any).userData, resourceId: id, isModelInstance: true, isSplatInstance: true };
            entry.refCount++;
            return splatClone as unknown as THREE.Object3D;
        }

        const clone = entry.rigged ? skeletonClone(entry.template) : entry.template.clone(true);
        // Mark every clone mesh shared so RenderEngine disposal NEVER disposes the
        // template's geometry/material (which the clone shares by reference).
        this.markShared(clone as THREE.Object3D);
        (clone as any).userData = { ...(clone as any).userData, resourceId: id, isModelInstance: true };
        // Re-attach the REAL clips: cloning JSON-mangled the userData copy (see
        // ModelEntry.animations). Consumers read clone.userData.animations.
        (clone as any).userData.animations = entry.animations;
        entry.refCount++;
        return clone as THREE.Object3D;
    }

    /**
     * Release one live clone of a model id. When refCount hits 0, dispose the
     * shared template (geometry + materials) and drop the cache entry so memory
     * is reclaimed. Called from block eviction, once per evicted module clone.
     */
    release(resourceId: string | number): void {
        const id = String(resourceId);
        const entry = this.modelEntries.get(id);
        if (!entry) return;
        entry.refCount = Math.max(0, entry.refCount - 1);
        if (entry.refCount === 0) {
            this.disposeObject(entry.template);
            this.modelEntries.delete(id);
            this.models.delete(id);
            this.revokeIfUnused(entry.src);   // reclaim the IPFS blob: URL bytes
        }
    }

    // ── Textures ──────────────────────────────────────────────────────────────

    /**
     * Load a texture for a resource id, ONCE. Shared BY REFERENCE: the SAME
     * THREE.Texture is assigned to every material that references the id, so 50
     * walls using texture 7 keep ONE Texture in memory.
     *
     * `repeat` is a property of the (shared) Texture, so it is ONE value per id —
     * effective on first load only. It is NOT a per-surface override (that would
     * need per-surface texture clones, defeating dedup). Per-face texel density is
     * handled separately by size-derived UV tiling (see TextureScale); the texture
     * record's repeat acts as a global multiplier on top. Callers (AdjunctFactory)
     * therefore omit it and let the record's repeat be canonical.
     */
    async getTexture(
        resourceId: string | number,
        repeat?: [number, number],
        opts: { srgb?: boolean } = {}
    ): Promise<THREE.Texture> {
        const id = String(resourceId);
        const existing = this.textures.get(id);
        if (existing) return existing;

        const promise = this.withSlot(async (): Promise<THREE.Texture> => {
            // Direct locator: a content-addressed CID or an explicit URL is already
            // the address — resolve it without a datasource id lookup (the id map is
            // only for numeric resource ids). Lets a live/IPFS hash texture directly.
            const direct = isCid(id) || /^(https?:|data:|blob:|file:)/.test(id);
            let raw: string;
            let recRepeat: [number, number] | undefined;
            let recSize: [number, number] | undefined;
            if (direct) {
                raw = id;
            } else {
                const records = await this.datasource.texture([Number(id)]);
                const rec = records?.[id] ?? records?.[Number(id)];
                if (!rec || (!rec.raw && !rec.format)) {
                    throw new Error(`[ResourceManager] no texture record for id ${id}`);
                }
                raw = rec.raw;
                recRepeat = rec.repeat;
                recSize = rec.size;
            }
            const url = await this.resolveUrl(raw);
            const tex = await this.textureLoader.loadAsync(url);

            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            // Tiling density (texture.md §3): a per-texture world `size` (= metres one
            // image covers) → repeat = 1/size, applied on top of the geometry's metre
            // UVs. `size` default [1,1] (one image per metre). Legacy records with no
            // `size` fall back to their raw `repeat`; an explicit arg still overrides.
            const sizeRepeat: [number, number] | undefined = recSize
                ? [1 / recSize[0], 1 / recSize[1]] : undefined;
            const rep = repeat ?? sizeRepeat ?? recRepeat ?? [1, 1];
            tex.repeat?.set?.(rep[0], rep[1]);

            // Anisotropic filtering — the main fix for grazing-angle shimmer on
            // long/large faces (kills the old "mosaic" look at oblique views).
            tex.anisotropy = this.maxAnisotropy;
            // Albedo/color textures are sRGB; renderer.outputColorSpace is sRGB too.
            if (opts.srgb !== false && 'colorSpace' in tex) {
                (tex as any).colorSpace = THREE.SRGBColorSpace;
            }
            // RepeatWrapping + mipmaps require power-of-two dimensions; three silently
            // clamps wrap + disables mipmaps for NPOT, degrading tiling/filtering.
            this.warnIfNPOT(id, raw, tex);
            tex.needsUpdate = true;

            this.textureEntries.set(id, { texture: tex, refCount: 0, src: raw });
            return tex;
        });

        this.textures.set(id, promise);
        promise.catch((e) => {
            if (this.textures.get(id) === promise) this.textures.delete(id);
            reportError(e, { tag: '[ResourceManager]', severity: 'warn', code: 'RESOURCE_LOAD', kind: 'texture', id });
        });
        return promise;
    }

    /** Mark one material as using a texture id (for ref-counted disposal). */
    retainTexture(resourceId: string | number): void {
        const e = this.textureEntries.get(String(resourceId));
        if (e) e.refCount++;
    }

    /** Release one user of a texture id; dispose + drop when no users remain. */
    releaseTexture(resourceId: string | number): void {
        const id = String(resourceId);
        const e = this.textureEntries.get(id);
        if (!e) return;
        e.refCount = Math.max(0, e.refCount - 1);
        if (e.refCount === 0) {
            e.texture.dispose();
            this.textureEntries.delete(id);
            this.textures.delete(id);
            this.revokeIfUnused(e.src);       // reclaim the IPFS blob: URL bytes
        }
    }

    /**
     * Revoke the router-cached blob: URL for `raw` — but ONLY once no other live
     * model/texture entry still resolves to the same CID. ResourceManager
     * refcounts by resource-id while the router caches by CID, and one CID could
     * back two ids (identical content); revoking eagerly would dead-URL the
     * survivor. Called AFTER the releasing entry is removed from its map, so the
     * scan below never sees itself. No-op unless a router is set and raw is a CID.
     */
    private revokeIfUnused(raw?: string): void {
        if (!raw || !this.ipfsRouter || !isCid(raw)) return;
        for (const e of this.modelEntries.values()) if (e.src === raw) return;
        for (const e of this.textureEntries.values()) if (e.src === raw) return;
        this.ipfsRouter.revoke(raw);
    }

    // ── Internals ───────────────────────────────────────────────────────────────

    /** Dev warning: NPOT textures break RepeatWrapping + mipmaps in WebGL. */
    private warnIfNPOT(id: string, raw: string, tex: THREE.Texture): void {
        const img: any = (tex as any).image;
        const w = img?.width, h = img?.height;
        if (!w || !h) return; // headless / not yet decoded
        const isPow2 = (n: number) => (n & (n - 1)) === 0;
        if (!isPow2(w) || !isPow2(h)) {
            console.warn(`[ResourceManager] texture ${id} (${raw}) is non-power-of-two (${w}x${h}); ` +
                `WebGL will disable mipmaps + clamp RepeatWrapping — resize to power-of-two to keep tiling crisp.`);
        }
    }

    /** Tag every Mesh in a tree as sharing template-owned geometry/material. */
    private markShared(root: THREE.Object3D): void {
        root.traverse((child: any) => {
            if (child.isMesh || child.isPoints || child.isLine) {
                child.userData = { ...child.userData, shared: true };
            }
        });
    }

    /** Dispose a template's owned geometry + materials (+ their maps). */
    private disposeObject(root: THREE.Object3D): void {
        // The throwaway bounds-only SplatMesh template (see ModelLoader.parseSplat)
        // has neither .geometry nor .material for the traversal below to find —
        // its own dispose() is the documented way to free the shared PackedSplats'
        // GPU texture.
        if (root instanceof SplatMesh) { root.dispose(); return; }
        root.traverse((child: any) => {
            if (child.geometry) child.geometry.dispose?.();
            const mat = child.material;
            if (Array.isArray(mat)) mat.forEach((m: any) => this.disposeMaterial(m));
            else if (mat) this.disposeMaterial(mat);
        });
    }

    private disposeMaterial(mat: any): void {
        for (const key of Object.keys(mat)) {
            const val = mat[key];
            if (val && val.isTexture) val.dispose?.();
        }
        mat.dispose?.();
    }

    /**
     * Map a resource record's raw field to a loadable URL. The old engine left
     * this undefined (raw was sometimes a path 'module/house.fbx', sometimes the
     * literal 'RAW_DATA_OF_3D_MODULE'); pin it down here.
     *   - already a url (http/https/data/blob/file) → as-is
     *   - IPFS CID (Qm… / bafy…) → ipfsGateway + cid
     *   - otherwise treat as a relative path (dev/local mock)
     */
    private async resolveUrl(raw: string): Promise<string> {
        if (!raw) return raw;
        if (/^(https?:|data:|blob:|file:)/.test(raw)) return raw;
        if (isCid(raw)) {
            // Content-addressed: fetch through the router (mock CAS / real IPFS).
            // If the router lacks it, fall back to the public gateway.
            if (this.ipfsRouter) {
                // Only a ResourceError (router miss / integrity) falls through to the
                // public gateway; a real bug (TypeError etc.) propagates instead of
                // being catch-all swallowed. Discriminating catch — cf. `ignore`.
                try { return await this.ipfsRouter.toObjectUrl(raw); }
                catch (e) { if (!(e instanceof ResourceError)) throw e; /* fall through to gateway */ }
            }
            return `${this.ipfsGateway}${raw}`;
        }
        return raw; // relative path (dev/local mock)
    }

    /** Concurrency gate: at most `maxConcurrent` loads run at once (cf. AdjunctLoader). */
    private async withSlot<T>(fn: () => Promise<T>): Promise<T> {
        if (this.active >= this.maxConcurrent) {
            await new Promise<void>((resolve) => this.queue.push(resolve));
        }
        this.active++;
        try {
            return await fn();
        } finally {
            this.active--;
            const next = this.queue.shift();
            if (next) next();
        }
    }

    /** Diagnostics for tests/dev: how many distinct files are currently held. */
    getStats(): { models: number; textures: number; audioUrls: number; modelRefs: Record<string, number>; textureRefs: Record<string, number> } {
        const modelRefs: Record<string, number> = {};
        for (const [id, e] of this.modelEntries) modelRefs[id] = e.refCount;
        const textureRefs: Record<string, number> = {};
        for (const [id, e] of this.textureEntries) textureRefs[id] = e.refCount;
        return { models: this.modelEntries.size, textures: this.textureEntries.size, audioUrls: this.audioUrls.size, modelRefs, textureRefs };
    }

    dispose(): void {
        for (const e of this.modelEntries.values()) this.disposeObject(e.template);
        for (const e of this.textureEntries.values()) e.texture.dispose();
        // Reclaim any router-cached blob: URLs the audio cache still holds.
        for (const entry of this.audioUrls.values()) {
            entry.then(r => this.ipfsRouter?.revoke(r.src)).catch(() => {});
        }
        this.models.clear();
        this.textures.clear();
        this.modelEntries.clear();
        this.textureEntries.clear();
        this.audioUrls.clear();
    }
}
