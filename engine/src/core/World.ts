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
import { PlayerIntentSystem } from './systems/PlayerIntentSystem';
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

    // 3. Simulation State
    private lastTime: number = 0;
    private isRunning: boolean = false;
    public time: number = 0.5;
    public weather: string = 'clear';
    public mode: SystemMode = SystemMode.Normal;
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

    constructor(config: FullWorldConfig) {
        this.config = config;
        this.bridge = new WorldBridge(this);
        Coords.BLOCK_SIZE = config.world.block[0];

        // 1. Rendering Setup
        this.renderEngine = new RenderEngine({
            containerId: config.world.containerId,
            clearColor: 0x87ceeb,
            stats: config.debug?.stats ?? false
        });
        this.pipeline = new RenderPipeline(this.renderEngine, this.resolveAsset.bind(this));

        // 2. System Bootstrap (Extractable to configuration in future)
        const inputProvider = new InputProvider(this.renderEngine.getDomElement());

        this.systems.addSystem(new PlayerIntentSystem(this, inputProvider));
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

        this.start();
        window.addEventListener('resize', () => this.renderEngine.resize(), false);
    }

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

            this.systems.update(this, dt);
            this.renderEngine.render(this.pipeline.isMinimapActive);
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
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

    private resolveAsset(face: ParticleFace, variantIndex: number, cell: ParticleCell): any { return null; }

    public dispose(): void {
        this.isRunning = false;
        this.renderEngine.dispose();
    }
}
