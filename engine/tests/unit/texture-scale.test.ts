import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { applyBoxWorldUV, DEFAULT_TILE_METERS } from '../../src/render/TextureScale';

// The anti-mosaic core (texture.md §5): box UVs are in METRES (1 UV unit = 1 m),
// so tiling tracks face size and texel density is CONSTANT — a 16 m floor and a
// 1 m crate show the texture at the same crispness. Density itself now lives on
// the texture (`size` → repeat = 1/size, tested via ResourceManager); this file
// only pins the geometry side: metre-scaled, [bottom,left]-anchored UVs.

/** Max U,V on the +y (top) face of a 1-segment box (verts 8..11). */
function topFaceMaxUV(geo: THREE.BufferGeometry): [number, number] {
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    let mu = 0, mv = 0;
    for (let i = 8; i < 12; i++) { mu = Math.max(mu, uv.getX(i)); mv = Math.max(mv, uv.getY(i)); }
    return [mu, mv];
}
/** Min V on the +z (a VERTICAL) face — verts 16..19. */
function sideFaceMinV(geo: THREE.BufferGeometry): number {
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    let mv = Infinity;
    for (let i = 16; i < 20; i++) mv = Math.min(mv, uv.getY(i));
    return mv;
}

describe('TextureScale — world-metre, [bottom,left]-anchored box UVs', () => {
    it('UVs are the face extent in metres (1 UV unit = 1 m)', () => {
        const floor = new THREE.BoxGeometry(16, 0.2, 16);
        applyBoxWorldUV(floor, [16, 0.2, 16]);
        const [fu, fv] = topFaceMaxUV(floor);
        expect(fu).toBeCloseTo(16); // top face spans w=16 m in U
        expect(fv).toBeCloseTo(16); // and d=16 m in V
    });

    it('keeps texel density CONSTANT across wildly different face sizes', () => {
        const big = new THREE.BoxGeometry(16, 1, 16);
        const small = new THREE.BoxGeometry(1, 1, 1);
        applyBoxWorldUV(big, [16, 1, 16]);
        applyBoxWorldUV(small, [1, 1, 1]);
        const [bu] = topFaceMaxUV(big);
        const [su] = topFaceMaxUV(small);
        // UV-per-metre must be equal (= 1) for both → same density once tiled.
        expect(bu / 16).toBeCloseTo(su / 1);
        expect(bu / 16).toBeCloseTo(1);
    });

    it('anchors [bottom,left]: a vertical face starts at V=0 (a full tile at the ground)', () => {
        const wall = new THREE.BoxGeometry(3, 2, 0.2);
        applyBoxWorldUV(wall, [3, 2, 0.2]);
        expect(sideFaceMinV(wall)).toBeCloseTo(0); // bottom edge of the wall = V 0
    });

    it('leaves non-box geometry untouched', () => {
        const plane = new THREE.PlaneGeometry(4, 4);
        const before = (plane.getAttribute('uv') as THREE.BufferAttribute).getX(0);
        applyBoxWorldUV(plane, [4, 0, 4]);
        const after = (plane.getAttribute('uv') as THREE.BufferAttribute).getX(0);
        expect(after).toBe(before);
        expect(DEFAULT_TILE_METERS).toBeGreaterThan(0);
    });
});
