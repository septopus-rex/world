import type { Engine } from '@engine/Engine';
import { hasIndexedDB, IdbDraftBackend } from '@engine/core/services/IdbDraftBackend';
import { LocalDataSource, SceneProvider } from '@engine/core/services/LocalDataSource';
// Authored levels are pure DATA (AuthoredLevel JSON) — content lives here with
// the client, the engine only supplies the vocabulary (levelSceneProvider).
import { AuthoredLevel, levelSceneProvider, type ContentResolver } from '@engine/core/services/AuthoredLevel';
import { Coords } from '@engine/core/utils/Coords';
import type { StylePack } from '@engine/core/spp/Variants';
import parkourLevelJson from '../../levels/parkour.level.json';
import coasterLevelJson from '../../levels/coaster.level.json';
import xianjianLevelJson from '../../levels/xianjian.level.json';
import galleryLevelJson from '../../levels/gallery.level.json';
import refineLevelJson from '../../levels/refine.level.json';
import defaultLevelJson from '../../levels/default.level.json';
import defaultWorldJson from '../../worlds/default.world.json';
import demoBlockJson from '../../blocks/demo.block.json';
import mazeBlockJson from '../../blocks/maze.block.json';
import shootingBlockJson from '../../blocks/shooting.block.json';
import poolBlockJson from '../../blocks/pool.block.json';
import tumbleBlockJson from '../../blocks/tumble.block.json';
import mahjongBlockJson from '../../blocks/mahjong.block.json';
import mahjong3dBlockJson from '../../blocks/mahjong3d.block.json';
import sandboxBlockJson from '../../blocks/sandbox.block.json';
import holdemBlockJson from '../../blocks/holdem.block.json';
import dynamicBlockJson from '../../blocks/dynamic.block.json';
import fallbackBlockJson from '../../blocks/fallback.block.json';
import { buildWorldLevel } from '../../scenes/worldHubScene';
import { resolveStylePacks, allStylePackIds } from '../../stylepacks';
import { DEMO_ASSETS } from '../../scenes/demoScene';
import { DEFAULT_PLAYER_STATE } from '../../Constants';

/** A block's 2D-map summary (render-layer only; see fetchMapCell). */
export interface MapCell {
    x: number;
    y: number;
    occupied: boolean;   // has any adjunct content
    count: number;       // adjunct instance count
    game: number;        // block.game flag (playable zone) — raw[4]
    elevation: number;   // block elevation — raw[0]
    /** Teleport anchors authored in this block (b8 slot 6) — the map's
     *  fast-travel destinations. Only STREAMED cells reveal anchors, which is
     *  the "discovered" semantic for free (specs/teleport-portal.md §3). */
    anchors: { name: string; e: number; n: number }[];
}

export interface SeptopusPlayerState {
    block: [number, number];
    world: string | number;
    position: [number, number, number]; // [X, Y, Z] (X=East, Y=North, Z=Alt)
    rotation: [number, number, number]; // [X, Y, Z] (Euler Z-Up)
    stop: { on: boolean; adjunct: string; index: number };
    extend: number;
    posture: number;
}

/**
 * WorldContent — the loader's CONTENT CORE, extracted from DesktopLoader
 * (2026-07 god-object split). This is the single owner of the state every other
 * concern used to reach into the loader for:
 *
 *   · level identity  — `?level` selection, the active AuthoredLevel document,
 *     its ContentResolver and block provider, the soft-vs-authored start rule
 *   · the data face   — the IDataSource method bodies (world/view/module/
 *     texture/stylePack) + the served world doc + the resource catalog
 *   · streaming       — LocalDataSource (seed+draft seam), the resident block
 *     window (handleGridRequest), inject/evict bookkeeping
 *   · player mirror   — playerState (live location for HUD/minimap/streaming)
 *   · derived reads   — 2D map cells, world info, avatar catalog, current
 *     block raw, authored-coordinate checks
 *
 * AiAuthoring / GameBridge / the facade depend on THIS object explicitly —
 * the coupling is now a visible constructor argument, not a grab into a
 * 1400-line class. The only seam WorldContent itself needs is a lazy `engine()`
 * accessor (blocks are injected/evicted through the engine; the draft store and
 * CAS live on the booted world).
 */
