import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { RenderHandle } from '../core/types/Adjunct';
import { MeshFactory } from './MeshFactory';

export interface RenderEngineConfig {
    containerId: string;
    clearColor?: number;
    stats?: boolean;
}

export enum CameraType {
    Main = 'main',
    Minimap = 'minimap'
}

/**
 * RenderEngine abstracts the underlying 3D rendering library (Three.js).
 * It manages the Scene, Cameras, and Renderer instances.
 */
export class RenderEngine {
    private scene: THREE.Scene;
    private mainCamera: THREE.PerspectiveCamera;
    private minimapCamera: THREE.OrthographicCamera;
    private renderer: THREE.WebGLRenderer;
    /** The shadow-casting sun (first directional light) + its authored direction. */
    private sunLight: THREE.DirectionalLight | null = null;
    private _sunDir = new THREE.Vector3(0.45, 0.89, 0.45);
    private container: HTMLElement;
    private stats: Stats | null = null;

    // Reusable raycaster — never instantiated per-frame
    private raycaster: THREE.Raycaster = new THREE.Raycaster();

    // Reusable scratch objects to avoid per-call allocations
    private _tmpBox3 = new THREE.Box3();
    private _tmpSize = new THREE.Vector3();
    private _tmpVec2 = new THREE.Vector2();
    private _tmpPlane = new THREE.Plane();
    private _tmpPlaneNormal = new THREE.Vector3();
    private _tmpPlanePoint = new THREE.Vector3();
    private _tmpPlaneTarget = new THREE.Vector3();

    // O(1) entityId → Object3D index (populated by setObjectUserData)
    private _entityObjectIndex = new Map<string | number, THREE.Object3D>();

    // Skeletal animation: one mixer per animated handle.
    private _mixers = new Map<THREE.Object3D, {
        mixer: THREE.AnimationMixer;
        /** state name → action (idle/walk/run/air + every clip by raw name). */
        actions: Map<string, THREE.AnimationAction>;
        current: string | null;
    }>();

    constructor(config: RenderEngineConfig) {
        const domElement = document.getElementById(config.containerId);
        if (!domElement) {
            throw new Error(`Container with ID ${config.containerId} not found.`);
        }
        this.container = domElement;

        // 1. Initialize Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(config.clearColor ?? 0x87ceeb);

        // 2. Initialize Main Camera
        const aspect = this.container.clientWidth > 0 ? (this.container.clientWidth / this.container.clientHeight) : 1;
        this.mainCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 5000);
        this.mainCamera.rotation.order = 'YXZ'; // Prevent tilting and gimbal lock
        this.mainCamera.position.set(0, 10, 20);

        // 3. Initialize Minimap Camera (Orthographic)
        const frustumSize = 120;
        this.minimapCamera = new THREE.OrthographicCamera(
            frustumSize / -2, frustumSize / 2,
            frustumSize / 2, frustumSize / -2,
            0.1, 2000
        );
        this.minimapCamera.position.set(0, 500, 0);
        this.minimapCamera.up.set(0, 0, -1);
        this.minimapCamera.lookAt(0, 0, 0);
        this.minimapCamera.layers.enableAll();

        // Enable Layer 1 for Selection in Main Camera
        this.mainCamera.layers.enable(1);

        // 4. Initialize Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(Math.max(1, this.container.clientWidth), Math.max(1, this.container.clientHeight));
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.autoClear = true;
        // Color management: render in sRGB so albedo textures aren't gamma-wrong
        // (linear-treated-as-sRGB). Color textures are tagged SRGBColorSpace on load.
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        // Shadows: one shadow-casting sun (see setDirectionalLight), soft PCF.
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // 5. Default Lighting (dim ambient so adjunct lights are visible)
        const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
        this.scene.add(hemi);

