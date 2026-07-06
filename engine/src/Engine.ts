import { World } from './core/World';
import type { RenderEngine } from './render/RenderEngine';
import { IDataSource } from './core/services/DataSource';
import { IUIProvider } from './core/services/UIProvider';
import { DefaultUIProvider } from './core/services/DefaultUIProvider';
import { EventUIProxy } from './core/services/EventUIProxy';
import { IChainPublisher } from './core/services/IChainPublisher';
import { ExportService } from './core/services/ExportService';
import { AdjunctLoader } from './core/services/AdjunctLoader';
import { descriptorToDefinition } from './core/services/DynamicAdjunct';
import { registerDynamicAdjunct, clearDynamicAdjuncts } from './core/services/AdjunctRegistry';
import { Coords } from './core/utils/Coords';
import { AdjunctType } from './core/types/AdjunctType';
import { registerStylePack, listSppThemes, setStyleOverride, getStyleOverride, type StylePack } from './core/spp/Variants';
import { GlobalConfig } from './core/GlobalConfig';
import { EntityFactory } from './core/EntityFactory';
import { WorldConfig, FullWorldConfig } from './core/types/WorldConfig';
import { SystemMode } from './core/types/SystemMode';

export { SystemMode };

export interface EngineServices {
    api: IDataSource;
    ui?: IUIProvider;
    /**
     * UI rendering mode:
     *   'default' — use provider (DefaultUIProvider or injected) AND emit ui:* events
     *   'events'  — emit ui:* events ONLY, no built-in DOM rendering
     */
    uiMode?: 'default' | 'events';
    /** Optional chain publisher for uploading edits to blockchain */
    publisher?: IChainPublisher;
    /**
     * Optional injected render engine. Omit in production (the real WebGL
     * RenderEngine is created by default). Tests inject a headless NullRenderEngine
     * so a World can boot and step without a GPU/DOM.
     */
    renderer?: RenderEngine;
    /** Injectable resource loaders (tests pass fakes + fetch counters). */
    resources?: import('./render/ResourceManager').ResourceManagerConfig;
    /** Durable draft storage backend (default: IndexedDB in browsers). */
    draftBackend?: import('./core/services/DraftStore').IDraftBackend | null;
    /** Trigger-action executor (default: LocalActuator; chain builds inject their own). */
    actuator?: import('./core/services/Actuator').IActuator;
    /** Game-Setting external-API transport (default: NullGameApi; host injects its own). */
    gameApi?: import('./core/services/IGameApi').IGameApi;
    /** External realtime transport (WebSocket/SSE/…). Default: NullLiveSource;
     *  the client implements it and owns the actual connection. */
    liveSource?: import('./core/services/LiveSource').ILiveSource;
    config?: any;
}

/** Old event names → migrated typed-queue channels (deprecation shim; spec §3).
 *  Removed once `grep -rE "<old names>" engine/src client/desktop/src` is zero. */
const LEGACY_EVENT_MAP: Record<string, string> = {
    'interact': 'interact.primary',
    'context-interact': 'interact.context',
    'pickup_item': 'item.pickup',
    'consume_item': 'item.consume',
    'inventory_updated': 'inventory.updated',
    'inventory_full': 'inventory.full',
    'grid:need': 'block.need',
    'player:state': 'player.state',
    'world:mode_changed': 'system.mode',
    'world:draft_saved': 'edit.draft_saved',
    'world:upload_request': 'edit.upload_request',
};

export interface EngineOnOptions {
    target?: number;
    key?: string;
    once?: boolean;
}

export class Engine {
    private world: World | null = null;
    private services: EngineServices;
    private containerId: string;
    private preBootSubs: Array<{ type: string; callback: (payload: any, ev?: any) => void; opts?: EngineOnOptions }> = [];
    /** origEventName → (callback → combined unsubscribe). Keyed per (type, cb),
     *  fixing the old eventWrappers single-key clobber. */
    private subscriptions = new Map<string, Map<Function, () => void>>();
    private warnedLegacy = new Set<string>();
    /** Lazily-created sandboxed loader for dynamic adjuncts (browser-only Worker). */
    private adjunctLoader: AdjunctLoader | null = null;

    constructor(containerId: string, services: EngineServices) {
        this.containerId = containerId;
        this.services = services;
    }