export class WorldContent {
    constructor(private engine: () => Engine | null) {}

    // ── level identity ────────────────────────────────────────────────────────

    /** `?level=<name>` selects an authored level instead of the demo court. */
    private level = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('level') : null;
    public readonly isParkour = this.level === 'parkour';
    public readonly isCoaster = this.level === 'coaster';
    private isXianjian = this.level === 'xianjian';
    private isWorld = this.level === 'world';
    private isRefine = this.level === 'refine';
    /** The OLD comprehensive demo court (game tables/editor props) — now an
     *  explicit destination; the bare entry starts in the exhibit corridor. */
    private isDemo = this.level === 'demo';

    /** "Default-world family" (bare entry + ?level=demo): the persisted
     *  location WINS over the level start (soft start); authored levels
     *  instead force their start every load. */
    public readonly isDefaultWorld = this.level == null || this.level === 'demo';

    /**
     * ContentResolver (P7): name → content for every `ref` in a level document.
     * Local-first = imported JSON under src/blocks|levels; a networked host
     * swaps this for the CAS/IPFS router WITHOUT touching any level data.
     */
    private static readonly CONTENT: Record<string, any> = {
        demo: demoBlockJson, maze: mazeBlockJson, shooting: shootingBlockJson,
        pool: poolBlockJson, tumble: tumbleBlockJson, mahjong: mahjongBlockJson,
        mahjong3d: mahjong3dBlockJson, sandbox: sandboxBlockJson, holdem: holdemBlockJson,
        dynamic: dynamicBlockJson, fallback: fallbackBlockJson,
        // Level documents are ref-able too (include composition, P4.5's local
        // half): the gallery's portal plaza includes these by name.
        xianjian: xianjianLevelJson, coaster: coasterLevelJson, parkour: parkourLevelJson,
    };
    private resolveContent: ContentResolver = (ref) => WorldContent.CONTENT[ref] ?? null;

    /** The active authored level (data document) + its block provider. Levels
     *  are JSON in src/levels/ — the engine holds no level content. */
    private activeLevel: AuthoredLevel =
        this.isParkour ? (parkourLevelJson as unknown as AuthoredLevel)
        : this.isCoaster ? (coasterLevelJson as unknown as AuthoredLevel)
        : this.isXianjian ? (xianjianLevelJson as unknown as AuthoredLevel)
        : this.isWorld ? buildWorldLevel()
        : this.isRefine ? (refineLevelJson as unknown as AuthoredLevel)
        : this.isDemo ? (defaultLevelJson as unknown as AuthoredLevel)
        // Bare entry (no ?level) = the exhibit corridor: ①–⑳ one capability per
        // block, portal plaza at the north end — the curated front door.
        : (galleryLevelJson as unknown as AuthoredLevel);
    private levelProvider = levelSceneProvider(this.activeLevel, this.resolveContent);

    /** The start an AUTHORED level forces on every load; the default world
     *  instead lets the restored (persisted) location win — its `start` is only
     *  the first-run spawn. */
    private get authoredStart() { return this.isDefaultWorld ? null : this.activeLevel.start; }

    /** The current level's spawn (Septopus block + local position). */
    public getSpawn(): { block: [number, number]; position: [number, number, number] } {
        const s = this.activeLevel.start;
        return { block: [...s.block] as [number, number], position: [...s.position] as [number, number, number] };
    }

    /** Does the ACTIVE level document author this coordinate (own blocks or any
     *  include, offset-aware)? The post-P7 replacement for the retired scene
     *  registry — AI build targets must not clobber authored content, and a
     *  persisted location is only restorable where the level has ground. */
    public authoredCoord(bx: number, by: number, lvl: AuthoredLevel = this.activeLevel): boolean {
        if (lvl.blocks.some((b) => b.x === bx && b.y === by)) return true;
        for (const inc of lvl.include ?? []) {
            const [dx, dy] = inc.offset ?? [0, 0];
            if (inc.level && this.authoredCoord(bx - dx, by - dy, inc.level)) return true;
        }
        return false;
    }

