import { RenderEngine } from '../render/RenderEngine';
import { RenderPipeline } from '../render/RenderPipeline';
import { Coords } from './utils/Coords';
import { ParticleCell, ParticleFace } from './types/ParticleCell';
import { ECSRegistry } from './ECSRegistry';
import { SystemManager } from './SystemManager';
import { WorldBridge } from './WorldBridge';
import { EntityFactory } from './EntityFactory';
import { IpfsRouter, MemoryCasProvider } from './services/ipfs';

// Systems (Imported only for registration in constructor or specialized logic)
import { PhysicsSystem } from './systems/PhysicsSystem';
import { LiveSystem } from './systems/LiveSystem';
import { CharacterController } from './movement/CharacterController';
import { InputProvider } from './systems/InputProvider';
import { BlockSystem } from './systems/BlockSystem';
import { EnvironmentSystem } from './systems/EnvironmentSystem';
import { VisualSyncSystem } from './systems/VisualSyncSystem';
import { CoasterSystem } from './systems/CoasterSystem';
import { MinimapSystem } from './systems/MinimapSystem';
import { AnimationSystem } from './systems/AnimationSystem';
import { GridSystem } from './systems/GridSystem';
import { GameZoneSystem } from './systems/GameZoneSystem';
import { GameRuntimeSystem } from './systems/GameRuntimeSystem';
import { AdjunctSystem } from './systems/AdjunctSystem';
import { RaycastInteractionSystem } from './systems/RaycastInteractionSystem';
import { TriggerSystem } from './systems/TriggerSystem';
import { InventorySystem } from './systems/InventorySystem';
import { ItemSystem } from './systems/ItemSystem';
import { HealthSystem } from './systems/HealthSystem';
import { ItemDropSystem } from './systems/ItemDropSystem';
import { ParticleEffectSystem } from './systems/ParticleEffectSystem';
import { BlockLODSystem } from './systems/BlockLODSystem';
import { EditSystem } from './systems/EditSystem';

import { FullWorldConfig } from './types/WorldConfig';
import { SystemMode } from './types/SystemMode';
import { IUIProvider } from './services/UIProvider';
import { IDataSource } from './services/DataSource';
import { DraftStore, IDraftBackend, InMemoryDraftBackend } from './services/DraftStore';
import { IActuator, LocalActuator } from './services/Actuator';
import { ILiveSource, NullLiveSource } from './services/LiveSource';
import { IGameApi, NullGameApi } from './services/IGameApi';
import { GameSetting } from './types/GameSetting';
import { GameRuntime } from './services/GameRuntime';
import { EventQueue } from './events/EventQueue';
import { IdbDraftBackend, hasIndexedDB } from './services/IdbDraftBackend';
import { ResourceManager, ResourceManagerConfig } from '../render/ResourceManager';
import { MeshFactory } from '../render/MeshFactory';

export type EntityId = number;
export type ComponentType = string;
export type ComponentData = any;

export interface ISystem {
    update(world: World, dt: number): void;
}

export interface GameEvent {
    type: string;
    payload: any;
    source?: EntityId;
}

/**
 * Injectable dependencies for headless / test boot. Production passes nothing
 * and the real WebGL RenderEngine + DOM InputProvider are constructed by default.
 * Tests inject a NullRenderEngine (no WebGL/DOM) to tick systems headlessly.
 */
export interface WorldDeps {
    renderEngine?: RenderEngine;
    inputProvider?: InputProvider;
    /** Data source for external resources (models/textures). Engine passes its api. */
    dataSource?: IDataSource;
    /** Injectable resource loaders (tests pass fakes + fetch counters). */
    resources?: ResourceManagerConfig;
    /** Durable draft storage. Default: IndexedDB in browsers, in-memory in Node. */
    draftBackend?: IDraftBackend | null;
    /** Trigger-action executor. Default: LocalActuator (pure local mutation). */
    actuator?: IActuator;
    /** Game-Setting external-API transport. Default: NullGameApi (no external API). */
    gameApi?: IGameApi;
    /** External realtime transport (WebSocket/SSE/…). Default: NullLiveSource. */
    liveSource?: ILiveSource;
}