    public async bootWorld(worldIndex: number, playerStart?: any) {
        // 1. Fetch the specific World Config (King's Config)
        const kingConfig: WorldConfig = await this.services.api.world(worldIndex);

        // 2. Merge with Global Constants (Hierarchical Merging)
        const fullConfig: FullWorldConfig = {
            ...GlobalConfig,
            ...kingConfig,
            world: {
                ...GlobalConfig.world,
                ...kingConfig.world,
                containerId: this.containerId // Inject runtime container
            },
            time: {
                ...GlobalConfig.time,
                // Individual worlds currently don't override global time epoch/speed in this implementation
                // but could be expanded here if needed.
            }
        };

        // 3. Coordinate conversion for player start
        const start = playerStart || fullConfig.player.start;
        const enginePos = Coords.septopusToEngine(start.position, start.block);
        const engineRot = Coords.septopusRotationToEngine(start.rotation || [0, 0, 0]);

        fullConfig.player.start = { ...start, position: enginePos, rotation: engineRot };

        this.world = new World(fullConfig, {
            renderEngine: this.services.renderer,
            dataSource: this.services.api,
            resources: this.services.resources,
            draftBackend: this.services.draftBackend,
            actuator: this.services.actuator,
            gameApi: this.services.gameApi,
            liveSource: this.services.liveSource
        });

        // 3.5 UI Orchestration
        const uiMode = this.services.uiMode || 'default';
        let baseProvider: IUIProvider | null = this.services.ui || null;

        // In 'default' mode, ensure there is always a base provider
        if (!baseProvider && uiMode === 'default') {
            baseProvider = new DefaultUIProvider(this.containerId);
        }

        // Wrap with EventUIProxy — always emits ui.* events (boundary-only
        // channels on the typed queue), optionally delegates to the provider.
        // Legacy "ui:show-group" names normalize to the EventMap's "ui.show_group".
        const emitter = (event: string, data: any) => {
            const type = event.replace(':', '.').replace(/-/g, '_');
            this.world?.events.emit(type as any, data);
        };
        const uiProxy = new EventUIProxy(emitter, baseProvider, uiMode);
        this.world.setUIProvider(uiProxy);

        // 4. Initialize Player
        const player = this.world.setupPlayer(fullConfig.player.start.position, fullConfig.player.start.rotation);


        this.preBootSubs.forEach(sub => this.on(sub.type, sub.callback, sub.opts));
        this.preBootSubs = [];

        if (this.services.ui && typeof (this.services.ui as any).showToast === 'function') {
            (this.services.ui as any).showToast("Environment Ready");
        }
    }

    public start() {
        this.world?.start();
    }

    /**
     * Advance the simulation by one fixed step (deterministic). Used by tests to
     * pump the world frame-by-frame instead of the rAF-driven start() loop.
     */
    public step(dt: number) {
        this.world?.step(dt);
    }

    public stop() {
        this.world?.stop();
    }

    /** Returns the block's EntityId so callers can make targeted block.loaded
     *  subscriptions (boot gates). */
    public injectBlock(stdData: any): number | undefined {
        if (this.world?.blocks) {
            const blockEntity = this.world.createEntity();
            this.world.addComponent(blockEntity, "BlockComponent", {
                x: stdData.x,
                y: stdData.y,
                elevation: stdData.elevation || 0,
                world: stdData.world || 'main',
                adjuncts: stdData.adjuncts || [],
                isInitialized: false
            });
            return blockEntity;
        }
        return undefined;
    }

    /**
     * Wipe ALL local drafts + metadata for a world (RESET STATE). Awaitable so
     * the client can reload only once durable storage is actually cleared; after
     * the reload, hydrate finds nothing and blocks fall back to the scene seed.
     */
    public async clearDrafts(worldId: number = 0): Promise<void> {
        await this.world?.draftStore.clearWorld(worldId);
    }

