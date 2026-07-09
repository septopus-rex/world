import * as THREE from 'three';

/**
 * MinimapPass — the top-down orthographic minimap, extracted from RenderEngine
 * (intra-layer refactor: still `render/`). Owns the ortho camera and the
 * picture-in-picture render pass (centred viewport + scissor, fog disabled for
 * the top-down view). Positions are stored ABSOLUTE and applied relative to the
 * caller's floating-origin `renderOrigin` (same rebasing scheme as the main
 * camera). RenderEngine forwards the setters (passing its renderOrigin), calls
 * `render()` in the minimap branch of its loop, and `rebase()` on origin shift.
 */
export class MinimapPass {
    private readonly camera: THREE.OrthographicCamera;
    private readonly abs = new THREE.Vector3(0, 500, 0); // absolute world position

    constructor() {
        const frustumSize = 120;
        this.camera = new THREE.OrthographicCamera(
            frustumSize / -2, frustumSize / 2,
            frustumSize / 2, frustumSize / -2,
            0.1, 2000,
        );
        this.camera.position.set(0, 500, 0);
        this.camera.up.set(0, 0, -1);
        this.camera.lookAt(0, 0, 0);
        this.camera.layers.enableAll();
    }

    get cameraInstance(): THREE.OrthographicCamera { return this.camera; }

    setZoom(zoom: number): void {
        this.camera.zoom = zoom;
        this.camera.updateProjectionMatrix();
    }

    setPosition(x: number, y: number, z: number, origin: THREE.Vector3): void {
        this.abs.set(x, y, z);
        this.camera.position.set(x - origin.x, y - origin.y, z - origin.z);
    }

    setLookAt(x: number, y: number, z: number, origin: THREE.Vector3): void {
        this.camera.lookAt(x - origin.x, y - origin.y, z - origin.z);
    }

    getPosition(origin: THREE.Vector3): [number, number, number] {
        return [
            this.camera.position.x + origin.x,
            this.camera.position.y + origin.y,
            this.camera.position.z + origin.z,
        ];
    }

    /** Re-apply the absolute position relative to a shifted render origin. */
    rebase(origin: THREE.Vector3): void {
        this.camera.position.set(this.abs.x - origin.x, this.abs.y - origin.y, this.abs.z - origin.z);
    }

    /**
     * Render the PiP minimap over the (already-drawn) main pass: a centred
     * scissored viewport, fog off for the top-down ortho camera (the ~500 m-high
     * camera sits far beyond the fog's few-block far plane, which would otherwise
     * paint the whole map solid sky colour — fog is a first-person effect only),
     * restored right after.
     */
    render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, container: HTMLElement): void {
        renderer.clearDepth();
        const mapSize = Math.min(600, container.clientWidth * 0.9, container.clientHeight * 0.9);
        const mapX = (container.clientWidth - mapSize) / 2;
        const mapY = (container.clientHeight - mapSize) / 2;

        renderer.setViewport(mapX, mapY, mapSize, mapSize);
        renderer.setScissor(mapX, mapY, mapSize, mapSize);
        renderer.setScissorTest(true);

        const savedFog = scene.fog;
        scene.fog = null;
        renderer.setClearColor(0x111111, 0.9);
        renderer.clearColor();
        renderer.render(scene, this.camera);

        scene.fog = savedFog;
        renderer.setClearColor(0xf0f0f0, 0);
    }
}
