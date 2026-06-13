import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MeshFactory } from '../../src/render/MeshFactory';

// The 'tube' geometry type: a Catmull-Rom sweep through control points. This is
// the rail / pipe / coaster-track primitive the old engine only ever stubbed
// (its ge_tube.create() returned a plain BoxGeometry). Geometry construction is
// pure CPU math — no WebGL — so it runs headlessly.

function tube(path: [number, number, number][], radius = 0.3, radialSeg = 8, closed = false) {
    return MeshFactory.create({
        type: 'tube',
        params: { size: [radius, radialSeg, 0], position: [0, 0, 0], rotation: [0, 0, 0], path, closed },
    } as any) as THREE.Mesh;
}

describe('MeshFactory — tube/extrude geometry', () => {
    it('sweeps a real tube through the path (not a box)', () => {
        const mesh = tube([[0, 0, 0], [5, 0, 0], [10, 2, 0], [15, 0, 0]]);
        expect(mesh.isMesh).toBe(true);
        const geo = mesh.geometry;
        // A TubeGeometry over a 4-point path samples (3 segments × 12) tubular ×
        // 8 radial rings → far more vertices than a 24-vertex box.
        const verts = geo.getAttribute('position').count;
        expect(verts).toBeGreaterThan(200);
        // It is genuinely a tube: bounding box spans the path extent (~15m long,
        // ~2m of vertical bow), not a tiny cube.
        geo.computeBoundingBox();
        const size = new THREE.Vector3();
        geo.boundingBox!.getSize(size);
        expect(size.x).toBeGreaterThan(14);
        expect(size.y).toBeGreaterThan(1);
    });

    it('radial segment count drives the ring resolution', () => {
        const coarse = tube([[0, 0, 0], [10, 0, 0]], 0.3, 3).geometry.getAttribute('position').count;
        const fine = tube([[0, 0, 0], [10, 0, 0]], 0.3, 16).geometry.getAttribute('position').count;
        expect(fine).toBeGreaterThan(coarse);
    });

    it('a closed path loops back on itself', () => {
        const open = tube([[0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10]], 0.3, 8, false);
        const loop = tube([[0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10]], 0.3, 8, true);
        // The closed curve adds the wrap-around segment → strictly more samples.
        expect(loop.geometry.getAttribute('position').count)
            .toBeGreaterThan(open.geometry.getAttribute('position').count);
    });

    it('a degenerate path (<2 points) falls back to a tiny box — never throws', () => {
        const mesh = tube([[1, 1, 1]], 0.4);
        expect(mesh.isMesh).toBe(true);
        // A unit box has 24 position vertices.
        expect(mesh.geometry.getAttribute('position').count).toBe(24);
    });
});
