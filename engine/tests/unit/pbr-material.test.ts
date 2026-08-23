import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MeshFactory } from '../../src/render/MeshFactory';
import { RenderObject } from '../../src/core/types/Adjunct';

describe('PBR material pipeline', () => {
    it('creates MeshStandardMaterial when PBR normal/roughness/metalness/ao/emissive maps are configured', () => {
        const renderObj: RenderObject = {
            type: 'box',
            params: {
                size: [2, 2, 2],
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },
            material: {
                texture: '36',
                normalMap: '101',
                roughnessMap: '102',
                metalnessMap: '103',
                aoMap: '104',
                emissiveMap: '105',
                emissive: 0xff0000,
                roughness: 0.7,
                metalness: 0.3
            }
        };

        const mesh = MeshFactory.create(renderObj) as THREE.Mesh;
        expect(mesh).toBeDefined();
        const mat = mesh.material as THREE.MeshStandardMaterial;
        expect(mat).toBeDefined();
        expect(mat.isMeshStandardMaterial).toBe(true);
        expect(mat.roughness).toBe(0.7);
        expect(mat.metalness).toBe(0.3);
        expect(mat.emissive.getHex()).toBe(0xff0000);
        expect(mat.shadowSide).toBe(THREE.BackSide);

        MeshFactory.release(mat);
    });

    it('creates un-cached individual material when only normalMap or other PBR maps exist', () => {
        const renderObj1: RenderObject = {
            type: 'box',
            params: { size: [1, 1, 1], position: [0, 0, 0], rotation: [0, 0, 0] },
            material: { normalMap: '101', roughness: 0.5 }
        };
        const renderObj2: RenderObject = {
            type: 'box',
            params: { size: [1, 1, 1], position: [0, 0, 0], rotation: [0, 0, 0] },
            material: { normalMap: '101', roughness: 0.5 }
        };

        const mesh1 = MeshFactory.create(renderObj1) as THREE.Mesh;
        const mesh2 = MeshFactory.create(renderObj2) as THREE.Mesh;

        // PBR maps require individual materials for async texture assignment
        expect(mesh1.material).not.toBe(mesh2.material);
    });

    it('maintains backward-compatibility with pure colour materials being cached and shared', () => {
        const renderObj1: RenderObject = {
            type: 'box',
            params: { size: [1, 1, 1], position: [0, 0, 0], rotation: [0, 0, 0] },
            material: { color: 0x123456, roughness: 0.85, metalness: 0 }
        };
        const renderObj2: RenderObject = {
            type: 'box',
            params: { size: [1, 1, 1], position: [0, 0, 0], rotation: [0, 0, 0] },
            material: { color: 0x123456, roughness: 0.85, metalness: 0 }
        };

        const mesh1 = MeshFactory.create(renderObj1) as THREE.Mesh;
        const mesh2 = MeshFactory.create(renderObj2) as THREE.Mesh;

        // Pure colours without maps should be shared
        expect(mesh1.material).toBe(mesh2.material);

        MeshFactory.release(mesh1.material);
        MeshFactory.release(mesh2.material);
    });
});
