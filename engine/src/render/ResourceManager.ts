import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { IDataSource } from '../core/services/DataSource';
import { IModelLoader, ModelLoader } from './loaders/ModelLoader';

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
}

interface TextureEntry {
    texture: THREE.Texture;
    refCount: number;
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
    maxConcurrent?: number;
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
    private readonly maxConcurrent: number;
    private readonly maxAnisotropy: number;

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
        this.maxConcurrent = config.maxConcurrent ?? 3;
        // Cap anisotropy at 8: near-indistinguishable from higher on most GPUs but
        // cheaper. 0/undefined renderer caps fall back to 1 (no anisotropic filtering).
        this.maxAnisotropy = Math.max(1, Math.min(8, config.maxAnisotropy ?? 8));
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
            const records = await this.datasource.module([Number(id)]);
            const rec = records?.[id] ?? records?.[Number(id)];
            if (!rec || !rec.format) {
                throw new Error(`[ResourceManager] no model record for id ${id}`);
            }
            const url = this.resolveUrl(rec.raw);
            const template = await this.loader.parse(rec.format, url);

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
                refCount: 0
            };
            this.modelEntries.set(id, entry);
            return entry;
        });

        this.models.set(id, promise);
        // If the load fails, drop the cached promise so a later request can retry.
        promise.catch(() => { if (this.models.get(id) === promise) this.models.delete(id); });
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
            const records = await this.datasource.texture([Number(id)]);
            const rec = records?.[id] ?? records?.[Number(id)];
            if (!rec || (!rec.raw && !rec.format)) {
                throw new Error(`[ResourceManager] no texture record for id ${id}`);
            }
            const url = this.resolveUrl(rec.raw);
            const tex = await this.textureLoader.loadAsync(url);

            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            const rep = repeat ?? rec.repeat ?? [1, 1];
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
            this.warnIfNPOT(id, rec.raw, tex);
            tex.needsUpdate = true;

            this.textureEntries.set(id, { texture: tex, refCount: 0 });
            return tex;
        });

        this.textures.set(id, promise);
        promise.catch(() => { if (this.textures.get(id) === promise) this.textures.delete(id); });
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
        }
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
    private resolveUrl(raw: string): string {
        if (!raw) return raw;
        if (/^(https?:|data:|blob:|file:)/.test(raw)) return raw;
        if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[0-9a-z]+)$/.test(raw)) return `${this.ipfsGateway}${raw}`;
        return raw;
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
    getStats(): { models: number; textures: number; modelRefs: Record<string, number>; textureRefs: Record<string, number> } {
        const modelRefs: Record<string, number> = {};
        for (const [id, e] of this.modelEntries) modelRefs[id] = e.refCount;
        const textureRefs: Record<string, number> = {};
        for (const [id, e] of this.textureEntries) textureRefs[id] = e.refCount;
        return { models: this.modelEntries.size, textures: this.textureEntries.size, modelRefs, textureRefs };
    }

    dispose(): void {
        for (const e of this.modelEntries.values()) this.disposeObject(e.template);
        for (const e of this.textureEntries.values()) e.texture.dispose();
        this.models.clear();
        this.textures.clear();
        this.modelEntries.clear();
        this.textureEntries.clear();
    }
}