    // ── player mirror ─────────────────────────────────────────────────────────

    // Seeded from the ACTIVE level's start (soft start — the bare entry spawns
    // in the exhibit corridor, ?level=demo in the demo court); the persisted
    // location overrides at hydrate for the default-world family, and authored
    // levels re-force their start (applyAuthoredStart/resolveStartLocation).
    public playerState: SeptopusPlayerState = {
        ...DEFAULT_PLAYER_STATE,
        block: [...this.activeLevel.start.block] as [number, number],
        position: [...this.activeLevel.start.position] as [number, number, number],
        rotation: [...this.activeLevel.start.rotation] as [number, number, number],
    };

    // Live mirror of the player's location for the minimap/HUD/extend bookkeeping.
    // Durable persistence is engine-owned (DraftStore meta 'player', restored by
    // Engine.hydrateDrafts) — this never writes to localStorage.
    public mirrorState(partial: Partial<SeptopusPlayerState>): void {
        this.playerState = { ...this.playerState, ...partial };
        if (!this.playerState.extend || this.playerState.extend < 2) {
            this.playerState.extend = 2;
        }
    }

    /** An authored level starts at its own spawn (not the demo/saved spawn) —
     *  applied to the pre-boot playerState before bootWorld. */
    public applyAuthoredStart(): void {
        const s = this.authoredStart;
        if (!s) return;
        this.playerState = { ...this.playerState, block: s.block, position: s.position, rotation: s.rotation };
    }

    /**
     * Post-hydrate location resolution: the engine holds the authoritative
     * restored location; decide what actually wins for THIS level.
     *   · default-world family + persisted spot HAS ground here → restored wins
     *   · default-world family + stale cross-level spot (no ground) → level start
     *   · authored level → its start, always (ignore any hydrate restore)
     * Mutates playerState (the streaming centre) and, where the start is forced,
     * moves the live transform off hydrate's restore so we don't spawn in the void.
     */
    public resolveStartLocation(): void {
        const engine = this.engine();
        if (!engine) return;
        const authored = this.authoredStart;
        const restored = engine.getPlayerSeptopusLocation();
        // A persisted location is only usable if the ACTIVE level has GROUND
        // there — the level authors that coord OR carries a `fallback` ground
        // template (ground everywhere). Without this, a location saved in one
        // level (e.g. the demo court) restored into another (the exhibit
        // corridor, no fallback) drops the player into the void →
        // "nothing renders". base-data: levels share worldId-0 persistence.
        const hasFallback = !!(this.activeLevel as any).fallback;
        const locHasGround = (b: [number, number]) => hasFallback || this.authoredCoord(b[0], b[1]);
        const forceStartAt = (loc: { block: [number, number]; position: [number, number, number]; rotation?: [number, number, number] }) => {
            const w = engine.getWorld() as any;
            const pid = w?.queryEntities('TransformComponent', 'InputStateComponent')[0];
            const t = pid !== undefined ? w.getComponent(pid, 'TransformComponent') : null;
            if (t) {
                const e = Coords.septopusToEngine(loc.position, loc.block);
                t.position[0] = e[0]; t.position[1] = e[1]; t.position[2] = e[2]; t.dirty = true;
            }
        };
        if (restored && !authored && locHasGround(restored.block)) {
            this.playerState = {
                ...this.playerState,
                block: restored.block, position: restored.position, rotation: restored.rotation,
            };
        } else if (!authored) {
            // Default-world family but the persisted spot has no ground in THIS
            // level (cross-level stale location) — fall back to the level start.
            const s = this.activeLevel.start;
            forceStartAt(s);
            this.playerState = {
                ...this.playerState,
                block: [...s.block] as [number, number], position: [...s.position] as [number, number, number], rotation: [...s.rotation] as [number, number, number],
            };
        } else {
            // Authored levels restart at their start on every load — force it,
            // ignoring any saved position hydrateDrafts may have restored.
            forceStartAt(authored);
        }
    }

    // ── the data face (IDataSource method bodies) ─────────────────────────────

    /** The world document actually served by world() (chain-injected or bundled)
     *  — sync readers like avatarCatalog() consult it. */
    private _worldDoc: any = null;

