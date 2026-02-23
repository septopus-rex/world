import { RenderEngine } from '../render/RenderEngine';
import { RenderPipeline } from '../render/RenderPipeline';
import { RenderHandle } from './types/Adjunct';
import { TransformComponent, RigidBodyComponent, CameraComponent, InputStateComponent, AvatarComponent } from './components/PlayerComponents';
import { ParticleCell, ParticleFace } from './types/ParticleCell';

// Systems
import { PhysicsSystem } from './systems/PhysicsSystem';
import { PlayerControlSystem } from './systems/PlayerControlSystem';
import { BlockSystem } from './systems/BlockSystem';
import { EnvironmentSystem } from './systems/EnvironmentSystem';
import { MinimapSystem } from './systems/MinimapSystem';
import { AnimationSystem } from './systems/AnimationSystem';
import { GridSystem } from './systems/GridSystem';
import { AdjunctSystem } from './systems/AdjunctSystem';
import { RaycastInteractionSystem } from './systems/RaycastInteractionSystem';
import { TriggerSystem } from './systems/TriggerSystem';
import { InventorySystem } from './systems/InventorySystem';
import { ItemDropSystem } from './systems/ItemDropSystem';
import { ParticleEffectSystem } from './systems/ParticleEffectSystem';

// --- ECS CORE DEFINITIONS ---
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

export interface WorldConfig {
    world: {
        containerId: string;
    };
    assetBaseUrl: string;
    [key: string]: any;
}

/**
 * World: The Single Source of Truth & Main Orchestrator.
 * Handles ECS registry, Game Loop, and Integration of Systems.
 * 
 * DESIGN: WORLD IS NOW RENDER-AGNOSTIC.
 */
export class World {
    // 1. ECS State
    private entities: Set<EntityId> = new Set();
    private components: Map<ComponentType, Map<EntityId, ComponentData>> = new Map();
    private systems: ISystem[] = [];
    private entityCounter: number = 0;

    // 2. Rendering (Abstracted)
    public renderEngine: RenderEngine;
    public pipeline: RenderPipeline;

    // 3. Simulation State
    private lastTime: number = 0;
    private isRunning: boolean = false;
    public time: number = 0.5; // normalized 0-1
    public weather: string = 'clear';

    // Legacy Bridge for SandboxLoader compatibility
    public blocks = {
        syncVisibility: (requiredKeys: string[]) => {
            // Find the BlockSystem in our systems registration
            const blockSystem = this.systems.find(s => (s as any).syncVisibility) as any;
            if (blockSystem) {
                blockSystem.syncVisibility(this, requiredKeys);
            }
        }
    };

    // 4. Control Bridge (For high-level API compatibility)
    public controls = {
        setMoveIntent: (x: number, y: number) => {
            const player = this.queryEntities("InputStateComponent")[0];
            const input = this.getComponent<InputStateComponent>(player, "InputStateComponent");
            if (input) input.movementIntent = [x, 0, y];
        },
        triggerJump: () => {
            const player = this.queryEntities("InputStateComponent")[0];
            const input = this.getComponent<InputStateComponent>(player, "InputStateComponent");
            if (input) input.jump = true;
        },
        lock: () => this.renderEngine.lockControls?.(),
        unlock: () => this.renderEngine.unlockControls?.()
    };

    public minimap = {
        setFollow: (follow: boolean) => {
            const system = this.systems.find(s => s instanceof MinimapSystem) as MinimapSystem;
            if (system) system.isFollowingPlayer = follow;
        },
        applyPan: (dx: number, dy: number) => {
            const system = this.systems.find(s => s instanceof MinimapSystem) as MinimapSystem;
            if (system) system.applyPan(dx, dy);
        },
        pickBlockFromMinimap: (ndcX: number, ndcY: number) => {
            const system = this.systems.find(s => s instanceof MinimapSystem) as MinimapSystem;
            return system ? system.pickBlockFromMinimap(ndcX, ndcY) : null;
        },
        get zoom() {
            const system = (this as any).systems.find((s: any) => s instanceof MinimapSystem) as MinimapSystem;
            return system ? system.zoom : 1.0;
        },
        set zoom(val: number) {
            const system = (this as any).systems.find((s: any) => s instanceof MinimapSystem) as MinimapSystem;
            if (system) system.zoom = val;
        }
    };

    // 5. Global Event Bus (Simplified)
    private listeners: Map<string, Function[]> = new Map();

