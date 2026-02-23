import * as THREE from 'three';
import { PlayerControlSystem } from './systems/PlayerControlSystem';
import { PhysicsSystem } from './systems/PhysicsSystem';
import { TriggerSystem } from './systems/TriggerSystem';
import { EnvironmentSystem } from './systems/EnvironmentSystem';
import { RaycastInteractionSystem } from './systems/RaycastInteractionSystem';
import { InventorySystem } from './systems/InventorySystem';
import { ItemDropSystem } from './systems/ItemDropSystem';
import { ParticleEffectSystem } from './systems/ParticleEffectSystem';
import { AdjunctSystem } from './systems/AdjunctSystem';
import { MinimapSystem } from './systems/MinimapSystem';
import { BlockSystem } from './systems/BlockSystem';
import { GridSystem } from './systems/GridSystem';
import { TransformComponent, CameraComponent } from './components/PlayerComponents';
import { RenderPipeline } from '../render/RenderPipeline.js';
import { ParticleCell, ParticleFace } from './types/ParticleCell.js';
import { WorldConfig } from './types/WorldConfig';

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
    dispose?(): void; // Optional cleanup for global listeners
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
    private raycastSystem!: RaycastInteractionSystem;
    private inventorySystem!: InventorySystem;
    private itemDropSystem!: ItemDropSystem;
    private particleEffectSystem!: ParticleEffectSystem;
    private adjunctSystem!: AdjunctSystem;
    private minimapSystem!: MinimapSystem;
    private blockSystem!: BlockSystem;
    private container: HTMLElement;

    public get minimap(): MinimapSystem { return this.minimapSystem; }
    public get blocks(): BlockSystem { return this.blockSystem; }
    public get controls(): PlayerControlSystem { return this.playerControlSystem; }
    private animationFrameId: number = 0;
    private lastFrameTime: number = 0;
    private isRunning: boolean = false;

    // --- ECS Storage ---
    private nextEntityId: EntityId = 1;
    private components = new Map<string, Map<EntityId, any>>();
    private systems: ISystem[] = [];
    private listeners = new Map<string, EventCallback[]>();

    constructor(public config: WorldConfig) {
        const domElement = document.getElementById(config.world.containerId);
        if (!domElement) {
            throw new Error(`Container with ID ${config.world.containerId} not found.`);
        }
        this.container = domElement;

        // 1. Initialize Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb); // Sky Blue

        // 2. Initialize Camera
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
        this.camera.position.set(20, 20, 20);

        // 3. Initialize WebGL Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        // Important: allow auto-clearing but manual depth clearing for the PiP rendering
        this.renderer.autoClear = true;
        this.container.appendChild(this.renderer.domElement);

        // 4. Initialize ECS Systems
        this.blockSystem = new BlockSystem();
        this.playerControlSystem = new PlayerControlSystem(this, this.camera, this.renderer.domElement);
        this.physicsSystem = new PhysicsSystem();
        this.triggerSystem = new TriggerSystem();
        this.environmentSystem = new EnvironmentSystem(this);
        this.raycastSystem = new RaycastInteractionSystem();
        this.inventorySystem = new InventorySystem();
        this.itemDropSystem = new ItemDropSystem();
        this.particleEffectSystem = new ParticleEffectSystem();
        this.adjunctSystem = new AdjunctSystem();
        this.minimapSystem = new MinimapSystem(this);

        this.registerSystem(this.blockSystem);
        this.registerSystem(new GridSystem());
        this.registerSystem(this.playerControlSystem);
        this.registerSystem(this.physicsSystem);
        this.registerSystem(this.triggerSystem);
        this.registerSystem(this.environmentSystem);
        this.registerSystem(this.raycastSystem);
        this.registerSystem(this.inventorySystem);
        this.registerSystem(this.itemDropSystem);
        this.registerSystem(this.particleEffectSystem);
        this.registerSystem(this.adjunctSystem);
        this.registerSystem(this.minimapSystem);

        // 4.1 Initialize Default Player Entity
        this.initDefaultPlayer();

        // 5. Basic Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        // Hemisphere light provides better "outdoor" fill without extreme shadows in large coordinates
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
        this.scene.add(hemiLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(500, 1000, 500); // Higher and further away
        this.scene.add(directionalLight);

        // Add a straight-down light explicitly for the Minimap's top-down view
        const topLight = new THREE.DirectionalLight(0xffffff, 0.7);
        topLight.position.set(0, 2000, 0);
        this.scene.add(topLight);

        // 6. Initialize RenderPipeline (SPP to Three.js mapping)
        this.pipeline = new RenderPipeline(this.scene, this.defaultAssetResolver.bind(this));

        // 7. Bind Events
        window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    public start(): void {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastFrameTime = performance.now();
        this.startLoop();
    }

    public stop(): void {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    /**
     * Set up the initial player entity with basic components.
     */
    private initDefaultPlayer(): void {
        const playerId = this.createEntity();

        this.addComponent(playerId, "TransformComponent", {
            position: [
                this.config.player.start.position[0],
                this.config.player.start.position[1], // Use exact altitude from config
                this.config.player.start.position[2]
            ],
            rotation: this.config.player.start.rotation,
            scale: this.config.player.avatar.scale
        });

        this.addComponent(playerId, "CameraComponent", {
            offset: [0, 1.6, 0], // Eye height
            fov: 75,
            active: true
        });

        // 4.1.5 Visual Avatar (Simple Box representation)
        const avatarGeo = new THREE.BoxGeometry(0.6, 1.8, 0.6);
        const avatarMat = new THREE.MeshStandardMaterial({
            color: 0x3366ff,
            transparent: true,
            opacity: 0.8
        });
        const avatarMesh = new THREE.Mesh(avatarGeo, avatarMat);
        // Position it so the feet are at [0,0,0] local
        avatarMesh.position.set(0, 0.9, 0);
        this.scene.add(avatarMesh);

        // We need a way to sync this mesh to the transform. 
        // For simplicity in this demo, I'll just add an 'onRender' hook or similar if it existed, 
        // but since we don't have a dedicated RenderSystem for meshes yet (it's mostly adjuncts),
        // I'll just make the avatarMesh a child of a group that we update, 
        // or actually, the easiest way is to add it to the scene and let a system update it.
        // Wait, I can just use a proxy or a simple component.

        // Actually, let's just use the Three.js scene graph for the avatar since it's a singleton player.
        // I'll store it in a private field and update it in the main loop.
        (this as any)._avatarMesh = avatarMesh;

        // The exact Physics Rules defined by the "King" of this world
        this.addComponent(playerId, "RigidBodyComponent", {
            size: [1, 2 * this.config.player.avatar.scale[1], 1], // Width, Height, Depth
            offset: [0, 1 * this.config.player.avatar.scale[1], 0],
            velocity: [0, 0, 0],
            mass: 1,
            maxSpeedWalk: this.config.player.capacity.speed,
            maxSpeedRun: this.config.player.capacity.speed * 2,
            jumpForce: this.config.player.capacity.jumpForce,
            gravity: (9.81 * 2) * this.config.player.capacity.gravityMultiplier,
            friction: 0.8,
            isGrounded: false
        });

        this.addComponent(playerId, "ColliderComponent", {
            size: [1, 2 * this.config.player.avatar.scale[1], 1],
            offset: [0, 1 * this.config.player.avatar.scale[1], 0]
        });

        // Initialize Player Inventory using Config Authority limit
        this.addComponent(playerId, "InventoryComponent", {
            items: [],
            maxCapacity: this.config.player.bag.max
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
            if (!this.isRunning) return;

            const dt = (now - this.lastFrameTime) / 1000.0;
            this.lastFrameTime = now;

            // 1. Core ECS Loop
            for (const sys of this.systems) {
                sys.update(this, dt);
            }

            // Sync visual avatar to its physical counterpart
            if ((this as any)._avatarMesh) {
                const players = this.getEntitiesWith(["TransformComponent", "InputStateComponent"]);
                if (players.length > 0) {
                    const t = this.getComponent<TransformComponent>(players[0], "TransformComponent")!;
                    (this as any)._avatarMesh.position.set(t.position[0], t.position[1] + 0.9, t.position[2]);
                    (this as any)._avatarMesh.rotation.set(t.rotation[0], t.rotation[1], t.rotation[2]);
                }
            }

            // 2. Render Loop
            if (!this.pipeline.isMinimapActive) {
                // 2A. Standard FPV Full Screen Render
                this.renderer.setViewport(0, 0, this.container.clientWidth, this.container.clientHeight);
                this.renderer.setScissorTest(false);
                this.renderer.render(this.scene, this.camera);
            } else {
                // 2B. Dual Camera PiP Render

                // First pass: Normal Scene
                this.renderer.setViewport(0, 0, this.container.clientWidth, this.container.clientHeight);
                this.renderer.setScissorTest(false);
                this.renderer.render(this.scene, this.camera);

                // Clear Depth so the map draws ON TOP of the 3D scene
                this.renderer.clearDepth();

                // Calculate centered square map viewport (e.g. 600x600 px, or screen bounds if smaller)
                const mapSize = Math.min(600, this.container.clientWidth * 0.9, this.container.clientHeight * 0.9);
                const mapX = (this.container.clientWidth - mapSize) / 2;
                const mapY = (this.container.clientHeight - mapSize) / 2;

                this.renderer.setViewport(mapX, mapY, mapSize, mapSize);
                this.renderer.setScissor(mapX, mapY, mapSize, mapSize);
                this.renderer.setScissorTest(true);

                // Optional: Render a dark backing plate behind the map to improve contrast
                this.renderer.setClearColor(0x111111, 0.9);
                this.renderer.clearColor();

                this.renderer.render(this.scene, this.pipeline.minimapCamera);

                // Restore clear color
                this.renderer.setClearColor(0xf0f0f0, 0);
            }
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
     * Get entities that possess ALL listed components
     */
    public getEntitiesWith(componentNames: string[]): EntityId[] {
        if (componentNames.length === 0) return [];
        let result = new Set<EntityId>(this.queryEntities(componentNames[0]));
        for (let i = 1; i < componentNames.length; i++) {
            const nextMap = this.components.get(componentNames[i]);
            if (!nextMap) return [];
            const temp = new Set<EntityId>();
            for (const id of result) {
                if (nextMap.has(id)) temp.add(id);
            }
            result = temp;
        }
        return Array.from(result);
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
        // Legacy: config.world.range is [4096, 4096], but renderer needs a 3D tuple. 
        // We'll assume a standard 16x16x32 block size for rendering for now.
        const blockSize: [number, number, number] = [16, 16, 32];

        // Register each loaded cell as an ECS Entity
        for (const cell of cells) {
            const cellEntity = this.createEntity();
            cell.entityId = cellEntity;

            // Allow this structural cell to be interacted with
            this.addComponent(cellEntity, "RaycastTargetComponent", {
                type: "block",
                metadata: {
                    x: cell.position[0],
                    y: cell.position[1]
                },
                isHovered: false,
                distanceToCamera: Infinity
            });

            // In the future: Add ColliderComponent here as well if the cell bitmask indicates it is solid.
        }

        this.pipeline.renderChunk(cells, blockSize);
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
        this.isRunning = false;
        cancelAnimationFrame(this.animationFrameId);
        window.removeEventListener('resize', this.onWindowResize.bind(this));

        // 1. Dispose all systems (specifically to remove global DOM listeners)
        for (const sys of this.systems) {
            if (sys.dispose) {
                sys.dispose();
            }
        }

        // 2. Cleanup Three.js
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
        // Generate a stable color based on block coordinates (X, Y)
        const x = cell.position[0];
        const y = cell.position[1];

        // Simple hash-like function to derive hue from coordinates
        const hue = ((Math.abs(x) * 13 + Math.abs(y) * 37) % 100) / 100;

        const material = new THREE.MeshLambertMaterial({
            color: new THREE.Color().setHSL(hue, 0.6, 0.4),
            side: THREE.FrontSide
        });
        return material;
    }
}