    /** Default-world family: the first-run spawn is the ACTIVE level's start
     *  (corridor for the bare entry, demo court for ?level=demo) — the config
     *  doc's own player.start is only the last-resort fallback. Persisted
     *  location still wins (hydrate overrides after boot). */
    private withSoftStart(cfg: any): any {
        if (this.isDefaultWorld && this.activeLevel?.start && cfg?.player) {
            cfg.player.start = JSON.parse(JSON.stringify(this.activeLevel.start));
        }
        return cfg;
    }

    /** Apply the PERSISTED avatar pick to the config BEFORE the player is created,
     *  so the boot avatar is already the chosen one — no default→saved flash
     *  (e.g. soldier→robot). Reads the same IndexedDB the DraftStore uses (worldId
     *  0, key 'avatar'); the post-hydrate setAvatar then reconciles as a no-op. */
    private async withSavedAvatar(cfg: any): Promise<any> {
        if (!hasIndexedDB() || !cfg?.player?.avatar) return cfg;
        try {
            const saved = Number(await new IdbDraftBackend().loadMeta?.(0, 'avatar'));
            if (!Number.isFinite(saved)) return cfg;
            const entry = this.avatarCatalog().find((a) => a.id === saved);
            if (entry) { cfg.player.avatar.resource = saved; cfg.player.avatar.facing = entry.facing; }
        } catch { /* no saved pick / IDB unavailable — keep the config default */ }
        return cfg;
    }

    /** Attach the DECLARED physique of whatever avatar resource ended up
     *  effective (doc default or saved pick) from its catalog entry — the
     *  engine reads `player.avatar.physique` when the boot model lands. An
     *  undeclared avatar carries none (world-baseline body). */
    private withAvatarPhysique(cfg: any): any {
        const av = cfg?.player?.avatar;
        if (!av) return cfg;
        const entry = this.avatarCatalog().find((a) => a.id === Number(av.resource));
        if (entry?.physique) av.physique = { ...entry.physique };
        else delete av.physique;
        return cfg;
    }

    public async world(_index: number): Promise<any> {
        // Chain boot (boot-chain.md §3): the ROOT loader prelude starts fetching
        // the world config by the anchor-pinned CID and leaves the promise on
        // globalThis — when present, THAT is the world (config genuinely comes
        // from the chain root, not the bundle).
        const injected = (globalThis as any).__SEPTOPUS_WORLD_CONFIG_PROMISE__;
        if (injected) {
            const cfg = await injected;
            if (cfg) { this._worldDoc = cfg; return this.withAvatarPhysique(await this.withSavedAvatar(this.withSoftStart(JSON.parse(JSON.stringify(cfg))))); }
        }
        // World CONFIG is DATA (src/worlds/default.world.json, P7) — avatar
        // resource/facing are baked into the doc; a saved pick overrides after
        // hydrate. Swap the backing file (or a CID fetch) to change worlds.
        this._worldDoc = defaultWorldJson;
        return this.withAvatarPhysique(await this.withSavedAvatar(this.withSoftStart(JSON.parse(JSON.stringify(defaultWorldJson)))));
    }

    public async view(x: number, y: number, ext: number): Promise<any> {
        // Effective neighbourhood window (scene seed + local draft overlay) from
        // the unified block seam — callable for the 2D map / tooling too.
        return this.localData ? this.localData.view(x, y, ext) : null;
    }

    /** Resource record cache: resource id → { type, format, raw=CID, repeat?, size? }. */
    private _resCatalog = new Map<number, { type: string; format: string; raw: string; repeat?: [number, number]; size?: [number, number] }>();

