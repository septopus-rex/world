import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { RenderEngine } from '../../src/render/RenderEngine';
import { MeshFactory } from '../../src/render/MeshFactory';

// Regression for the CRITICAL eviction bug: MeshFactory's process-wide cached
// geometry/material are shared by reference across EVERY block, so disposing them
// when one block is evicted corrupts all other live blocks. The fix tags cached
// resources userData.shared and the disposal guard skips them. We test the REAL
// guard (RenderEngine.disposeMeshResources, static so it needs no WebGL context).

const dispose = (obj: any) => (RenderEngine as any).disposeMeshResources(obj);
const ro = (size: number[], color: number, texture?: string) => ({
    type: 'box',
    params: { size, position: [0, 0, 0], rotation: [0, 0, 0] },
    material: texture ? { color, texture } : { color },
}) as any;

function onDispose(res: any): () => boolean {
    let fired = false;
    res.addEventListener?.('dispose', () => { fired = true; });
    return () => fired;
}

describe('MeshFactory — shared-by-reference tagging', () => {
    it('caches + tags colour geometry/material as shared across calls', () => {
        const a = MeshFactory.create(ro([2, 2, 2], 0x884422)) as THREE.Mesh;
        const b = MeshFactory.create(ro([2, 2, 2], 0x884422)) as THREE.Mesh;
        expect(a.geometry).toBe(b.geometry);        // one geometry for both
        expect(a.material).toBe(b.material);          // one colour material for both
        expect((a.geometry as any).userData.shared).toBe(true);
        expect((a.material as any).userData.shared).toBe(true);
    });

    it('gives textured surfaces a FRESH, un-shared material (geometry still shared)', () => {
        const a = MeshFactory.create(ro([2, 2, 2], 0xffffff, '7')) as THREE.Mesh;
        const b = MeshFactory.create(ro([2, 2, 2], 0xffffff, '7')) as THREE.Mesh;
        expect(a.geometry).toBe(b.geometry);          // shared geometry
        expect(a.material).not.toBe(b.material);       // per-surface material
        expect((a.material as any).userData.shared).toBeFalsy();
    });
});

describe('RenderEngine.disposeMeshResources — shared-resource guard', () => {
    it('does NOT dispose MeshFactory-cached (shared) geometry/material', () => {
        const m = MeshFactory.create(ro([3, 3, 3], 0x223344)) as THREE.Mesh;
        const geoFired = onDispose(m.geometry);
        const matFired = onDispose(m.material);
        dispose(m);
        expect(geoFired(), 'shared geometry NOT disposed').toBe(false);
        expect(matFired(), 'shared material NOT disposed').toBe(false);
    });

    it('the critical case: evicting one mesh leaves a sibling sharing the same geometry intact', () => {
        const a = MeshFactory.create(ro([5, 1, 5], 0xabcdef)) as THREE.Mesh;
        const b = MeshFactory.create(ro([5, 1, 5], 0xabcdef)) as THREE.Mesh;
        const geoFired = onDispose(a.geometry);
        dispose(a); // "block A evicted"
        expect(geoFired()).toBe(false);
        // block B still renders: its geometry is the same live instance.
        expect(b.geometry).toBe(a.geometry);
        expect((b.geometry as any).attributes.position.count).toBeGreaterThan(0);
    });

    it('DOES dispose instance-owned (fresh, un-shared) geometry + material', () => {
        const fresh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
        const geoFired = onDispose(fresh.geometry);
        const matFired = onDispose(fresh.material);
        dispose(fresh);
        expect(geoFired()).toBe(true);
        expect(matFired()).toBe(true);
    });

    it('disposes a textured mesh\'s fresh material but spares the shared geometry + the shared texture', () => {
        const t = MeshFactory.create(ro([4, 4, 4], 0xffffff, '9')) as THREE.Mesh;
        const sharedTex = new THREE.Texture();
        (t.material as THREE.MeshStandardMaterial).map = sharedTex; // as the swap would assign
        const geoFired = onDispose(t.geometry);
        const matFired = onDispose(t.material);
        const texFired = onDispose(sharedTex);
        dispose(t);
        expect(matFired(), 'fresh textured material disposed').toBe(true);
        expect(geoFired(), 'shared geometry spared').toBe(false);
        expect(texFired(), 'shared texture NOT freed by material disposal').toBe(false);
    });

    it('skips a whole model-clone mesh (userData.shared on the mesh)', () => {
        const clone = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
        clone.userData.shared = true; // ResourceManager.markShared tags clone meshes
        const geoFired = onDispose(clone.geometry);
        dispose(clone);
        expect(geoFired(), 'template geometry shared by clones NOT disposed').toBe(false);
    });
});