/** Inert data source so a World constructed without one never crashes on resource calls. */
const NULL_DATA_SOURCE: IDataSource = {
    world: async () => ({}),
    view: async () => null,
    module: async () => ({}),
    texture: async () => ({})
} as unknown as IDataSource;

/**
 * World: The Single Source of Truth & Main Orchestrator.
 * Handles ECS registry, Game Loop, and Integration of Systems.
 * 
 * DESIGN: WORLD IS NOW A MINIMAL ORCHESTRATOR.
 */
export class World {
    // 1. Core State & Managers
    private registry: ECSRegistry = new ECSRegistry();
    public systems: SystemManager = new SystemManager();
    private bridge: WorldBridge;

    // 2. Rendering (Abstracted)
    public renderEngine: RenderEngine;
    public pipeline: RenderPipeline;

    /**
     * Load-once-by-id authority for external models/textures. AdjunctFactory uses
     * it to swap a placeholder box for a real model clone; one decoded file →
     * many instances (shared geometry/material). See ResourceManager.
     */
    public resourceManager: ResourceManager;
    /** Content-addressed resource router (CID → provider → bytes). Hosts ingest
     *  assets into it and ResourceManager resolves CIDs through it. */
    public readonly ipfs: IpfsRouter;

    // 3. Simulation State
    private lastTime: number = 0;
    private isRunning: boolean = false;
    public time: number = 0.5;
    public weather: string = 'clear';
    public mode: SystemMode = SystemMode.Normal;
    /**
     * True while the player stands inside a game-enabled block (block.game >= 1).
     * Derived every tick by GameZoneSystem from the block-level game flag — the
     * single canonical signal Game-mode entry gates on (so any interpreter
     * reaches the same verdict from the same on-chain data). setMode(Game)
     * refuses unless this is true (or force).
     */
    public gameZoneActive: boolean = false;
    /**
     * True while a ride (CoasterSystem) is carrying the player along a fixed path.
     * The ride is the authority over the player's position, so GameZoneSystem
     * freezes zone tracking while set — a rail that crosses a block boundary must
     * not auto-exit Game mode out from under the rider.
     */
    public rideActive: boolean = false;
    /** Key/value store for trigger conditions and actions (set_flag / flag checks). */
    public globalFlags: Record<string, any> = {};
    /**
     * Durable oneTime bookkeeping: `${adjunctId}#${nodeKey}` → pass count.
     * Survives block reloads (component state is rebuilt) AND page reloads
     * (persisted with globalFlags as the 'session' meta, restored at hydrate).
     */
    public sessionTriggerFired: Record<string, number> = {};
    public isMovingObject: boolean = false;
    public activeEditBlockId: EntityId | null = null;
    public ui: IUIProvider | null = null;
    /** Runtime respawn override (engine coords) set by checkpoint triggers
     *  (player.setSpawn). HealthSystem respawns here instead of the world spawn
     *  when set. Session-only — a reload restarts at the world spawn. */
    public respawnPoint: [number, number, number] | null = null;
    /** Available 3D models for the editor palette's module picker. The client
     *  pushes its resource catalog here (Engine.setModuleCatalog); EditSystem
     *  renders one palette button per entry. Empty = no models offered. */
    public moduleCatalog: ReadonlyArray<{ id: number | string; label: string }> = [];
    public config: FullWorldConfig;

    /**
     * Local-first draft persistence (P1): ONE store shared by BlockSystem (sync
     * draft reads) and EditSystem (saves) — write-behind cache over the durable
     * backend. Hydrate once at boot via Engine.hydrateDrafts BEFORE injecting
     * blocks.
     */
    public readonly draftStore: DraftStore;