    /**
     * Resolve a resource id to a content-addressed record, ingesting it into the
     * IPFS store on first use ("ipfs add"): fetch the seed file → put bytes into
     * engine.ipfs → CID. Thereafter all bytes are fetched through the router by
     * CID — no hardcoded path leaves this method. Returns null for unknown ids.
     */
    private async ingestAsset(id: number) {
        const cached = this._resCatalog.get(id);
        if (cached) return cached;
        const asset = DEMO_ASSETS.find((a) => a.id === id);
        const router = this.engine()?.ipfs;
        if (!asset || !router) return null;
        const resp = await fetch(asset.src);
        if (!resp.ok) throw new Error(`[WorldContent] asset fetch failed: ${asset.src} (${resp.status})`);
        const cid = await router.put(new Uint8Array(await resp.arrayBuffer()));
        const rec = { type: asset.type, format: asset.format, raw: cid, ...(asset.repeat ? { repeat: asset.repeat } : {}), ...(asset.size ? { size: asset.size } : {}) };
        this._resCatalog.set(id, rec);
        return rec;
    }

    public async module(ids: number[]): Promise<any> {
        const out: Record<string, any> = {};
        for (const id of ids) {
            const rec = await this.ingestAsset(id);
            if (rec && rec.type !== 'texture') out[id] = rec;
        }
        return out;
    }

    public async texture(ids: number[]): Promise<any> {
        const out: Record<string, any> = {};
        for (const id of ids) {
            const rec = await this.ingestAsset(id);
            if (rec && rec.type === 'texture') out[id] = rec;
        }
        return out;
    }

    /**
     * Resolve external SPP StylePacks by ref (id or content CID) — the IDataSource
     * seam (spp-protocol-full.md §3.B). Packs are DATA in src/stylepacks/, not
     * engine code; this stands in for an IPFS/CAS fetch.
     */
    public async stylePack(refs: string[]): Promise<Record<string, StylePack>> {
        return resolveStylePacks(refs);
    }

    /** Local-first: resolve every content StylePack through the seam and register
     *  it into the engine, so listStyles()/setStyleOverride() and any block theme
     *  reference resolve. (A server tier resolves lazily per block instead.) */
    public async registerStylePacksAtBoot(): Promise<void> {
        const engine = this.engine();
        if (!engine) return;
        const packs = await this.stylePack(allStylePackIds());
        for (const pack of Object.values(packs)) engine.registerStylePack(pack);
    }

    /** World identity for HUD readouts: id + display nickname (from the served
     *  world doc, base-data D7). */
    public worldInfo(): { id: number; nickname: string } {
        const doc = this._worldDoc ?? {};
        return {
            id: Number(doc?.world?.index ?? this.playerState.world ?? 0),
            nickname: String(doc?.world?.nickname ?? 'Genesis'),
        };
    }

    /** Selectable avatars for the frontend picker. `facing` = per-model yaw
     *  correction (radians) aligning each GLTF's authored forward with Septopus
     *  north (protocol avatar-animation.md). `physique` = the avatar's DECLARED
     *  visual body (height = scale target, eyeHeight = camera; player.md §3) —
     *  omitted entries fall back to the world physique baseline, declared ones
     *  are world-clamped by the engine. DATA, not code (base-data D1): the
     *  catalog rides the world doc; a chain-injected config missing the field
     *  falls back to the bundled document. */
    public avatarCatalog(): { id: number; label: string; facing: number; physique?: { height?: number; eyeHeight?: number } }[] {
        const fromDoc = (doc: any) => doc?.player?.avatarCatalog;
        const list = fromDoc(this._worldDoc) ?? fromDoc(defaultWorldJson) ?? [];
        const physiqueOf = (a: any): { height?: number; eyeHeight?: number } | undefined => {
            const h = Number(a?.physique?.height), e = Number(a?.physique?.eyeHeight);
            const out: { height?: number; eyeHeight?: number } = {};
            if (Number.isFinite(h) && h > 0) out.height = h;
            if (Number.isFinite(e) && e > 0) out.eyeHeight = e;
            return out.height != null || out.eyeHeight != null ? out : undefined;
        };
        return list.map((a: any) => ({ id: Number(a.id), label: String(a.label ?? a.id), facing: Number(a.facing) || 0, physique: physiqueOf(a) }));
    }

    // ── streaming (the resident block window) ─────────────────────────────────

    private loadedBlockKeys: Set<string> = new Set();
    /** Block-data seam: unifies the scene seed with the local draft overlay.
     *  Built once draftStore is hydrated (buildLocalData). */
    private localData: LocalDataSource | null = null;

