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

    constructor(scene: THREE.Scene, assetResolver: RenderContext['resolveAsset']) {
        this.scene = scene;
        this.assetResolver = assetResolver;
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