    /**
     * Load every persisted draft for a world into the DraftStore's sync cache,
     * and restore the player's persisted inventory. Call AFTER bootWorld and
     * BEFORE injecting the first block — BlockSystem reads drafts synchronously
     * while materializing blocks.
     */
    public async hydrateDrafts(worldId: number = 0): Promise<void> {
        const world = this.world;
        if (!world) return;
        await world.draftStore.hydrate(worldId);

        // Gameplay session: world flags + durable oneTime trigger consumption.
        const session = await world.draftStore.loadMeta(worldId, 'session');
        if (session && typeof session === 'object') {
            Object.assign(world.globalFlags, session.flags ?? {});
            world.sessionTriggerFired = { ...(session.triggerFired ?? {}) };
        }

        const savedItems = await world.draftStore.loadMeta(worldId, 'inventory');
        if (Array.isArray(savedItems)) {
            const players = world.queryEntities("InventoryComponent", "InputStateComponent");
            const inv = players.length > 0
                ? world.getComponent<any>(players[0], "InventoryComponent") : null;
            if (inv) {
                inv.items = savedItems;
                world.events.emit('inventory.updated', { entity: players[0], inventory: inv });
            }
        }

        // Player location: restore the last walked-to spot (persisted by
        // CharacterController on the 'player' meta channel). Validated + void-
        // guarded; on missing/malformed data the player stays at the spawn point
        // bootWorld already set, so this never strands the player.
        const savedLoc = await world.draftStore.loadMeta(worldId, 'player');
        if (Engine.isValidPlayerLoc(savedLoc)) {
            const players = world.queryEntities("TransformComponent", "InputStateComponent");
            const eid = players[0];
            const trans = eid !== undefined ? world.getComponent<any>(eid, "TransformComponent") : null;
            const body = eid !== undefined ? world.getComponent<any>(eid, "RigidBodyComponent") : null;
            if (trans) {
                const pos = Coords.septopusToEngine(savedLoc.position, savedLoc.block);
                const rot = Coords.septopusRotationToEngine(savedLoc.rotation || [0, 0, 0]);
                trans.position[0] = pos[0]; trans.position[1] = pos[1]; trans.position[2] = pos[2];
                trans.rotation[0] = rot[0]; trans.rotation[1] = rot[1]; trans.rotation[2] = rot[2];
                trans.dirty = true;
                if (body) {
                    body.velocity[0] = body.velocity[1] = body.velocity[2] = 0;
                    body.isGrounded = false;
                }
            }
        }
    }

    /** Shape/sanity gate for a persisted player location before it is trusted to
     *  move the player: finite block + position, and an altitude that is not the
     *  tell-tale "fell through into the void" value. */
    private static isValidPlayerLoc(loc: any): loc is { block: [number, number]; position: [number, number, number]; rotation?: [number, number, number] } {
        if (!loc || typeof loc !== 'object') return false;
        const fin = (a: any, n: number) => Array.isArray(a) && a.length === n && a.every((v: any) => Number.isFinite(v));
        if (!fin(loc.block, 2) || !fin(loc.position, 3)) return false;
        if (loc.rotation !== undefined && !fin(loc.rotation, 3)) return false;
        if (loc.position[2] < -50) return false;   // void guard
        return true;
    }

    /** The local player's current location in Septopus coords, or null before
     *  bootWorld. Clients read this AFTER hydrateDrafts to preload the restored
     *  neighborhood (the engine, not the client, owns the persisted spawn). */
    public getPlayerSeptopusLocation(): { block: [number, number]; position: [number, number, number]; rotation: [number, number, number] } | null {
        const world = this.world;
        if (!world) return null;
        const eid = world.queryEntities("TransformComponent", "InputStateComponent")[0];
        if (eid === undefined) return null;
        const trans = world.getComponent<any>(eid, "TransformComponent");
        if (!trans) return null;
        const spp = Coords.engineToSeptopus(trans.position);
        return { block: spp.block, position: spp.pos, rotation: Coords.engineRotationToSeptopus(trans.rotation) };
    }

    /** Export all local drafts of a world as a versioned JSON string (P1). */
    public async exportWorldJson(worldId: number = 0): Promise<string> {
        if (!this.world) throw new Error('[Engine] exportWorldJson before bootWorld');
        return new ExportService(this.world.draftStore).exportWorld(worldId);
    }

    /** Import a previously exported JSON file into the local draft store (P1).
     *  Already-loaded blocks keep their current meshes; re-streamed or reloaded
     *  blocks pick the imported drafts up. */
    public async importWorldJson(json: string): Promise<{ worldId: number; imported: number }> {
        if (!this.world) throw new Error('[Engine] importWorldJson before bootWorld');
        return new ExportService(this.world.draftStore).importWorld(json);
    }

