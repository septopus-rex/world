import * as THREE from 'three';
import { RenderHandle } from '../core/types/Adjunct';

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

    /**
     * Interaction API
     */
    public castRayFromCamera(ndcX: number, ndcY: number): { entityId: string | number, distance: number, point: [number, number, number] } | null {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.mainCamera);

        const intersects = raycaster.intersectObjects(this.scene.children, true);
        for (const hit of intersects) {
            if (hit.object && hit.object.userData && hit.object.userData.entityId !== undefined) {
                return {
                    entityId: hit.object.userData.entityId,
                    distance: hit.distance,
                    point: [hit.point.x, hit.point.y, hit.point.z]
                };
            }
        }
        return null;
    }

    public castRayFromMinimap(ndcX: number, ndcY: number): { entityId: string | number, distance: number, point: [number, number, number] } | null {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.minimapCamera);

        const intersects = raycaster.intersectObjects(this.scene.children, true);
        for (const hit of intersects) {
            if (hit.object && hit.object.userData && hit.object.userData.entityId !== undefined) {
                return {
                    entityId: hit.object.userData.entityId,
                    distance: hit.distance,
                    point: [hit.point.x, hit.point.y, hit.point.z]
                };
            }
        }
        return null;
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

    public lockControls(): void {
        // Implementation depends on the control scheme used (e.g. PointerLock)
        // This is a hook for external systems to trigger locking
    }

    public unlockControls(): void {
    }

    public removeHandle(handle: RenderHandle): void {
        const obj = handle as THREE.Object3D;
        this.scene.remove(obj);
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
            obj.geometry.dispose();
            if (Array.isArray(obj.material)) {
                obj.material.forEach(m => m.dispose());
            } else {
                obj.material.dispose();
            }
        }
    }

    public dispose(): void {
        if (this.container && this.renderer.domElement) {
            this.container.removeChild(this.renderer.domElement);
        }
        this.renderer.dispose();
    }
}