    constructor(config: WorldConfig) {
        // Initialize Rendering Engine (Three.js Wrapper)
        this.renderEngine = new RenderEngine({
            containerId: config.world.containerId,
            clearColor: 0x87ceeb
        });

        // Initialize Render Pipeline (SPP to Rendering)
        this.pipeline = new RenderPipeline(this.renderEngine, this.resolveAsset.bind(this));

        // Register Core Systems
        this.addSystem(new PlayerControlSystem(this, this.renderEngine.getDomElement()));
        this.addSystem(new RaycastInteractionSystem());
        this.addSystem(new TriggerSystem());
        this.addSystem(new InventorySystem());
        this.addSystem(new PhysicsSystem());
        this.addSystem(new GridSystem());
        this.addSystem(new BlockSystem());
        this.addSystem(new AdjunctSystem());
        this.addSystem(new EnvironmentSystem(this));
        this.addSystem(new AnimationSystem());
        this.addSystem(new ParticleEffectSystem());
        this.addSystem(new MinimapSystem());
        this.addSystem(new ItemDropSystem());

        // Start Loop automatically
        this.start();

        // Listen for Window Resize
        window.addEventListener('resize', () => this.renderEngine.resize(), false);
    }

    /**
     * Entity Management
     */
    public createEntity(): EntityId {
        const id = this.entityCounter++;
        this.entities.add(id);
        return id;
    }

    public destroyEntity(id: EntityId): void {
        this.entities.delete(id);
        this.components.forEach(compMap => compMap.delete(id));
    }

    /**
     * Component Management
     */
    public addComponent<T>(entity: EntityId, type: ComponentType, data: T): void {
        if (!this.components.has(type)) {
            this.components.set(type, new Map());
        }
        this.components.get(type)!.set(entity, data);
    }

    public getComponent<T>(entity: EntityId, type: ComponentType): T | undefined {
        return this.components.get(type)?.get(entity);
    }

    public queryEntities(...types: ComponentType[]): EntityId[] {
        if (types.length === 0) return Array.from(this.entities);

        // Simple intersection
        let results = Array.from(this.components.get(types[0])?.keys() || []);
        for (let i = 1; i < types.length; i++) {
            const nextSet = this.components.get(types[i]);
            if (!nextSet) return [];
            results = results.filter(id => nextSet.has(id));
        }
        return results;
    }

    public getEntitiesWith(types: ComponentType[]): EntityId[] {
        return this.queryEntities(...types);
    }

    /**
     * System Management
     */
    public addSystem(system: ISystem): void {
        this.systems.push(system);
    }

    /**
     * Lifecycle Control
     */
    public start(): void {
        if (!this.isRunning) {
            this.isRunning = true;
            this.lastTime = performance.now();
            this.renderEngine.resize();
            this.runLoop();
        }
    }

    public stop(): void {
        this.isRunning = false;
    }

    private runLoop(): void {
        const loop = (now: number) => {
            if (!this.isRunning) return;

            const dt = Math.min((now - this.lastTime) / 1000, 0.1);
            this.lastTime = now;

            for (const system of this.systems) {
                system.update(this, dt);
            }

            this.renderEngine.render(this.pipeline.isMinimapActive);
            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
    }

    /**
     * Event Handling
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
     * Asset Management
     */
    private resolveAsset(face: ParticleFace, variantIndex: number, cell: ParticleCell): any {
        return null; // Implementation deferred to external asset system
    }

    /**
     * High Level Player Setup
     */
    public setupPlayer(position: [number, number, number]): EntityId {
        const player = this.createEntity();

        this.addComponent<TransformComponent>(player, "TransformComponent", {
            position: [...position],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
        });

        this.addComponent<RigidBodyComponent>(player, "RigidBodyComponent", {
            size: [0.6, 1.8, 0.6],
            offset: [0, 0, 0],
            velocity: [0, 0, 0],
            mass: 1,
            maxSpeedWalk: 5,
            maxSpeedRun: 10,
            jumpForce: 8,
            gravity: 1,
            friction: 0.9,
            isGrounded: false
        });

        this.addComponent<InputStateComponent>(player, "InputStateComponent", {
            forward: false, backward: false, left: false, right: false, jump: false, run: false,
            interactPrimary: false, interactSecondary: false,
            lookUp: false, lookDown: false, lookLeft: false, lookRight: false,
            movementIntent: [0, 0, 0],
            lookPitchDelta: 0, lookYawDelta: 0
        });

        this.addComponent<CameraComponent>(player, "CameraComponent", {
            offset: [0, 1.7, 0],
            fov: 75,
            active: true
        });

        const avatarHandle = this.renderEngine.createAvatarMesh();
        this.renderEngine.setObjectPosition(avatarHandle, position[0], position[1], position[2]);

        this.addComponent<AvatarComponent>(player, "AvatarComponent", {
            handle: avatarHandle,
            visible: true
        });

        return player;
    }

    public dispose(): void {
        this.isRunning = false;
        this.renderEngine.dispose();
    }
}