    /**
     * Drop `count` of an inventory item at the local player's feet (atomic:
     * bag debit + b5 adjunct spawn + draft save — see ItemSystem.dropItem).
     */
    public dropItem(itemId: string, count: number = 1): boolean {
        const world = this.world;
        if (!world) return false;
        const itemSystem = world.systems.findSystemByName('ItemSystem') as any;
        const players = world.queryEntities("InventoryComponent", "InputStateComponent");
        if (!itemSystem?.dropItem || players.length === 0) return false;
        return itemSystem.dropItem(world, players[0], itemId, count);
    }

    /** Destroy a streamed-in block and its adjuncts (frees meshes). Used by the
     *  loader's view-window eviction to bound memory as the player roams. */
    public removeBlock(x: number, y: number): void {
        const bs = this.world?.systems.findSystemByName('BlockSystem') as any;
        if (bs?.removeBlock) bs.removeBlock(this.world, x, y);
    }

    /**
     * Feed a chain-height tick to the environment (time + weather are derived from
     * block height + hash, like the old engine's slot subscription). In the
     * chain-decoupled client a mock ticker drives this so the day/night cycle and
     * weather actually advance. Without it, time stays frozen at the initial state.
     */
    public feedChainState(height: number, hash: string, intervalSeconds: number): void {
        const env = this.world?.systems.findSystemByName('EnvironmentSystem') as any;
        if (env?.onNewBlock) env.onNewBlock(this.world, height, hash, intervalSeconds);
    }

    /** Switch the camera between first-person and third-person (slight top-down). */
    public setCameraView(mode: 'first' | 'third'): void {
        const cc = this.world?.systems.findSystemByName('CharacterController') as any;
        cc?.setViewMode?.(mode);
    }

    /** Toggle first/third-person; returns the new mode (or undefined if not ready). */
    public toggleCameraView(): 'first' | 'third' | undefined {
        const cc = this.world?.systems.findSystemByName('CharacterController') as any;
        return cc?.toggleViewMode?.();
    }

    public getWorld(): World | null {
        return this.world;
    }

    /** Content-addressed resource router (CID → provider → bytes). Hosts ingest
     *  assets and register providers here. Null before bootWorld. */
    public get ipfs() {
        return this.world?.ipfs ?? null;
    }

    /** Content-addressed BLOCK store (authored block raw ↔ CID) over the same
     *  router. The data-source layer routes scene seeds through it so block
     *  content is content-addressed. Null before bootWorld. */
    public get blockCas() {
        return this.world?.blockCas ?? null;
    }

    // ── dialogue (F4) — host UI renders events, calls back through these ─────

    /** Snapshot of the active conversation (null = none). */
    public dialogueState() {
        const d = this.world?.activeDialogue;
        return d ? { adjunctId: d.adjunctId, nodeId: d.nodeId } : null;
    }
    /** Choose the i-th VISIBLE option of the current dialogue node. */
    public chooseDialogue(visibleIndex: number): void {
        this.world?.chooseDialogue(visibleIndex);
    }
    /** Close the active conversation. */
    public endDialogue(): void {
        this.world?.endDialogue();
    }

    // ── teleport (specs/teleport-portal.md) ──────────────────────────────────

    /** Anchor-gated fast travel — the SAME actuator action a content portal
     *  fires, so the destination's `when` permission applies to UI travel too.
     *  Outcome arrives as teleport.done / teleport.denied events. */
    public requestTeleport(anchor: string, block: [number, number]): void {
        const world = this.world;
        if (!world) return;
        const players = world.queryEntities("TransformComponent", "InputStateComponent");
        world.actuator.execute(
            { type: 'player', method: 'teleport', target: anchor, params: [block] } as any,
            { world, playerId: players[0] ?? null, mode: world.mode, sourceEntity: null },
        );
    }

    // ── avatar ───────────────────────────────────────────────────────────────

    /** Swap the player's avatar model at runtime (frontend picker seam). The
     *  resource id resolves through the same ResourceManager pipeline as boot;
     *  a failed load keeps the current body. */
    public setAvatar(resourceId: string | number, facing?: number): void {
        const world = this.world;
        if (!world) return;
        EntityFactory.swapAvatar(world, String(resourceId), facing);
    }

