import * as THREE from 'three';
import { ParticleCell, ParticleFace } from '../core/types/ParticleCell.js';
import { MeshFactory } from './MeshFactory.js';
import { RenderObject, MaterialConfig } from '../core/types/Adjunct.js';
import { RenderEngine } from './RenderEngine';

export interface RenderContext {
    /** Target engine to add meshes */
    engine: RenderEngine;
    /** The actual physical size of a base block in Three units (usually side length) [East, North, Alt] */
    blockSize: [number, number, number];
    /** Material or module registry resolver */
    resolveAsset: (face: ParticleFace, variantIndex: number, cell: ParticleCell) => THREE.Material | THREE.Object3D | null;
}

/**
 * Transforms decoded SPP ParticleCells into Three.js Meshes.
 */
export class MeshBuilder {

    /**
     * Extracts the Boolean state of a specific face from the cell's bitmask
     */
    public static isFaceOpen(bitmask: number, face: ParticleFace): boolean {
        const mask = 1 << face;
        return (bitmask & mask) !== 0; // 1 = Open, 0 = Closed
    }

    /**
     * Transforms SPP coordinate logic to Three.js coordinate space.
     * Septopus: [x, y, z] -> Three: [x, z, -y]
     */
    public static transformPosition(pos: [number, number, number]): [number, number, number] {
        return [pos[0], pos[2], -pos[1]];
    }

    /**
     * Builds and attaches Three.js objects for a single ParticleCell Based on SPP Logic.
     */
    public static buildCell(cell: ParticleCell, context: RenderContext): void {
        const { engine, blockSize, resolveAsset } = context;

        // Calculate world position of the cell center (SPP space)
        const px = cell.position[0] * blockSize[0];
        const py = cell.position[1] * blockSize[1];
        const pz = cell.position[2] * blockSize[2];

        // Base center in Three.js space
        const [tx, ty, tz] = this.transformPosition([px, py, pz]);

        for (let i = 0; i < 6; i++) {
            const face = i as ParticleFace;
            if (this.isFaceOpen(cell.bitmask, face)) continue;

            const variantIndex = cell.variants[face];
            const asset = resolveAsset(face, variantIndex, cell);

            if (!asset) continue;

            if (asset instanceof THREE.Object3D) {
                const clone = asset.clone();
                clone.position.set(tx, ty, tz);
                if (cell.entityId !== undefined) clone.userData.entityId = cell.entityId;
                engine.add(clone);
            } else if (asset instanceof THREE.Material) {
                // Generate unified RenderObject for the face
                const renderObject = this.generateFaceRenderObject(face, [tx, ty, tz], blockSize, asset as THREE.MeshStandardMaterial);

                if (cell.entityId !== undefined) {
                    (renderObject as any).entityId = cell.entityId;
                }

                const mesh = MeshFactory.create(renderObject);
                if (cell.entityId !== undefined) mesh.userData.entityId = cell.entityId;

                engine.add(mesh);
            }
        }
    }

    /**
     * Internal helper to generate a RenderObject for a specific block face.
     */
    private static generateFaceRenderObject(face: ParticleFace, center: [number, number, number], blockSize: [number, number, number], material: THREE.MeshStandardMaterial): RenderObject {
        const halfX = blockSize[0] / 2;
        const halfY = blockSize[1] / 2;
        const halfZ = blockSize[2] / 2;

        let pos: [number, number, number] = [...center];
        let rot: [number, number, number] = [0, 0, 0];
        let size: [number, number, number] = [blockSize[0], blockSize[1], blockSize[2]];

        switch (face) {
            case ParticleFace.Top: // SPP Z+ -> Three Y+
                pos[1] += halfZ;
                rot[0] = -Math.PI / 2;
                size = [blockSize[0], blockSize[1], 0]; // Plane WxH
                break;
            case ParticleFace.Bottom: // SPP Z- -> Three Y-
                pos[1] -= halfZ;
                rot[0] = Math.PI / 2;
                size = [blockSize[0], blockSize[1], 0];
                break;
            case ParticleFace.Front: // SPP Y- -> Three Z+
                pos[2] += halfY;
                size = [blockSize[0], blockSize[2], 0]; // Plane WxD
                break;
            case ParticleFace.Back: // SPP Y+ -> Three Z-
                pos[2] -= halfY;
                rot[0] = Math.PI;
                size = [blockSize[0], blockSize[2], 0];
                break;
            case ParticleFace.Left: // SPP X- -> Three X-
                pos[0] -= halfX;
                rot[1] = -Math.PI / 2;
                size = [blockSize[1], blockSize[2], 0]; // Plane HxD
                break;
            case ParticleFace.Right: // SPP X+ -> Three X+
                pos[0] += halfX;
                rot[1] = Math.PI / 2;
                size = [blockSize[1], blockSize[2], 0];
                break;
        }

        const matConfig: MaterialConfig = {
            color: material.color.getHex(),
            opacity: material.opacity,
        };

        return {
            type: 'plane',
            params: {
                position: pos,
                rotation: rot,
                size: size
            },
            material: matConfig
        };
    }
}
