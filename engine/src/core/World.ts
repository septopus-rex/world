import * as THREE from 'three';
import { PlayerControlSystem } from './systems/PlayerControlSystem';
import { PhysicsSystem } from './systems/PhysicsSystem';
import { TriggerSystem } from './systems/TriggerSystem';
import { EnvironmentSystem } from './systems/EnvironmentSystem';
import { RenderPipeline } from '../render/RenderPipeline.js';
import { ParticleCell, ParticleFace } from './types/ParticleCell.js';

export interface WorldConfig {
    containerId: string;
    blockSize: [number, number, number];
}

export type EntityId = number;

export interface GameEvent {
    type: string;
    sourceEntity?: EntityId;
    targetEntity?: EntityId;
    payload: any;
    timestamp: number;
}

type EventCallback = (event: GameEvent) => void;

export interface ISystem {
    update(world: World, dt: number): void;
}

/**
 * The core SPP Engine World Container & ECS Orchestrator.
 */
export class World {
    public readonly scene: THREE.Scene;
    public readonly camera: THREE.PerspectiveCamera;
    public readonly renderer: THREE.WebGLRenderer;
    public readonly pipeline: RenderPipeline;

    private playerControlSystem!: PlayerControlSystem;
    private physicsSystem!: PhysicsSystem;
    private triggerSystem!: TriggerSystem;
    private environmentSystem!: EnvironmentSystem;
    private container: HTMLElement;
    private animationFrameId: number = 0;
    private lastFrameTime: number = 0;

    // --- ECS Storage ---
    private nextEntityId: EntityId = 1;
    private components = new Map<string, Map<EntityId, any>>();
    private systems: ISystem[] = [];
    private listeners = new Map<string, EventCallback[]>();

    constructor(private config: WorldConfig) {
        const domElement = document.getElementById(config.containerId);
        if (!domElement) {
            throw new Error(`Container with ID ${config.containerId} not found.`);
        }
        this.container = domElement;

        // 1. Initialize Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf0f0f0);

        // 2. Initialize Camera
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
        this.camera.position.set(20, 20, 20);

        // 3. Initialize WebGL Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // 4. Initialize ECS Systems
        this.playerControlSystem = new PlayerControlSystem(this, this.camera, this.renderer.domElement);
        this.physicsSystem = new PhysicsSystem();
        this.triggerSystem = new TriggerSystem();
        this.environmentSystem = new EnvironmentSystem(this);

        this.registerSystem(this.playerControlSystem);
        this.registerSystem(this.physicsSystem);
        this.registerSystem(this.triggerSystem);
        this.registerSystem(this.environmentSystem);

        // 4.1 Initialize Default Player Entity
        this.initDefaultPlayer();

        // 5. Basic Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        this.scene.add(directionalLight);

        // Grid helper for reference
        const gridHelper = new THREE.GridHelper(50, 50, 0x888888, 0xcccccc);
        this.scene.add(gridHelper);

        // 6. Initialize RenderPipeline (SPP to Three.js mapping)
        this.pipeline = new RenderPipeline(this.scene, this.defaultAssetResolver.bind(this));

        // 7. Bind Events
        window.addEventListener('resize', this.onWindowResize.bind(this));

        // 8. Start Loop
        this.startLoop();
    }

    /**
     * Set up the initial player entity with basic components.
     */
    private initDefaultPlayer(): void {
        const playerId = this.createEntity();

        this.addComponent(playerId, "TransformComponent", {
            position: [20, 20, 20],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
        });

        this.addComponent(playerId, "CameraComponent", {
            offset: [0, 1.6, 0], // Eye height
            fov: 45,
            active: true
        });

        this.addComponent(playerId, "RigidBodyComponent", {
            size: [1, 2, 1], // Width, Height, Depth
            offset: [0, 1, 0],
            velocity: [0, 0, 0],
            mass: 1,
            maxSpeedWalk: 10,
            maxSpeedRun: 20,
            jumpForce: 15,
            gravity: 9.81 * 2,
            friction: 0.8,
            isGrounded: false
        });

        this.addComponent(playerId, "ColliderComponent", {
            size: [1, 2, 1],
            offset: [0, 1, 0]
        });

        this.playerControlSystem.attachToEntity(playerId);
    }