    /** Debug/verification snapshot of the live avatar: resource id, registered
     *  clips, current animation state + the clip it resolved to, and the
     *  world-space height/foot line (body-parameter checks in e2e). */
    public avatarInfo(): { resource?: string; footOffset: number | null; facing: number | null; clips: string[]; state: string | null; activeClip: string | null; height: number; minY: number } | null {
        const world = this.world;
        if (!world) return null;
        const players = world.queryEntities("AvatarComponent", "InputStateComponent");
        if (!players.length) return null;
        const av = world.getComponent<any>(players[0], "AvatarComponent");
        if (!av?.handle) return null;
        const dbg = (world.renderEngine as any).getAnimationDebug?.(av.handle) ?? null;
        // footOffset = the SCALED source-bbox bottom the controller plants feet by
        // (deterministic; the live Box3 min.y is unreliable for skinned meshes).
        const footOffset = typeof av.footOffset === 'number' ? av.footOffset : null;
        const facing = typeof av.facing === 'number' ? av.facing : null;
        return dbg ? { resource: av.resource, footOffset, facing, ...dbg } : { resource: av.resource, footOffset, facing, clips: [], state: null, activeClip: null, height: 0, minY: 0 };
    }

    // ── SPP style packs ────────────────────────────────────────────────────────

    /** Register an external StylePack (data-only theme) so SPP sources can
     *  reference it by id. The host resolves the JSON (bundled file / URL / IPFS
     *  CID) and calls this BEFORE the referencing block streams in — SPP
     *  expansion is synchronous. Returns the id, or null when the shape is
     *  invalid. Spec: docs/plan/specs/spp-protocol-full.md §3.B. */
    public registerStylePack(pack: StylePack): string | null {
        return registerStylePack(pack);
    }

    /** Every registered SPP style id (built-in + external) — feeds a style picker. */
    public listStyles(): string[] {
        return listSppThemes();
    }

    public getStyleOverride(): string | null {
        return getStyleOverride();
    }

    /** Set (or clear, with null) the world-level style override: restyles every
     *  VISUAL SPP source wholesale (structural themes like coaster are immune)
     *  and re-expands live so the swap is instant — the "秒换风格" knob. */
    public setStyleOverride(id: string | null): void {
        setStyleOverride(id);
        this.reexpandAllSpp();
    }

    private reexpandAllSpp(): void {
        const world = this.world;
        if (!world) return;
        const bs: any = world.systems.findSystemByName('BlockSystem');
        if (!bs?.reexpandSource) return;
        for (const eid of world.getEntitiesWith(['AdjunctComponent'])) {
            const a = world.getComponent<any>(eid, 'AdjunctComponent');
            if (a?.stdData?.typeId === AdjunctType.Spp) bs.reexpandSource(world, eid);
        }
    }

    /** External realtime transport (ILiveSource) feeding world.events via
     *  LiveSystem. The client subscribes()/pushes through its own implementation;
     *  this exposes whatever was injected. Null before bootWorld. */
    public get live() {
        return this.world?.liveSource ?? null;
    }

    /** Build a 3D pool table + rack on the given block (PoolSystem owns the
     *  physics; balls are a7 sphere adjunct entities it spawns and drives). */
    public setupPool(config: import('./core/systems/PoolSystem').PoolConfig): void {
        const w = this.world;
        if (w) (w.systems.findSystemByName('PoolSystem') as any)?.configure(w, config);
    }

    /** Strike the cue ball: angle in table coords (East = 0, North = +π/2),
     *  power 0..1. Returns false if a shot is already in progress. */
    public poolShoot(angleRad: number, power: number): boolean {
        const w = this.world;
        return w ? !!(w.systems.findSystemByName('PoolSystem') as any)?.shoot(w, angleRad, power) : false;
    }

    /** Build a 3D mahjong table on the given block (MahjongSystem owns the game;
     *  tiles are a2 box adjunct entities it spawns and drives — the discrete,
     *  turn-based counterpart to the pool). Deal is seeded → reproducible. */
    public setupMahjong(config: import('./core/systems/MahjongSystem').MahjongConfig): void {
        const w = this.world;
        if (w) (w.systems.findSystemByName('MahjongSystem') as any)?.configure(w, config);
    }

