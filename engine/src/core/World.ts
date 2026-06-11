import { RenderEngine } from '../render/RenderEngine';
import { RenderPipeline } from '../render/RenderPipeline';
import { Coords } from './utils/Coords';
import { ParticleCell, ParticleFace } from './types/ParticleCell';
import { ECSRegistry } from './ECSRegistry';
import { SystemManager } from './SystemManager';
import { WorldBridge } from './WorldBridge';
import { EntityFactory } from './EntityFactory';

// Systems (Imported only for registration in constructor or specialized logic)
import { PhysicsSystem } from './systems/PhysicsSystem';
import { CharacterController } from './movement/CharacterController';
import { InputProvider } from './systems/InputProvider';
import { BlockSystem } from './systems/BlockSystem';
import { EnvironmentSystem } from './systems/EnvironmentSystem';
import { VisualSyncSystem } from './systems/VisualSyncSystem';
import { MinimapSystem } from './systems/MinimapSystem';
import { AnimationSystem } from './systems/AnimationSystem';
import { GridSystem } from './systems/GridSystem';
import { AdjunctSystem } from './systems/AdjunctSystem';
import { RaycastInteractionSystem } from './systems/RaycastInteractionSystem';
import { TriggerSystem } from './systems/TriggerSystem';
import { InventorySystem } from './systems/InventorySystem';
import { ItemDropSystem } from './systems/ItemDropSystem';
import { ParticleEffectSystem } from './systems/ParticleEffectSystem';
import { EditSystem } from './systems/EditSystem';

import { FullWorldConfig } from './types/WorldConfig';
import { SystemMode } from './types/SystemMode';
import { IUIProvider } from './services/UIProvider';
import { IDataSource } from './services/DataSource';
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

    // 3. Simulation State
    private lastTime: number = 0;
    private isRunning: boolean = false;
    public time: number = 0.5;
    public weather: string = 'clear';
    public mode: SystemMode = SystemMode.Normal;
    /** Key/value store for trigger conditions and actions (set_flag / flag checks). */
    public globalFlags: Record<string, any> = {};
    public isMovingObject: boolean = false;
    public activeEditBlockId: EntityId | null = null;
    public ui: IUIProvider | null = null;
    public config: FullWorldConfig;

    // 4. Events
    private listeners: Map<string, Function[]> = new Map();

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
        this.resourceManager = new ResourceManager(
            deps.dataSource ?? NULL_DATA_SOURCE,
            {
                ipfsGateway: (config as any).ipfsGateway,
                maxAnisotropy: (this.renderEngine as any).getMaxAnisotropy?.() ?? 1,
                ...deps.resources
            }
        );

        // 2. System Bootstrap (Extractable to configuration in future)
        const inputProvider = deps.inputProvider ?? new InputProvider(this.renderEngine.getDomElement());

        this.systems.addSystem(new CharacterController(this, inputProvider));
        this.systems.addSystem(new RaycastInteractionSystem());
        this.systems.addSystem(new TriggerSystem());
        this.systems.addSystem(new InventorySystem());
        this.systems.addSystem(new PhysicsSystem());
        this.systems.addSystem(new GridSystem());
        this.systems.addSystem(new BlockSystem());
        this.systems.addSystem(new AdjunctSystem());
        this.systems.addSystem(new EnvironmentSystem(this));
        this.systems.addSystem(new AnimationSystem());
        this.systems.addSystem(new ParticleEffectSystem());
        this.systems.addSystem(new MinimapSystem());
        this.systems.addSystem(new ItemDropSystem());

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
    public destroyEntity(id: EntityId): void { this.registry.removeEntity(id); }
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
        this.systems.update(this, dt);
        this.renderEngine.render(this.pipeline.isMinimapActive);
    }

    public stop(): void { this.isRunning = false; }

    public setMode(mode: SystemMode): void {
        const oldMode = this.mode;
        if (oldMode === mode) return;
        this.mode = mode;
        this.emitSimple("world:mode_changed", { mode, oldMode });
        if (oldMode === SystemMode.Edit && mode !== SystemMode.Edit) {
            this.emitSimple("world:save_request", { reason: 'exit_edit_mode' });
        }
        if (mode === SystemMode.Game) {
            this.emitSimple("world:preload_request", { scope: 'all' });
        }
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