    /**
     * Start the continuous render loop and ECS tick.
     */
    private startLoop(): void {
        this.lastFrameTime = performance.now();
        const loop = (now: number) => {
            this.animationFrameId = requestAnimationFrame(loop);

            const dt = (now - this.lastFrameTime) / 1000.0;
            this.lastFrameTime = now;

            // 1. Core ECS Loop
            for (const sys of this.systems) {
                sys.update(this, dt);
            }

            // 2. Render Loop
            this.renderer.render(this.scene, this.camera);
        };
        requestAnimationFrame(loop);
    }

    // -------------------------------------------------------------------------
    // ECS API: Entity Management
    // -------------------------------------------------------------------------

    public createEntity(): EntityId {
        return this.nextEntityId++;
    }

    public destroyEntity(entity: EntityId): void {
        for (const componentMap of this.components.values()) {
            componentMap.delete(entity);
        }
    }

    // -------------------------------------------------------------------------
    // ECS API: Component Management
    // -------------------------------------------------------------------------

    public addComponent<T>(entity: EntityId, componentName: string, data: T): void {
        if (!this.components.has(componentName)) {
            this.components.set(componentName, new Map<EntityId, any>());
        }
        this.components.get(componentName)!.set(entity, data);
    }

    public getComponent<T>(entity: EntityId, componentName: string): T | undefined {
        const map = this.components.get(componentName);
        return map ? map.get(entity) as T : undefined;
    }

    public removeComponent(entity: EntityId, componentName: string): void {
        const map = this.components.get(componentName);
        if (map) map.delete(entity);
    }

    /**
     * Get all entities that possess a specific component
     */
    public queryEntities(componentName: string): EntityId[] {
        const map = this.components.get(componentName);
        if (!map) return [];
        return Array.from(map.keys());
    }

    /**
     * Register a new System to run every frame
     */
    public registerSystem(system: ISystem): void {
        this.systems.push(system);
    }

    // -------------------------------------------------------------------------
    // ECS API: Global Event Bus
    // -------------------------------------------------------------------------

    public subscribe(eventType: string, callback: EventCallback): void {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, []);
        }
        this.listeners.get(eventType)!.push(callback);
    }

    public unsubscribe(eventType: string, callback: EventCallback): void {
        const cbs = this.listeners.get(eventType);
        if (cbs) {
            this.listeners.set(eventType, cbs.filter(cb => cb !== callback));
        }
    }

    public emit(event: GameEvent): void {
        const cbs = this.listeners.get(event.type);
        if (cbs) {
            for (const cb of cbs) {
                cb(event);
            }
        }
    }

    public emitSimple(type: string, payload: any, sourceEntity?: number): void {
        this.emit({
            type,
            payload,
            sourceEntity,
            timestamp: Date.now()
        });
    }

    // -------------------------------------------------------------------------
    // External API (SPP Loading & Environment Sync)
    // -------------------------------------------------------------------------

    /**
     * Push a new blockchain block header to update Environment (Time/Weather)
     */
    public syncEnvironment(height: number, hash: string, intervalSeconds: number): void {
        this.environmentSystem.onNewBlock(this, height, hash, intervalSeconds);
    }

    /**
     * Load an array of SPP ParticleCells directly into the scene.
     */
    public loadCells(cells: ParticleCell[]): void {
        // Here we pass the block physical size dimension down to the builder.
        this.pipeline.renderChunk(cells, this.config.blockSize);
    }

    /**
     * Clear all current rendering objects from the pipeline.
     */
    public clear(): void {
        this.pipeline.clear();
    }

    /**
     * Dispose of WebGL contexts and events cleanly.
     */
    public dispose(): void {
        cancelAnimationFrame(this.animationFrameId);
        window.removeEventListener('resize', this.onWindowResize.bind(this));

        if (this.container && this.renderer.domElement) {
            this.container.removeChild(this.renderer.domElement);
        }

        this.renderer.dispose();
    }

    private onWindowResize(): void {
        if (!this.container) return;
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }

    /**
     * VERY BASIC built-in resolver testing logic: generates a randomized color or simple 
     * colored material for demoing purposes based on variant indices.
     */
    private defaultAssetResolver(face: ParticleFace, variantIndex: number, cell: ParticleCell): THREE.Material {
        const material = new THREE.MeshLambertMaterial({
            color: new THREE.Color().setHSL(Math.random(), 0.7, 0.5),
            side: THREE.FrontSide
        });
        return material;
    }
}