    /**
     * Trigger-action execution layer (P2): TriggerSystem decides WHAT fires,
     * the actuator decides HOW it lands. LocalActuator mutates the live world;
     * a chain build injects a contract-backed implementation instead.
     */
    public readonly actuator: IActuator;

    /** Data source (block/resource/game-setting fetch). Engine passes its api. */
    public readonly dataSource: IDataSource;

    /**
     * External realtime transport (P-live): the engine never opens a socket — the
     * host implements ILiveSource and owns the connection; LiveSystem drains it
     * each frame into world.events. Default: inert NullLiveSource.
     */
    public readonly liveSource: ILiveSource;

    /**
     * Game-Setting external-API transport (game.md §3). The engine never performs
     * the network/DOM call itself; GameRuntime hands a whitelisted call here.
     */
    public readonly gameApi: IGameApi;

    /**
     * The Game Setting resolved for the playable block the player is standing in
     * (null when not in a zone, or a bare playable zone with no setting). Resolved
     * by GameRuntimeSystem from the block `game` field (a resource id).
     */
    public gameSetting: GameSetting | null = null;

    /**
     * The live game session, created on entering Game mode on a zone that resolved
     * a setting, disposed on leaving. The single choke point for external API
     * calls (enforces the methods whitelist). Drive moves via gameRuntime.call().
     */
    public gameRuntime: GameRuntime | null = null;

    // 4. Events
    private listeners: Map<string, Function[]> = new Map();

    /** Simulation frame counter (incremented by events.beginFrame each step). */
    public frame = 0;
    /**
     * Frame-scoped typed event queue (event-bus PR-1). Coexists with the
     * legacy on/emitSimple bus — no call sites migrated yet; systems may
     * adopt readers channel-by-channel (spec §7).
     */
    public readonly events = new EventQueue(this);

    /**
     * Facades for external UI/Loader compatibility
     * Maintains functional parity with existing App.tsx and SandboxLoader
     */
    public get controls() { return this.bridge.controls; }
    public get minimap() { return this.bridge.minimap; }
    public get blocks() { return this.bridge.blocks; }