    /** The local human discards a tile from their hand (by stable tileId). Refused
     *  unless it's the human's turn and the game is live. Returns whether it took. */
    public mahjongDiscard(tileId: number): boolean {
        const w = this.world;
        return w ? !!(w.systems.findSystemByName('MahjongSystem') as any)?.discard(w, tileId) : false;
    }

    /** Current mahjong table state (turn/hands/discards/phase), or null. Read-only
     *  snapshot for HUDs and tests. */
    public mahjongState(): any {
        const w = this.world;
        return w ? (w.systems.findSystemByName('MahjongSystem') as any)?.snapshot(w) ?? null : null;
    }

    /** Build a 3D shooting range on the given block (ShootingRangeSystem owns the
     *  score/timer; targets are a7 sphere adjunct entities it spawns and recolours
     *  on hit — the runtime-recolour native case after pool/mahjong). */
    public setupShooting(config: import('./core/systems/ShootingRangeSystem').ShootingConfig): void {
        const w = this.world;
        if (w) (w.systems.findSystemByName('ShootingRangeSystem') as any)?.configure(w, config);
    }

    /** Fire at a target by id (null = a deliberate miss) — a no-aim convenience for
     *  HUDs/tests; clicking a target in-world does the same through the raycast
     *  path. Returns 'hit' | 'miss' (false if the range is gone). */
    public shootingFire(targetId: number | null): 'hit' | 'miss' | false {
        const w = this.world;
        return w ? (w.systems.findSystemByName('ShootingRangeSystem') as any)?.fireAtTarget(w, targetId) ?? false : false;
    }

    /** Current shooting-range state (score/shots/hits/phase/targets), or null.
     *  Read-only snapshot for HUDs and tests. */
    public shootingState(): any {
        const w = this.world;
        return w ? (w.systems.findSystemByName('ShootingRangeSystem') as any)?.snapshot(w) ?? null : null;
    }

    /** Build a 3D tumble tower (Jenga) on the given block (TumbleSystem owns the
     *  rigid-body physics via rapier; pieces are a2 box adjunct entities it spawns
     *  and drives — the first native game with a REAL physics topple). Clicking a
     *  block in-world pulls it through the raycast path. */
    public setupTumble(config: import('./core/systems/TumbleSystem').TumbleConfig): void {
        const w = this.world;
        if (w) (w.systems.findSystemByName('TumbleSystem') as any)?.configure(w, config);
    }

    /** Current tumble-tower state (standing/pulled/maxY/toppled/settled), or null.
     *  Read-only snapshot for HUDs and tests. */
    public tumbleState(): any {
        const w = this.world;
        return w ? (w.systems.findSystemByName('TumbleSystem') as any)?.snapshot(w) ?? null : null;
    }

    /** Pull a tower piece by its stable blockId (null-safe) — a no-aim convenience
     *  for HUDs/tests; clicking a block in-world does the same through the raycast
     *  path. Returns whether a piece was pulled. */
    public tumblePull(blockId: number): boolean {
        const w = this.world;
        return w ? !!(w.systems.findSystemByName('TumbleSystem') as any)?.pullById(w, blockId) : false;
    }

    /**
     * Load a DYNAMIC adjunct from sandboxed code and register it by the type-id it
     * declares, so any block referencing that id materializes it like a built-in.
     *
     * v1 is DECLARATIVE: `code` runs in the AdjunctSandbox (Web Worker, static
     * filter + shadowed globals) and must assign a plain-data descriptor
     * `hooks = { meta, render }` — the engine builds meshes via MeshFactory, so
     * dynamic code never touches Three.js. (Function-style hooks can't cross the
     * worker boundary and are rejected; imperative transforms are a future v2.)
     *
     * Async (fetch/worker); call BEFORE the referencing block streams in. Returns
     * the registered type-id. `code` may be a local string (dev/injection) or the
     * text fetched from a CID — same sandbox path either way.
     */
    public async loadDynamicAdjunct(code: string): Promise<number> {
        if (!this.adjunctLoader) this.adjunctLoader = new AdjunctLoader();
        const descriptor = await this.adjunctLoader.loadFromCode(code);
        const definition = descriptorToDefinition(descriptor);
        const typeId = definition.hooks.reg().typeId;
        registerDynamicAdjunct(typeId, definition);
        return typeId;
    }

