import * as THREE from 'three';
import { RenderHandle } from '../core/types/Adjunct';
import { MeshFactory } from './MeshFactory';

export interface RenderEngineConfig {
    containerId: string;
    clearColor?: number;
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
    private container: HTMLElement;

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

        // 4. Initialize Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(Math.max(1, this.container.clientWidth), Math.max(1, this.container.clientHeight));
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.autoClear = true;
        this.container.appendChild(this.renderer.domElement);

        // 5. Default Lighting (Failsafe)
        const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
        this.scene.add(hemi);

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

    public setObjectVisible(handle: RenderHandle, visible: boolean): void {
        (handle as THREE.Object3D).visible = visible;
    }

    public getObjectSize(handle: RenderHandle): [number, number, number] {
        const obj = handle as THREE.Object3D;
        const box = new THREE.Box3().setFromObject(obj);
        const size = new THREE.Vector3();
        box.getSize(size);
        return [size.x, size.y, size.z];
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
            if ((child as any).geometry) (child as any).geometry.dispose();
            if ((child as any).material) {
                if (Array.isArray((child as any).material)) {
                    (child as any).material.forEach((m: any) => m.dispose());
                } else {
                    (child as any).material.dispose();
                }
            }
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
        return light;
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
    }

    /**
     * Rendering Logic
     */
    public render(isMinimapActive: boolean): void {
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
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.mainCamera);

        const intersects = raycaster.intersectObjects(this.scene.children, true);
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
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.minimapCamera);

        const intersects = raycaster.intersectObjects(this.scene.children, true);
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
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.mainCamera);

        const plane = new THREE.Plane(new THREE.Vector3(...planeNormal), 0);
        // Plane offset from origin: dot(normal, point)
        plane.constant = -plane.normal.dot(new THREE.Vector3(...planePoint));

        const target = new THREE.Vector3();
        const result = raycaster.ray.intersectPlane(plane, target);
        return result ? [result.x, result.y, result.z] : null;
    }

    /**
     * Projects a 3D world point to 2D screen coordinates (Normalized 0-1 range)
     */
    public worldToScreen(x: number, y: number, z: number): { x: number, y: number } {
        const vector = new THREE.Vector3(x, y, z);
        vector.project(this.mainCamera);

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
        let found: THREE.Object3D | null = null;
        this.scene.traverse((obj) => {
            if (found) return;
            if (obj.userData && obj.userData.entityId === id) {
                found = obj;
            }
        });
        return found;
    }

    public lockControls(): void {
        // Implementation depends on the control scheme used (e.g. PointerLock)
        // This is a hook for external systems to trigger locking
    }

    public unlockControls(): void {
    }

    public removeHandle(handle: RenderHandle): void {
        const obj = handle as THREE.Object3D;

        // Correctly remove from whatever parent it has (Scene or Group)
        if (obj.parent) {
            obj.parent.remove(obj);
        }

        // Recursive disposal
        obj.traverse((child) => {
            if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
                child.geometry.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }

    public dispose(): void {
        if (this.container && this.renderer.domElement) {
            this.container.removeChild(this.renderer.domElement);
        }
        this.renderer.dispose();
    }
}