        // 6. Stats (optional performance monitor)
        if (config.stats) {
            this.stats = new Stats();
            this.stats.dom.style.position = 'absolute';
            this.stats.dom.style.top = '0px';
            this.stats.dom.style.left = '0px';
            this.container.appendChild(this.stats.dom);
        }
    }

    /** Max supported texture anisotropy (for ResourceManager to raise on textures). */
    public getMaxAnisotropy(): number {
        return this.renderer.capabilities?.getMaxAnisotropy?.() ?? 1;
    }

    public get mainCameraInstance(): THREE.PerspectiveCamera { return this.mainCamera; }
    public get minimapCameraInstance(): THREE.OrthographicCamera { return this.minimapCamera; }
    public get sceneInstance(): THREE.Scene { return this.scene; }
    public get domElement(): HTMLCanvasElement { return this.renderer.domElement; }

    /**
     * Camera Abstraction
     */
    public setMainCameraPosition(x: number, y: number, z: number): void {
        this.mainCamera.position.set(x, y, z);
    }

    public getMainCameraRotation(): [number, number, number] {
        return [this.mainCamera.rotation.x, this.mainCamera.rotation.y, this.mainCamera.rotation.z];
    }

    public setMainCameraRotation(x: number, y: number, z: number): void {
        this.mainCamera.rotation.set(x, y, z);
    }

    public updateMainCameraProjection(): void {
        this.mainCamera.updateProjectionMatrix();
    }

    /**
     * Minimap Abstraction
     */
    public setMinimapZoom(zoom: number): void {
        this.minimapCamera.zoom = zoom;
        this.minimapCamera.updateProjectionMatrix();
    }

    public setMinimapPosition(x: number, y: number, z: number): void {
        this.minimapCamera.position.set(x, y, z);
    }

    public setMinimapLookAt(x: number, y: number, z: number): void {
        this.minimapCamera.lookAt(x, y, z);
    }

    public getMinimapPosition(): [number, number, number] {
        return [this.minimapCamera.position.x, this.minimapCamera.position.y, this.minimapCamera.position.z];
    }

    /**
     * General Object Abstraction
     */
    public setObjectPosition(handle: RenderHandle, x: number, y: number, z: number): void {
        (handle as THREE.Object3D).position.set(x, y, z);
    }

    public setObjectRotation(handle: RenderHandle, x: number, y: number, z: number): void {
        (handle as THREE.Object3D).rotation.set(x, y, z);
    }

    public setObjectScale(handle: RenderHandle, x: number, y: number, z: number): void {
        (handle as THREE.Object3D).scale.set(x, y, z);
    }

    /**
     * Converts a world-space position into the local space of an object's parent.
     * Use this instead of calling Three.js worldToLocal() directly from ECS systems.
     */
    private _tmpLocal = new THREE.Vector3();
    public worldToLocal(handle: RenderHandle, x: number, y: number, z: number): [number, number, number] {
        const obj = handle as THREE.Object3D;
        if (obj.parent && obj.parent.type !== 'Scene') {
            this._tmpLocal.set(x, y, z);
            obj.parent.worldToLocal(this._tmpLocal);
            return [this._tmpLocal.x, this._tmpLocal.y, this._tmpLocal.z];
        }
        return [x, y, z];
    }

    public setObjectVisible(handle: RenderHandle, visible: boolean): void {
        (handle as THREE.Object3D).visible = visible;
    }

    public getObjectSize(handle: RenderHandle): [number, number, number] {
        this._tmpBox3.setFromObject(handle as THREE.Object3D);
        this._tmpBox3.getSize(this._tmpSize);
        return [this._tmpSize.x, this._tmpSize.y, this._tmpSize.z];
    }

    public setRaycastable(handle: RenderHandle, state: boolean): void {
        const obj = handle as THREE.Object3D;
        const layer = state ? 1 : 0;
        obj.traverse((child) => {
            child.layers.set(layer);
        });
    }

    public createGroup(parent?: RenderHandle): RenderHandle {
        const group = new THREE.Group();
        if (parent) {
            (parent as THREE.Object3D).add(group);
        } else {
            this.scene.add(group);
        }
        return group;
    }

    public addObjectToGroup(group: RenderHandle, object: RenderHandle): void {
        (group as THREE.Group).add(object as THREE.Object3D);
    }

    public setObjectUserData(handle: RenderHandle, key: string, value: any): void {
        (handle as THREE.Object3D).userData[key] = value;
        // Keep entityId index in sync
        if (key === 'entityId') {
            this._entityObjectIndex.set(value, handle as THREE.Object3D);
        }
    }

    public updateObjectAppearance(handle: RenderHandle, color?: number, opacity?: number): void {
        (handle as THREE.Object3D).traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                const mat = child.material as THREE.MeshStandardMaterial;
                if (color !== undefined) mat.color.setHex(color);
                if (opacity !== undefined) {
                    mat.opacity = opacity;
                    mat.transparent = opacity < 1.0;
                }
            }
        });
    }

    public add(object: THREE.Object3D): void {
        this.scene.add(object);
    }

    public remove(object: THREE.Object3D): void {
        this.scene.remove(object);
    }

    public clearScene(): void {
        const toRemove: THREE.Object3D[] = [];
        this.scene.traverse((child) => {
            if ((child as any).isMesh || child instanceof THREE.Group || child instanceof THREE.Light) {
                // Keep lights if we want persistent environment, or clear them too
                toRemove.push(child);
            }
        });
        for (const child of toRemove) {
            this.scene.remove(child);
            // Same shared-resource guard as removeHandle (don't dispose cached/shared).
            RenderEngine.disposeMeshResources(child);
        }
    }

    /**
     * Lighting API
     */
    public setAmbientLight(color: number, intensity: number): RenderHandle {
        const light = new THREE.AmbientLight(color, intensity);
        this.scene.add(light);
        return light;
    }

    public setDirectionalLight(color: number, intensity: number, x: number, y: number, z: number): RenderHandle {
        const light = new THREE.DirectionalLight(color, intensity);
        light.position.set(x, y, z);
        this.scene.add(light);

        // The FIRST directional light becomes the shadow-casting "sun". Its
        // authored position only encodes the DIRECTION — the world spans tens of
        // kilometres while a directional shadow camera covers ~100 m, so render()
        // re-anchors the light around the main camera every frame.
        if (!this.sunLight) {
            this.sunLight = light;
            if ((x * x + y * y + z * z) > 1e-6) this._sunDir.set(x, y, z).normalize();
            light.castShadow = true;
            light.shadow.mapSize.set(1024, 1024);
            const cam = light.shadow.camera;
            cam.left = -80; cam.right = 80; cam.top = 80; cam.bottom = -80;
            cam.near = 1; cam.far = 400;
            this.scene.add(light.target);
        }
        return light;
    }

    /** Keep the sun's shadow frustum centred on the player (called per render). */
    private anchorSunShadow(): void {
        const sun = this.sunLight;
        if (!sun) return;
        const anchor = this.mainCamera.position;
        sun.target.position.copy(anchor);
        sun.position.copy(anchor).addScaledVector(this._sunDir, 150);
        sun.target.updateMatrixWorld();
    }

    public setHemisphereLight(skyColor: number, groundColor: number, intensity: number): RenderHandle {
        const light = new THREE.HemisphereLight(skyColor, groundColor, intensity);
        this.scene.add(light);
        return light;
    }

    public updateAmbientLight(light: RenderHandle, color: number, intensity: number): void {
        const l = light as THREE.AmbientLight;
        l.color.setHex(color);
        l.intensity = intensity;
    }

    public updateDirectionalLight(light: RenderHandle, color: number, intensity: number, x: number, y: number, z: number): void {
        const l = light as THREE.DirectionalLight;
        l.color.setHex(color);
        l.intensity = intensity;
        l.position.set(x, y, z);
        // For the sun, the authored position encodes its DIRECTION (sun cycle
        // around the origin) — record it; anchorSunShadow re-bases the actual
        // position around the camera each frame.
        if (l === this.sunLight && (x * x + y * y + z * z) > 1e-6) {
            this._sunDir.set(x, y, z).normalize();
        }
    }

    /**
     * Rendering Logic
     */
    public render(isMinimapActive: boolean): void {
        this.stats?.begin();
        this.anchorSunShadow();
        if (!isMinimapActive) {
            this.renderer.setViewport(0, 0, this.container.clientWidth, this.container.clientHeight);
            this.renderer.setScissorTest(false);
            this.renderer.render(this.scene, this.mainCamera);
        } else {
            // Main pass
            this.renderer.setViewport(0, 0, this.container.clientWidth, this.container.clientHeight);
            this.renderer.setScissorTest(false);
            this.renderer.render(this.scene, this.mainCamera);

            // PiP Minimap pass
            this.renderer.clearDepth();
            const mapSize = Math.min(600, this.container.clientWidth * 0.9, this.container.clientHeight * 0.9);
            const mapX = (this.container.clientWidth - mapSize) / 2;
            const mapY = (this.container.clientHeight - mapSize) / 2;

            this.renderer.setViewport(mapX, mapY, mapSize, mapSize);
            this.renderer.setScissor(mapX, mapY, mapSize, mapSize);
            this.renderer.setScissorTest(true);

            this.renderer.setClearColor(0x111111, 0.9);
            this.renderer.clearColor();
            this.renderer.render(this.scene, this.minimapCamera);

            // Restore
            this.renderer.setClearColor(0xf0f0f0, 0);
        }
        this.stats?.end();
    }

    public getDomElement(): HTMLElement {
        return this.container;
    }

    public resize(): void {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        if (width <= 0 || height <= 0) return;

        this.mainCamera.aspect = width / height;
        this.mainCamera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    /**
     * Specialized Visual Helpers
     */
    public createAvatarMesh(): RenderHandle {
        const geometry = new THREE.BoxGeometry(0.6, 1.8, 0.6);
        const material = new THREE.MeshStandardMaterial({
            color: 0x3366ff,
            transparent: true,
            opacity: 0.8
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, 0.9, 0); // Position it so feet are at origin
        mesh.raycast = () => { }; // Ignore for raycasting
        this.scene.add(mesh);
        return mesh;
    }

    public createMinimapMarker(): THREE.Mesh {
        const geometry = new THREE.ConeGeometry(3, 8, 3);
        geometry.translate(0, 4, 0);
        geometry.rotateX(-Math.PI / 2);

        const material = new THREE.MeshBasicMaterial({ color: 0x00ffff, depthTest: false });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 999;
        mesh.position.y = 100;

        this.scene.add(mesh);
        return mesh;
    }

    public createSelectionHighlight(target: RenderHandle, color: number = 0x00ffff): RenderHandle {
        const size = this.getObjectSize(target);
        const helper = MeshFactory.create({
            type: 'wirebox',
            params: {
                size: [size[0] * 1.05, size[1] * 1.05, size[2] * 1.05],
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },
            material: { color: color, opacity: 1.0 }
        });
        helper.raycast = () => { }; // Ignore selection rays
        this.scene.add(helper);
        return helper;
    }

    /**
     * Helper Visualization
     */
    public createBlockHighlight(parent: RenderHandle, bw: number, bl: number, bh: number): RenderHandle {
        const group = this.createGroup(parent) as THREE.Group;
        const planeHeight = 0.2;
        const opacity = 0.3;

        // Position the group at the center of the block's floor volume
        group.position.set(bw / 2, 0, -bl / 2);

        const planeConfigs = [
            { pos: [0, planeHeight / 2, -bl / 2], rot: [0, 0, 0], color: 0xffff00, size: bw },
            { pos: [0, planeHeight / 2, bl / 2], rot: [0, Math.PI, 0], color: 0xff0000, size: bw },
            { pos: [bw / 2, planeHeight / 2, 0], rot: [0, -Math.PI / 2, 0], color: 0x0000ff, size: bl },
            { pos: [-bw / 2, planeHeight / 2, 0], rot: [0, Math.PI / 2, 0], color: 0x00ff00, size: bl }
        ];

        planeConfigs.forEach(p => {
            const mesh = MeshFactory.create({
                type: 'plane',
                params: {
                    size: [p.size, planeHeight, 0],
                    position: p.pos as [number, number, number],
                    rotation: p.rot as [number, number, number]
                },
                material: { color: p.color, opacity: opacity }
            });
            mesh.raycast = () => { };
            group.add(mesh);
        });

        // Add a Wireframe Volume Box
        const helper = MeshFactory.create({
            type: 'wirebox',
            params: {
                size: [bw, bh, bl],
                position: [0, bh / 2, 0],
                rotation: [0, 0, 0]
            },
            material: { color: 0xffffff, opacity: 0.5 }
        });
        helper.raycast = () => { };
        group.add(helper);

        return group;
    }

    public createGridHelper(size: number, divisions: number, color1: number = 0x444444, color2: number = 0x888888): RenderHandle {
        const grid = MeshFactory.create({
            type: 'grid',
            params: {
                size: [size, divisions, 0],
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },
            material: { color: color2 } // Using color2 as primary for factory logic simplicity
        });
        grid.raycast = () => { };
        this.scene.add(grid);
        return grid;
    }

    /**
     * Helper API
     */
    public updateBlockHighlight(handle: RenderHandle, bx: number, by: number, bw: number, bl: number, bh: number, elevation: number = 0) {
        // BX/BY are SPP 1-based coordinates. 
        // worldX = (bx - 1) * bw
        // worldZ = -(by - 1) * bl
        // Highlighting is centered in the block volume
        const x = (bx - 1) * bw + bw / 2;
        const z = -((by - 1) * bl + bl / 2);
        const y = elevation + bh / 2;
        this.setObjectPosition(handle, x, y, z);
    }

    /**
     * Interaction API
     */
    public castRayFromCamera(ndcX: number, ndcY: number): { entityId: string | number, distance: number, point: [number, number, number] } | null {
        this.raycaster.layers.set(1); // ONLY intersect with objects on Layer 1
        this._tmpVec2.set(ndcX, ndcY);
        this.raycaster.setFromCamera(this._tmpVec2, this.mainCamera);

        const intersects = this.raycaster.intersectObjects(this.scene.children, true);
        for (const hit of intersects) {
            let current: THREE.Object3D | null = hit.object;
            while (current) {
                if (current.userData && current.userData.entityId !== undefined) {
                    return {
                        entityId: current.userData.entityId,
                        distance: hit.distance,
                        point: [hit.point.x, hit.point.y, hit.point.z]
                    };
                }
                current = current.parent;
            }
        }
        return null;
    }

    public castRayFromMinimap(ndcX: number, ndcY: number): { entityId: string | number, distance: number, point: [number, number, number] } | null {
        this.raycaster.layers.set(1); // Minimap should also respect layers if we allow picking there
        this._tmpVec2.set(ndcX, ndcY);
        this.raycaster.setFromCamera(this._tmpVec2, this.minimapCamera);

        const intersects = this.raycaster.intersectObjects(this.scene.children, true);
        for (const hit of intersects) {
            let current: THREE.Object3D | null = hit.object;
            while (current) {
                if (current.userData && current.userData.entityId !== undefined) {
                    return {
                        entityId: current.userData.entityId,
                        distance: hit.distance,
                        point: [hit.point.x, hit.point.y, hit.point.z]
                    };
                }
                current = current.parent;
            }
        }
        return null;
    }

    /**
     * Projects a ray from the camera and intersects it with a mathematical plane.
     */
    public intersectRayWithPlane(ndcX: number, ndcY: number, planeNormal: [number, number, number], planePoint: [number, number, number]): [number, number, number] | null {
        this.raycaster.layers.enableAll();
        this._tmpVec2.set(ndcX, ndcY);
        this.raycaster.setFromCamera(this._tmpVec2, this.mainCamera);

        this._tmpPlaneNormal.set(planeNormal[0], planeNormal[1], planeNormal[2]);
        this._tmpPlanePoint.set(planePoint[0], planePoint[1], planePoint[2]);
        this._tmpPlane.normal.copy(this._tmpPlaneNormal);
        this._tmpPlane.constant = -this._tmpPlaneNormal.dot(this._tmpPlanePoint);

        const result = this.raycaster.ray.intersectPlane(this._tmpPlane, this._tmpPlaneTarget);
        return result ? [result.x, result.y, result.z] : null;
    }

    /**
     * Projects a 3D world point to 2D screen coordinates (Normalized 0-1 range)
     */
    public worldToScreen(x: number, y: number, z: number): { x: number, y: number } {
        this._tmpSize.set(x, y, z);
        this._tmpSize.project(this.mainCamera);
        const vector = this._tmpSize;

        // Convert -1..1 to 0..1
        return {
            x: (vector.x + 1) / 2,
            y: (-vector.y + 1) / 2
        };
    }

    public createWeatherParticles(): RenderHandle {
        const particleCount = 2000;
        const geometry = new THREE.BufferGeometry();
        const vertices = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            vertices[i * 3 + 0] = Math.random() * 50;
            vertices[i * 3 + 1] = Math.random() * 40;
            vertices[i * 3 + 2] = Math.random() * 50;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

        const material = new THREE.PointsMaterial({
            color: 0x88CCFF,
            size: 0.2,
            transparent: true,
            opacity: 0.6,
        });

        const points = new THREE.Points(geometry, material);
        points.visible = false;
        this.scene.add(points);
        return points;
    }

    public updateWeatherParticles(points: RenderHandle, x: number, y: number, z: number, visible: boolean): void {
        const p = points as THREE.Points;
        p.position.set(x - 25, y - 20, z - 25);
        p.visible = visible;
    }

    /**
     * Particle Burst API
     */
    public createParticleBurst(particleCount: number, color: number): { handle: RenderHandle, velocities: Float32Array } {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const speed = Math.random() * 15 + 5;
            velocities[i * 3 + 0] = speed * Math.sin(phi) * Math.cos(theta);
            velocities[i * 3 + 1] = speed * Math.cos(phi) + 5;
            velocities[i * 3 + 2] = speed * Math.sin(phi) * Math.sin(theta);
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
            color: color,
            size: 0.2,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const points = new THREE.Points(geometry, material);
        this.scene.add(points);

        return { handle: points, velocities };
    }

    public updateParticleBurst(handle: RenderHandle, dt: number, velocities: Float32Array, opacity: number): void {
        const points = handle as THREE.Points;
        const positions = points.geometry.attributes.position.array as Float32Array;

        for (let i = 0; i < velocities.length / 3; i++) {
            positions[i * 3 + 0] += velocities[i * 3 + 0] * dt;
            positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
            positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
            velocities[i * 3 + 1] -= 9.8 * dt; // Gravity
        }

        points.geometry.attributes.position.needsUpdate = true;
        (points.material as THREE.PointsMaterial).opacity = opacity;
    }

    public getObjectByEntityId(id: string | number): RenderHandle | null {
        return this._entityObjectIndex.get(id) ?? null;
    }

    public lockControls(): void {
        // Implementation depends on the control scheme used (e.g. PointerLock)
        // This is a hook for external systems to trigger locking
    }

    public unlockControls(): void {
    }

    // ── Audio (3D spatial) ───────────────────────────────────────────────────

    private audioListener: THREE.AudioListener | null = null;
    private audioLoader: THREE.AudioLoader | null = null;
    /** Decoded buffers, load-once by URL (shared across every play). */
    private audioBuffers = new Map<string, Promise<AudioBuffer>>();

    /**
     * Play a one-shot sound. With a position → THREE.PositionalAudio in the
     * scene (distance attenuation); without → flat 2D playback. The listener
     * rides the main camera and is created lazily (first play normally follows
     * a user gesture, which also satisfies the autoplay policy — a suspended
     * AudioContext is resumed best-effort).
     */
    public playSpatialSound(url: string, position: [number, number, number] | null, volume: number = 1): void {
        if (!this.audioListener) {
            this.audioListener = new THREE.AudioListener();
            this.mainCamera.add(this.audioListener);
        }
        const listener = this.audioListener;
        try { (listener.context as AudioContext)?.resume?.(); } catch { /* pre-gesture: stays suspended */ }

        if (!this.audioLoader) this.audioLoader = new THREE.AudioLoader();
        let buffer = this.audioBuffers.get(url);
        if (!buffer) {
            buffer = this.audioLoader.loadAsync(url);
            this.audioBuffers.set(url, buffer);
        }
        buffer.then((buf) => {
            if (position) {
                const sound = new THREE.PositionalAudio(listener);
                sound.setBuffer(buf);
                sound.setRefDistance(8);
                sound.setVolume(volume);
                sound.position.set(position[0], position[1], position[2]);
                this.scene.add(sound);
                sound.onEnded = () => { sound.isPlaying = false; this.scene.remove(sound); };
                sound.play();
            } else {
                const sound = new THREE.Audio(listener);
                sound.setBuffer(buf);
                sound.setVolume(volume);
                sound.play();
            }
        }).catch((e) => console.warn(`[RenderEngine] audio ${url} failed to load`, e?.message ?? e));
    }

    // ── Skeletal animation ────────────────────────────────────────────────────

    /** Movement-state → clip-name heuristics (case-insensitive substring). */
    private static readonly ANIM_STATE_PATTERNS: Record<string, RegExp> = {
        idle: /idle|stand|breath/i,
        walk: /walk/i,
        run: /run|sprint|jog/i,
        air: /jump|fall|air/i,
    };

    /**
     * Register a handle's clips with a mixer and start its default state.
     * Clips are indexed BOTH by movement state (name heuristics) and by raw
     * clip name; states with no matching clip fall back at setAnimationState
     * time (run→walk→idle→first clip), so a one-clip model still animates.
     */
    public startAnimation(handle: RenderHandle, clips: THREE.AnimationClip[]): void {
        if (!clips.length) return;
        const obj = handle as THREE.Object3D;
        const mixer = new THREE.AnimationMixer(obj);
        const actions = new Map<string, THREE.AnimationAction>();

        for (const clip of clips) {
            const action = mixer.clipAction(clip);
            actions.set(clip.name, action);
            for (const [state, pattern] of Object.entries(RenderEngine.ANIM_STATE_PATTERNS)) {
                if (!actions.has(state) && pattern.test(clip.name)) actions.set(state, action);
            }
        }
        if (!actions.has('idle')) actions.set('idle', mixer.clipAction(clips[0]));

        const rig = { mixer, actions, current: null as string | null };
        this._mixers.set(obj, rig);
        this.playRigState(rig, 'idle', 0);
    }

    /**
     * Crossfade the handle's animation to a movement state (idle/walk/run/air
     * or a raw clip name). No-op when the state is already playing or the
     * handle has no rig (placeholder box / model without clips).
     */
    public setAnimationState(handle: RenderHandle, state: string, fadeSec: number = 0.25): void {
        const rig = this._mixers.get(handle as THREE.Object3D);
        if (!rig || rig.current === state) return;
        this.playRigState(rig, state, fadeSec);
    }

    private playRigState(rig: { mixer: THREE.AnimationMixer; actions: Map<string, THREE.AnimationAction>; current: string | null }, state: string, fadeSec: number): void {
        const FALLBACK: Record<string, string[]> = {
            run: ['run', 'walk', 'idle'],
            walk: ['walk', 'idle'],
            air: ['air', 'idle'],
            idle: ['idle'],
        };
        let next: THREE.AnimationAction | undefined;
        for (const name of FALLBACK[state] ?? [state, 'idle']) {
            next = rig.actions.get(name);
            if (next) break;
        }
        if (!next) return;

        const prev = rig.current ? rig.actions.get(rig.current) : undefined;
        // The fallback chain can resolve two states to the SAME action (one-clip
        // model: walk→idle→clips[0]); record the state but don't restart it.
        rig.current = state;
        if (prev === next && next.isRunning()) return;

        if (prev && prev.isRunning() && fadeSec > 0) prev.fadeOut(fadeSec);
        else prev?.stop();
        next.reset();
        if (fadeSec > 0 && prev) next.fadeIn(fadeSec);
        next.play();
    }

    /** Advance the mixer for this handle by dt seconds (called from CharacterController). */
    public updateAnimation(handle: RenderHandle, dt: number): void {
        this._mixers.get(handle as THREE.Object3D)?.mixer.update(dt);
    }

    /** Stop and remove the mixer for this handle (called on avatar swap or disposal). */
    public stopAnimation(handle: RenderHandle): void {
        const rig = this._mixers.get(handle as THREE.Object3D);
        if (rig) { rig.mixer.stopAllAction(); this._mixers.delete(handle as THREE.Object3D); }
    }

    public removeHandle(handle: RenderHandle): void {
        const obj = handle as THREE.Object3D;

        // Liveness flag for async swaps: an in-flight model load checks this on
        // the meshGroup before instancing, so it never adds a clone to a disposed
        // group (the placeholder-then-swap eviction race).
        if (obj.userData) obj.userData.__removed = true;

        this.stopAnimation(handle);

        // Correctly remove from whatever parent it has (Scene or Group)
        if (obj.parent) {
            obj.parent.remove(obj);
        }

        // Remove from entityId index if applicable
        if (obj.userData && obj.userData.entityId !== undefined) {
            this._entityObjectIndex.delete(obj.userData.entityId);
        }

        // Recursive disposal, guarded against shared resources (see disposeMeshResources).
        obj.traverse((child) => RenderEngine.disposeMeshResources(child));
    }

    /**
     * Dispose a mesh's geometry + material UNLESS they are shared — disposing a
     * shared resource corrupts every other live block/instance that references it.
     * Two shared kinds:
     *   • whole-mesh shared: ResourceManager model clones share the template's
     *     geometry+material by reference (userData.shared on the mesh) → skip all.
     *   • per-resource shared: MeshFactory's process-wide cached geometry + colour
     *     materials (userData.shared on the geometry / material) → skip that one.
     * Only instance-owned (fresh) resources are disposed; shared ones are freed by
     * ResourceManager.release / MeshFactory.clearCache. Static + dependency-free so
     * it is unit-testable without a WebGL context.
     */
    private static disposeMeshResources(child: any): void {
        if (!child || !(child.isMesh || child.isPoints)) return;
        if (child.userData?.shared) return;
        const geo = child.geometry;
        if (geo && !geo.userData?.shared) geo.dispose();
        const mat = child.material;
        if (Array.isArray(mat)) {
            mat.forEach((m: any) => { if (m && !m.userData?.shared) m.dispose(); });
        } else if (mat && !mat.userData?.shared) {
            mat.dispose();
        }
    }

    public dispose(): void {
        if (this.container && this.renderer.domElement) {
            this.container.removeChild(this.renderer.domElement);
        }
        this.renderer.dispose();
    }
}