    public get loadedCount(): number { return this.loadedBlockKeys.size; }
    /** Mark a block resident (callers that inject outside handleGridRequest —
     *  AI previews, stamped scenes — keep the eviction bookkeeping honest). */
    public markLoaded(bx: number, by: number): void { this.loadedBlockKeys.add(`${bx}_${by}`); }

    /** The unified block seam: one SceneProvider (level-document seed) + the
     *  now-hydrated DraftStore + the content-addressed block store. */
    public buildLocalData(): void {
        const engine = this.engine();
        if (!engine) return;
        this.localData = new LocalDataSource(
            { block: (x, y) => this.sceneBlock(x, y) } as SceneProvider,
            engine.getWorld()!.draftStore,
            0,
            engine.getWorld()!.blockCas,
        );
    }

    /** Effective block (seed + draft overlay); null before the seam is up. */
    public blockAt(x: number, y: number): { raw: any[] } | null {
        return this.localData ? this.localData.blockAt(x, y) : null;
    }

    /**
     * SceneProvider seed: the base authored raw for a block, BEFORE local drafts
     * (LocalDataSource overlays those). ONE path (P7): the active level document
     * — the DEFAULT world is itself default.level.json (9 block refs + the
     * declared `fallback` ground for every other coordinate).
     */
    private sceneBlock(x: number, y: number): any[] {
        return this.levelProvider.block(x, y) as any[];
    }

    public async handleGridRequest(center: [number, number]): Promise<void> {
        const engine = this.engine();
        if (!engine) return;
        const extend = this.playerState.extend;
        const requiredKeys: string[] = [];

        for (let dx = -extend; dx <= extend; dx++) {
            for (let dy = -extend; dy <= extend; dy++) {
                requiredKeys.push(`${center[0] + dx}_${center[1] + dy}`);
            }
        }

        (engine.getWorld() as any)?.blocks.syncVisibility(requiredKeys);

        // Bounded window — match the old engine's cross() algorithm: any loaded
        // block OUTSIDE the required window is evicted IMMEDIATELY, so the resident
        // set stays exactly (2*extend+1)^2 regardless of how far/fast the player
        // roams. (A wall-clock TTL grace used to balloon the set into the hundreds
        // under fast traversal, tanking the frame rate.)
        const required = new Set(requiredKeys);
        for (const k of [...this.loadedBlockKeys]) {
            if (required.has(k)) continue;
            const [ex, ey] = k.split('_').map(Number);
            engine.removeBlock(ex, ey);
            this.loadedBlockKeys.delete(k);
        }

        const missing = requiredKeys.filter(k => !this.loadedBlockKeys.has(k));
        if (missing.length === 0 || !this.localData) return;

        // Pull the effective window (scene seed + draft overlay) from the unified
        // seam in ONE call, then inject only the not-yet-resident blocks.
        const missingSet = new Set(missing);
        for (const block of this.localData.view(center[0], center[1], extend)) {
            const key = `${block.x}_${block.y}`;
            if (!missingSet.has(key)) continue;
            engine.injectBlock({ x: block.x, y: block.y, adjuncts: block.raw, elevation: block.raw[0] });
            this.loadedBlockKeys.add(key);
        }
    }

    // ── authoring conveniences on the same seam ───────────────────────────────

    /**
     * DEV TOOL — stamp the demo test scene onto a block as a PERSISTENT draft, so
     * it survives reload and can be edited/tested. The frozen demo block works at
     * ANY coordinate: its trigger targets are block-relative (adj_~_~_…).
     */
    public stampTestScene(bx: number, by: number): void {
        const engine = this.engine();
        if (!engine || !this.localData) return;
        const raw = JSON.parse(JSON.stringify(demoBlockJson));
        engine.getWorld()!.draftStore.save(0, bx, by, raw);   // persist
        // Re-materialise FROM the draft: BlockSystem reads the raw at inject time,
        // so swap the live block by remove + re-inject the now-merged content.
        engine.removeBlock(bx, by);
        const merged = this.localData.blockAt(bx, by);
        engine.injectBlock({ x: bx, y: by, adjuncts: merged.raw, elevation: merged.raw[0] });
        this.loadedBlockKeys.add(`${bx}_${by}`);
        console.log(`[Loader] stamped test scene onto block ${bx}_${by} (persisted)`);
    }

