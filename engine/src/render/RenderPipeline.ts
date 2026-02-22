import * as THREE from 'three';
import { ParticleCell } from '../core/types/ParticleCell.js';
import { MeshBuilder, RenderContext } from './MeshBuilder.js';

/**
 * RenderPipeline orchestrates the transformation of Layer 2 (Collapsed data) 
 * and Layer 1 (Assets) into Layer 3 (Three.js Scene).
 */
export class RenderPipeline {
    private scene: THREE.Scene;
    private assetResolver: RenderContext['resolveAsset'];

    // Minimap Support
    public minimapCamera: THREE.OrthographicCamera;
    public isMinimapActive: boolean = false;

    constructor(scene: THREE.Scene, assetResolver: RenderContext['resolveAsset']) {
        this.scene = scene;
        this.assetResolver = assetResolver;

        // Initialize Minimap secondary camera (Orthographic, looking completely down)
        // Since PiP is a perfect square, aspect is 1
        const aspect = 1;
        const frustumSize = 120; // Zoomed in to clearly see blocks and player
        this.minimapCamera = new THREE.OrthographicCamera(
            frustumSize * aspect / - 2, frustumSize * aspect / 2,
            frustumSize / 2, frustumSize / - 2,
            0.1, 2000
        );
        this.minimapCamera.position.set(0, 500, 0); // High up
        this.minimapCamera.up.set(0, 0, -1); // North (-Z) should be UP on the 2D map screen
        this.minimapCamera.lookAt(0, 0, 0);

        // Let the Minimap see everything except first-person specifics if we use Layers later
        this.minimapCamera.layers.enableAll();
    }

    /**
     * Renders a chunk of decoded SPP cells into the scene.
     */
    public renderChunk(cells: ParticleCell[], baseSize: [number, number, number]): void {
        const context: RenderContext = {
            scene: this.scene,
            blockSize: baseSize,
            resolveAsset: this.assetResolver
        };

        for (const cell of cells) {
            MeshBuilder.buildCell(cell, context);
        }
    }

    /**
     * Clears all generated SPP meshes from the scene
     */
    public clear(): void {
        const toRemove: THREE.Object3D[] = [];
        this.scene.traverse((child) => {
            // Ideally tag SPP generated meshes using userData
            if ((child as any).isMesh || child instanceof THREE.Group) {
                toRemove.push(child);
            }
        });

        for (const child of toRemove) {
            this.scene.remove(child);
            if ((child as any).geometry) (child as any).geometry.dispose();
            if ((child as any).material) {
                if (Array.isArray((child as any).material)) {
                    (child as any).material.forEach((m: THREE.Material) => m.dispose());
                } else {
                    (child as any).material.dispose();
                }
            }
        }
    }
}