    /** Forget all dynamically-loaded adjunct definitions (reload / test isolation). */
    public clearDynamicAdjuncts(): void {
        clearDynamicAdjuncts();
    }

    /**
     * Subscribe to an engine event. Callback receives (payload, envelope) —
     * payload-first keeps existing consumers working; the full WorldEvent rides
     * second for frame/seq/target metadata.
     *
     * Channels live on TWO buses during the event-bus migration: the typed
     * queue (migrated channels) and the legacy Map bus (the rest). We subscribe
     * both — a channel only ever emits on one of them, so no double delivery.
     * Legacy names are normalized through LEGACY_EVENT_MAP with a one-time warn.
     */
    public on(event: string, callback: (payload: any, ev?: any) => void, opts?: EngineOnOptions) {
        if (!this.world) {
            this.preBootSubs.push({ type: event, callback, opts });
            return;
        }

        let type = event;
        const mapped = LEGACY_EVENT_MAP[event];
        if (mapped) {
            if (!this.warnedLegacy.has(event)) {
                console.warn(`[Engine] event name '${event}' is deprecated — use '${mapped}'`);
                this.warnedLegacy.add(event);
            }
            type = mapped;
        }

        const unQueue = this.world.events.on(type as any, (ev: any) => callback(ev.payload, ev), {
            target: opts?.target, key: opts?.key, once: opts?.once,
        });
        const wrapper = (ev: any) => callback(ev?.payload, ev);
        this.world.on(type, wrapper);

        const world = this.world;
        const dispose = () => { unQueue(); world.off(type, wrapper); };
        let byCb = this.subscriptions.get(event);
        if (!byCb) { byCb = new Map(); this.subscriptions.set(event, byCb); }
        byCb.set(callback, dispose);
    }

    public off(event: string, callback: (payload: any) => void) {
        this.preBootSubs = this.preBootSubs.filter(sub => sub.callback !== callback);
        const dispose = this.subscriptions.get(event)?.get(callback);
        if (dispose) {
            dispose();
            this.subscriptions.get(event)!.delete(callback);
        }
    }

    /** External → queue injection (UI commands, network ingress, test pokes). */
    public send(type: string, payload: any, opts?: { target?: number; targetKey?: string; actor?: number }) {
        this.world?.events.emit(type as any, payload, opts);
    }

    public setMoveIntent(x: number, y: number) {
        this.world?.controls.setMoveIntent(x, y);
    }

    public jump() {
        this.world?.controls.triggerJump();
    }

    public lock() {
        this.world?.controls.lock();
    }

    public unlock() {
        this.world?.controls.unlock();
    }

    public setEditMode(active: boolean) {
        this.world?.setEditMode(active);
    }

    /**
     * Switch the world mode (Normal / Edit / Game / Ghost / Observe). setEditMode
     * is sugar. Entering Game is zone-gated (only inside a block.game block) —
     * returns false if refused. `force` bypasses the gate (engine-internal/tests).
     */
    public setMode(mode: SystemMode, opts?: { force?: boolean }): boolean {
        return this.world?.setMode(mode, opts) ?? false;
    }

    /** Whether the player currently stands in a playable (game-enabled) block —
     *  the precondition for entering Game mode. Driven by GameZoneSystem. */
    public isGameZoneActive(): boolean {
        return this.world?.gameZoneActive ?? false;
    }

    public getMode(): SystemMode | undefined {
        return this.world?.mode;
    }

    /** Register the available 3D models for the editor palette's module picker.
     *  The client owns the resource catalog; the engine just lists them so a
     *  creator can place a model (a4) and pick which one. */
    public setModuleCatalog(models: ReadonlyArray<{ id: number | string; label: string }>): void {
        if (this.world) this.world.moduleCatalog = models;
    }

    public injectStyle(tokens: Record<string, string>) {
        this.services.ui?.injectStyle?.(tokens);
    }

    public ui(): IUIProvider | undefined {
        return this.services.ui;
    }

    public dispose() {
        this.world?.dispose();
    }
}