    constructor(config: FullWorldConfig, deps: WorldDeps = {}) {
        this.config = config;
        this.bridge = new WorldBridge(this);
        Coords.BLOCK_SIZE = config.world.block[0];

        this.draftStore = new DraftStore(
            deps.draftBackend !== undefined
                ? deps.draftBackend
                : (hasIndexedDB() ? new IdbDraftBackend() : new InMemoryDraftBackend())
        );
        this.actuator = deps.actuator ?? new LocalActuator();
        this.dataSource = deps.dataSource ?? NULL_DATA_SOURCE;
        this.gameApi = deps.gameApi ?? new NullGameApi();
        this.liveSource = deps.liveSource ?? new NullLiveSource();

        // 1. Rendering Setup — injectable. Default = real WebGL engine; tests pass
        //    a headless NullRenderEngine so a World can boot+tick without a GPU/DOM.
        this.renderEngine = deps.renderEngine ?? new RenderEngine({
            containerId: config.world.containerId,
            clearColor: 0x87ceeb,
            stats: config.debug?.stats ?? false
        });
        this.pipeline = new RenderPipeline(this.renderEngine, this.resolveAsset.bind(this));

        // 1.5 Resource manager — load-once-by-id for models/textures. Anisotropy
        //     comes from the live renderer's capabilities (defends large faces
        //     against grazing-angle shimmer).
        // Content-addressed resource router: ships with a writable in-memory CAS
        // (the "mock IPFS"). Hosts ingest assets into it; ResourceManager resolves
        // CID raws through it. Swappable for a local gateway / real IPFS later.
        this.ipfs = new IpfsRouter([new MemoryCasProvider()]);

        this.resourceManager = new ResourceManager(
            deps.dataSource ?? NULL_DATA_SOURCE,
            {
                ipfsGateway: (config as any).ipfsGateway,
                ipfsRouter: this.ipfs,
                maxAnisotropy: (this.renderEngine as any).getMaxAnisotropy?.() ?? 1,
                ...deps.resources
            }
        );

        // 2. System Bootstrap (Extractable to configuration in future)
        const inputProvider = deps.inputProvider ?? new InputProvider(this.renderEngine.getDomElement());

        // LiveSystem first: external realtime messages enter here and become
        // same-frame-visible to every system registered after it.
        this.systems.addSystem(new LiveSystem());
        this.systems.addSystem(new CharacterController(this, inputProvider));
        this.systems.addSystem(new RaycastInteractionSystem());
        this.systems.addSystem(new TriggerSystem());
        this.systems.addSystem(new ItemSystem());
        this.systems.addSystem(new HealthSystem());
        this.systems.addSystem(new PhysicsSystem());
        this.systems.addSystem(new GridSystem());
        // Derives gameZoneActive from the block.game flag of the block the player
        // stands in, and emits game.zone_enter/exit — the gate Game-mode entry uses.
        this.systems.addSystem(new GameZoneSystem());
        // Runs the Game Mode Protocol lifecycle on top of the zone gate: resolves
        // the block's Game Setting and drives start/end through the methods whitelist.
        this.systems.addSystem(new GameRuntimeSystem());
        this.systems.addSystem(new BlockSystem());
        this.systems.addSystem(new AdjunctSystem());
        this.systems.addSystem(new BlockLODSystem());
        this.systems.addSystem(new EnvironmentSystem(this));
        this.systems.addSystem(new AnimationSystem());
        this.systems.addSystem(new ParticleEffectSystem());
        this.systems.addSystem(new MinimapSystem());
        this.systems.addSystem(new ItemDropSystem());
        // AFTER every item.pickup/item.consume emitter (Trigger bag actions,
        // ItemSystem, ItemDropSystem) — pickups land in the bag the SAME frame.
        this.systems.addSystem(new InventorySystem());

        // Coaster ride: overrides the player position along the rail (Game mode),
        // after movement/physics and before the presentation sync.
        this.systems.addSystem(new CoasterSystem());

        // Final Sync: Presentation Layer
        this.systems.addSystem(new VisualSyncSystem());
        this.systems.addSystem(new EditSystem(this));

        // NOTE: the run loop is NOT auto-started here. Production callers (Engine
        // consumers) call start() explicitly after boot + initial block injection
        // (which also fixes the prior "loop runs before blocks are injected" race).
        // Tests drive the sim deterministically via step(dt) instead of start().
        if (typeof window !== 'undefined') {
            window.addEventListener('resize', this._onResize, false);
        }
    }

    /** Named so dispose() can actually unregister it (an inline closure can't be removed). */
    private _onResize = () => this.renderEngine.resize();

    /**
     * Delegate ECS operations to Registry
     */
    public createEntity(): EntityId { return this.registry.createEntity(); }
    public destroyEntity(id: EntityId): void {
        this.registry.removeEntity(id);
        this.events.dropTarget(id);     // ent-targeted boundary subs die with the entity
    }
    public addComponent<T>(entity: EntityId, type: ComponentType, data: T): void { this.registry.addComponent(entity, type, data); }
    public getComponent<T>(entity: EntityId, type: ComponentType): T | undefined { return this.registry.getComponent<T>(entity, type); }
    public queryEntities(...types: ComponentType[]): EntityId[] { return this.registry.getEntitiesWith(types); }
    public getEntitiesWith(types: ComponentType[]): EntityId[] { return this.registry.getEntitiesWith(types); }

    /**
     * Delegate Player Setup to Factory
     */
    public setupPlayer(position: [number, number, number], rotation: [number, number, number] = [0, 0, 0]): EntityId {
        return EntityFactory.setupPlayer(this, position, rotation);
    }

    /**
     * Game Loop Orchestration
     */
    public start(): void {
        if (!this.isRunning) {
            this.isRunning = true;
            this.lastTime = performance.now();
            this.renderEngine.resize();
            this.runLoop();
        }
    }

