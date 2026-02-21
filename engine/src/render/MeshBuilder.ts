import * as THREE from 'three';
import { ParticleCell, ParticleFace, FaceState } from '../../core/types/ParticleCell.js';

export interface RenderContext {
    /** Target scene to add meshes */
    scene: THREE.Scene;
    /** The actual physical size of a base block in Three units (usually side length) */
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
        // bit layout: [Right, Left, Back, Front, Bottom, Top]
        // face enum: Top=0, Bottom=1, Front=2, Back=3, Left=4, Right=5
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
        const { scene, blockSize, resolveAsset } = context;

        // Calculate world position of the cell center
        // Cell position is 0-255 inside a chunk.
        const px = cell.position[0] * blockSize[0];
        const py = cell.position[1] * blockSize[1];
        const pz = cell.position[2] * blockSize[2];

        const [tx, ty, tz] = this.transformPosition([px, py, pz]);

        // SPP generates structure primarily on CLOSED faces (FaceState.Closed = 0).
        // Iterate through all 6 faces.
        for (let i = 0; i < 6; i++) {
            const face = i as ParticleFace;
            const isOpen = this.isFaceOpen(cell.bitmask, face);

            // Only generate structural meshes for closed faces, unless 
            // the system specifically requires an open-face trigger/portal mesh.
            if (isOpen) {
                continue;
            }

            const variantIndex = cell.variants[face];
            const asset = resolveAsset(face, variantIndex, cell);

            if (!asset) continue;

            if (asset instanceof THREE.Object3D) {
                // It's a loaded module (GLTF, etc)
                const clone = asset.clone();
                clone.position.set(tx, ty, tz);
                // Note: Rotation application based on cell.rotation goes here
                scene.add(clone);
            } else if (asset instanceof THREE.Material) {
                // It's a material, apply it to a primitive plane/box representing the cell wall
                const geometry = new THREE.PlaneGeometry(blockSize[0], blockSize[1]);
                const mesh = new THREE.Mesh(geometry, asset);

                mesh.position.set(tx, ty, tz);
                this.alignFaceMesh(mesh, face, blockSize);

                scene.add(mesh);
            }
        }
    }

    /**
     * Aligns a flat plane mesh to represent the appropriate bounding face.
     */
    private static alignFaceMesh(mesh: THREE.Mesh, face: ParticleFace, size: [number, number, number]) {
        const halfX = size[0] / 2;
        const halfY = size[1] / 2;
        const halfZ = size[2] / 2;

        switch (face) {
            case ParticleFace.Top: // Z+ -> Three Y+
                mesh.position.y += halfZ;
                mesh.rotation.x = -Math.PI / 2;
                break;
            case ParticleFace.Bottom: // Z- -> Three Y-
                mesh.position.y -= halfZ;
                mesh.rotation.x = Math.PI / 2;
                break;
            case ParticleFace.Front: // Y- -> Three Z+
                mesh.position.z += halfY;
                break;
            case ParticleFace.Back: // Y+ -> Three Z-
                mesh.position.z -= halfY;
                mesh.rotation.x = Math.PI;
                break;
            case ParticleFace.Left: // X- -> Three X-
                mesh.position.x -= halfX;
                mesh.rotation.y = -Math.PI / 2;
                break;
            case ParticleFace.Right: // X+ -> Three X+
                mesh.position.x += halfX;
                mesh.rotation.y = Math.PI / 2;
                break;
        }
    }
}
