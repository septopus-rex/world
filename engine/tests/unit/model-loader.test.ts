import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ModelLoader } from '../../src/render/loaders/ModelLoader';

describe('ModelLoader — format gate', () => {
    it('rejects formats the old engine advertised but never implemented (3ds/mmd)', async () => {
        const loader = new ModelLoader();
        await expect(loader.parse('3ds', 'x.3ds')).rejects.toThrow(/not supported/i);
        await expect(loader.parse('mmd', 'x.pmx')).rejects.toThrow(/not supported/i);
        await expect(loader.parse('', 'x')).rejects.toThrow(/not supported/i);
    });

    it('does NOT reject first-class formats at the gate (gltf/glb/fbx/obj dispatch onward)', async () => {
        const loader = new ModelLoader();
        // A bogus url will fail at load time, but NOT with the "not supported" gate
        // error — proving the format was accepted and dispatched to a real loader.
        for (const fmt of ['glb', 'gltf', 'fbx', 'obj']) {
            const err = await loader.parse(fmt, 'file:///does/not/exist.bin').then(() => null, e => e);
            expect(err, `${fmt} should attempt a load`).toBeTruthy();
            expect(String(err.message), `${fmt} dispatched past the gate`).not.toMatch(/not supported/i);
        }
    });
});

describe('ModelLoader — computeBounds', () => {
    it('returns the AABB of a template (for scaling clones to authored size)', () => {
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 6));
        group.add(mesh);
        const box = ModelLoader.computeBounds(group);
        const size = box.getSize(new THREE.Vector3());
        expect(size.x).toBeCloseTo(4);
        expect(size.y).toBeCloseTo(2);
        expect(size.z).toBeCloseTo(6);
    });
});
