import * as THREE from 'three';
import { ParticleCell } from '../core/types/ParticleCell.js';
import { MeshBuilder, RenderContext } from './MeshBuilder.js';
import { RenderEngine } from './RenderEngine';

/**
 * RenderPipeline orchestrates the transformation of Layer 2 (Collapsed data) 
 * and Layer 1 (Assets) into Layer 3 (Three.js Scene).
 */
export class RenderPipeline {
    private engine: RenderEngine;
    private assetResolver: RenderContext['resolveAsset'];

    // Minimap Support
    public isMinimapActive: boolean = false;

    constructor(engine: RenderEngine, assetResolver: RenderContext['resolveAsset']) {
        this.engine = engine;
        this.assetResolver = assetResolver;
    }

    /**
     * Renders a chunk of decoded SPP cells into the scene.
     */
    public renderChunk(cells: ParticleCell[], baseSize: [number, number, number]): void {
        const context: RenderContext = {
            engine: this.engine,
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
        this.engine.clearScene();
    }
}