    /**
     * Publish the current effective block (seed + local edits) into the CAS and
     * return its content id (CID) — the 第三期「发布块到 CAS」primitive.
     * DraftStore stays the working copy.
     */
    public async publishBlock(bx: number, by: number): Promise<string | null> {
        if (!this.localData) return null;
        const cid = await this.localData.publish(bx, by);
        if (cid) console.log(`[Loader] published block ${bx}_${by} → ${cid}`);
        return cid;
    }

    /** Raw data (5-slot BlockRaw + draft flag) of the block the player stands in
     *  — the effective seed+draft merge from the data-source seam. */
    public async currentBlockRaw(): Promise<{ block: [number, number]; raw: any; isDraft: boolean } | null> {
        const [bx, by] = this.playerState.block;
        const blocks = await this.view(bx, by, 0);
        const b = Array.isArray(blocks) ? blocks.find((k: any) => k.x === bx && k.y === by) : null;
        return b ? { block: [bx, by], raw: b.raw, isDraft: !!b.isDraft } : null;
    }

    // ── 2D map (same data seam, no 3D entities) ───────────────────────────────

    /** World grid dimensions (block count per axis); cells outside are void. */
    public get worldRange(): [number, number] {
        const r = (this.engine()?.getWorld() as any)?.config?.world?.range;
        return Array.isArray(r) && r.length === 2 ? [r[0], r[1]] : [4096, 4096];
    }

    /** Lightweight 2D summary of one block, derived from its raw — no meshes,
     *  no ECS entities. raw = [elevation, status, adjunctsRaw, animations, game]. */
    public async fetchMapCell(x: number, y: number): Promise<MapCell> {
        try {
            // Effective block (seed + draft overlay) when the seam is up; before
            // boot fall back to the raw seed.
            const raw: any[] = this.localData ? this.localData.blockAt(x, y).raw : this.sceneBlock(x, y);
            const groups: any[] = Array.isArray(raw[2]) ? raw[2] : [];
            let count = 0;
            const anchors: { name: string; e: number; n: number }[] = [];
            for (const g of groups) {
                const rows = Array.isArray(g?.[1]) ? g[1] : [];
                count += rows.length;
                if (g?.[0] === 0x00b8) { // b8 trigger — slot 6 may declare an anchor
                    for (const row of rows) {
                        const a = row?.[6];
                        if (a && typeof a === 'object' && typeof a.name === 'string') {
                            anchors.push({ name: a.name, e: row?.[1]?.[0] ?? 8, n: row?.[1]?.[1] ?? 8 });
                        }
                    }
                }
            }
            return {
                x, y, count,
                occupied: count > 0,
                game: typeof raw[4] === 'number' ? raw[4] : 0,
                elevation: typeof raw[0] === 'number' ? raw[0] : 0,
                anchors,
            };
        } catch {
            return { x, y, count: 0, occupied: false, game: 0, elevation: 0, anchors: [] };
        }
    }

    // ── live content ──────────────────────────────────────────────────────────

    /**
     * Live-content handler: a 'motif' message carries { adjunctId, hash }. Point
     * the named motif's texture at that content hash (an IPFS CID) and re-expand
     * it — the generated geometry rebuilds with the new image, resolved through
     * the IPFS layer. Engine-side endpoint of the live pipeline:
     *   (sim) WebSocket → ILiveSource → LiveSystem → world.events → here.
     */
    public applyLiveMotifUpdate(data: any): void {
        const world = this.engine()?.getWorld() as any;
        if (!world || !data || data.adjunctId == null) return;
        const targetId = String(data.adjunctId);
        const hash = data.hash != null ? String(data.hash) : null;
        for (const eid of world.getEntitiesWith(['AdjunctComponent'])) {
            const a = world.getComponent(eid, 'AdjunctComponent');
            if (a?.adjunctId !== targetId) continue;
            a.stdData.params = { ...(a.stdData.params || {}), texture: hash };
            world.systems.findSystemByName('BlockSystem')?.reexpandSource?.(world, eid);
            break;
        }
    }
}