    private runLoop(): void {
        const loop = (now: number) => {
            if (!this.isRunning) return;
            const dt = Math.min((now - this.lastTime) / 1000, 0.1);
            this.lastTime = now;
            this.step(dt);
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    /**
     * Advance the simulation by one step: tick all systems, then render.
     * Production drives this from the rAF loop (start()); tests call it directly
     * with a fixed dt for deterministic, reproducible stepping.
     */
    public step(dt: number): void {
        this.events.beginFrame();       // frame++, rotate event buffers
        this.systems.update(this, dt);
        this.renderEngine.render(this.pipeline.isMinimapActive);
        this.events.flushBoundary();    // the ONLY boundary-callback dispatch point
    }

    public stop(): void { this.isRunning = false; }

    /**
     * Switch world mode. Entering Game is ZONE-GATED: it only succeeds while the
     * player stands in a game-enabled block (gameZoneActive, derived by
     * GameZoneSystem from the block.game flag) — the canonical, data-driven,
     * interpreter-agnostic entry contract (docs/systems/game-mode-entry.md).
     * `force` bypasses the gate for engine-internal/test use. Returns whether the
     * transition happened.
     */
    public setMode(mode: SystemMode, opts?: { force?: boolean }): boolean {
        const oldMode = this.mode;
        if (oldMode === mode) return false;
        if (mode === SystemMode.Game && !opts?.force && !this.gameZoneActive) {
            console.warn('[World] Game-mode entry refused: player is not in a game zone (block.game). Walk into a playable block first.');
            return false;
        }
        this.mode = mode;
        this.events.emit("system.mode", { mode, oldMode });
        // (world:save_request was a dead line — exit-Edit saving runs through
        //  EditSystem's own mode polling, see clearHelpers.)
        if (mode === SystemMode.Game) {
            this.events.emit("system.preload", { scope: 'all' });
        }
        return true;
    }

    public setEditMode(active: boolean): void {
        this.setMode(active ? SystemMode.Edit : SystemMode.Normal);
    }

    public setUIProvider(ui: any): void { this.ui = ui; }

    /**
     * Event Bus
     */
    public on(event: string, callback: Function): void {
        if (!this.listeners.has(event)) this.listeners.set(event, []);
        this.listeners.get(event)!.push(callback);
    }

    public emitSimple(event: string, data: any, source?: EntityId): void {
        const list = this.listeners.get(event);
        if (list) {
            const gameEvent: GameEvent = { type: event, payload: data, source };
            list.forEach(cb => cb(gameEvent));
        }
    }

    public off(event: string, callback: Function): void {
        const list = this.listeners.get(event);
        if (list) {
            const index = list.indexOf(callback);
            if (index !== -1) list.splice(index, 1);
        }
    }

    /**
     * SPP/MeshBuilder asset resolver (particle-face path). The module-ADJUNCT
     * path does NOT go through here — it loads via AdjunctFactory + ResourceManager.
     * Wiring the SPP variantIndex→resource-id mapping onto ResourceManager is a
     * follow-up; until then this returns null (SPP model/texture faces stay
     * unrendered, same as before — no regression).
     */
    private resolveAsset(_face: ParticleFace, _variantIndex: number, _cell: ParticleCell): any { return null; }

    public dispose(): void {
        this.isRunning = false;
        // Unhook everything wired in the constructor / via on(): the listeners Map
        // pins subscriber closures (and whatever they capture) past the World's
        // life, and the resize handler pins the whole World via this.renderEngine.
        this.listeners.clear();
        this.events.dispose();
        if (typeof window !== 'undefined') {
            window.removeEventListener('resize', this._onResize, false);
        }
        this.resourceManager.dispose();
        // Free MeshFactory's process-wide shared geometry/material caches. They are
        // tagged userData.shared so removeHandle never disposes them per-eviction;
        // teardown is the only place they're released.
        MeshFactory.clearCache();
        this.renderEngine.dispose();
    }
}
