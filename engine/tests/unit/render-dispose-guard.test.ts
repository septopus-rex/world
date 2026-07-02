import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { RenderEngine } from '../../src/render/RenderEngine';
import { MeshFactory } from '../../src/render/MeshFactory';

// MeshFactory's process-wide cached geometry/material are shared by reference
// across every block. Two invariants, in tension, both required:
//   1. SAFETY  — evicting one block must never free a resource another live
//      block still renders with (the original CRITICAL eviction bug).
//   2. BOUNDS  — the cache must not grow forever (hardening ①): entries are
//      REF-COUNTED (create() acquires, disposeMeshResources releases via
//      MeshFactory.release) and are disposed + evicted at zero users.
// We test the REAL paths (static, no WebGL context needed).

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

    it('wirebox does NOT retain a cache entry (throwaway base geometry)', () => {
        const before = MeshFactory.cacheStats().geometries;
        MeshFactory.create({ type: 'wirebox', params: { size: [9.13, 9.13, 9.13], position: [0, 0, 0], rotation: [0, 0, 0] }, material: {} } as any);
        expect(MeshFactory.cacheStats().geometries).toBe(before); // no new entry
    });
});

describe('RenderEngine.disposeMeshResources — refcounted shared resources', () => {
    it('SAFETY: evicting one mesh leaves a sibling sharing the same geometry intact', () => {
        const a = MeshFactory.create(ro([5, 1, 5], 0xabcdef)) as THREE.Mesh;
        const b = MeshFactory.create(ro([5, 1, 5], 0xabcdef)) as THREE.Mesh;
        const geoFired = onDispose(a.geometry);
        dispose(a); // "block A evicted" — b still uses the geometry
        expect(geoFired(), 'shared geometry survives while another user lives').toBe(false);
        expect(b.geometry).toBe(a.geometry);
        expect((b.geometry as any).attributes.position.count).toBeGreaterThan(0);
    });

    it('BOUNDS: the LAST user releasing frees the entry and evicts it from the cache', () => {
        const a = MeshFactory.create(ro([7.77, 1, 7.77], 0x445566)) as THREE.Mesh;
        const b = MeshFactory.create(ro([7.77, 1, 7.77], 0x445566)) as THREE.Mesh;
        const geoFired = onDispose(a.geometry);
        const matFired = onDispose(a.material);
        dispose(a);
        expect(geoFired()).toBe(false); // b still holds it
        dispose(b);
        expect(geoFired(), 'geometry disposed at zero users').toBe(true);
        expect(matFired(), 'material disposed at zero users').toBe(true);
        // The cache no longer serves the dead instance — a new create gets a
        // FRESH geometry (no dangling reference to the disposed one).
        const c = MeshFactory.create(ro([7.77, 1, 7.77], 0x445566)) as THREE.Mesh;
        expect(c.geometry).not.toBe(a.geometry);
        dispose(c); // leave the cache clean for other tests
    });

    it('double-dispose of the same mesh releases its reference only once', () => {
        const a = MeshFactory.create(ro([3.3, 3.3, 3.3], 0x102030)) as THREE.Mesh;
        const b = MeshFactory.create(ro([3.3, 3.3, 3.3], 0x102030)) as THREE.Mesh;
        const geoFired = onDispose(a.geometry);
        dispose(a);
        dispose(a); // second call must be a no-op (idempotence guard)
        expect(geoFired(), 'b still holds the geometry — a double-release would have freed it').toBe(false);
        dispose(b);
        expect(geoFired()).toBe(true);
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
        const keep = MeshFactory.create(ro([4, 4, 4], 0xffffff, '9')) as THREE.Mesh; // second user keeps the geometry alive
        const sharedTex = new THREE.Texture();
        (t.material as THREE.MeshStandardMaterial).map = sharedTex; // as the swap would assign
        const geoFired = onDispose(t.geometry);
        const matFired = onDispose(t.material);
        const texFired = onDispose(sharedTex);
        dispose(t);
        expect(matFired(), 'fresh textured material disposed').toBe(true);
        expect(geoFired(), 'shared geometry spared (still one user)').toBe(false);
        expect(texFired(), 'shared texture NOT freed by material disposal').toBe(false);
        dispose(keep);
    });

    it('skips a whole model-clone mesh (userData.shared on the mesh)', () => {
        const clone = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
        clone.userData.shared = true; // ResourceManager tags clone meshes
        const geoFired = onDispose(clone.geometry);
        dispose(clone);
        expect(geoFired(), 'template geometry shared by clones NOT disposed').toBe(false);
    });

    it('isolateMaterial releases the displaced shared material reference', () => {
        const a = MeshFactory.create(ro([6.6, 6.6, 6.6], 0x778899)) as THREE.Mesh;
        const shared = a.material as THREE.Material;
        const matFired = onDispose(shared);
        // Clone-on-write: a stops using the shared material...
        (RenderEngine as any).isolateMaterial(a);
        expect(a.material).not.toBe(shared);
        // ...and its reference was released — a was the ONLY user, so the shared
        // entry is freed instead of lingering forever.
        expect(matFired(), 'displaced shared material freed at zero users').toBe(true);
        dispose(a); // frees the clone + releases the geometry
    });
});
