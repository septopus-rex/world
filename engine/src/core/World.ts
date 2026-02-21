import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RenderPipeline } from '../render/RenderPipeline.js';
import { ParticleCell, ParticleFace } from './types/ParticleCell.js';

export interface WorldConfig {
    containerId: string;
    blockSize: [number, number, number];
}

/**
 * The core SPP Engine World Container.
 * Responsible for Three.js initialization, rendering loop, and module integration.
 */
export class World {
    public readonly scene: THREE.Scene;
    public readonly camera: THREE.PerspectiveCamera;
    public readonly renderer: THREE.WebGLRenderer;
    public readonly pipeline: RenderPipeline;

    private controls: OrbitControls;
    private container: HTMLElement;
    private animationFrameId: number = 0;

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

        // 4. Initialize Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

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
     * Start the continuous render loop.
     */
    private startLoop(): void {
        const loop = () => {
            this.animationFrameId = requestAnimationFrame(loop);
            this.controls.update();
            this.renderer.render(this.scene, this.camera);
        };
        loop();
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
        this.controls.dispose();
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
