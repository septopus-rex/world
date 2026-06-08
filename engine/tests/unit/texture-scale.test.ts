import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { applyBoxWorldUV, DEFAULT_TILE_METERS } from '../../src/render/TextureScale';

// The anti-mosaic core: UVs scale with face size so texel density is CONSTANT.
// A 16 m floor and a 1 m crate must show the texture at the same crispness — the
// exact opposite of the old engine, where a fixed 0..1 UV stretched one tile
// across a huge (mm-inflated) face → blocky mosaic.

/** Max UV on the +y (top) face of a 1-segment box = its (w/tile, d/tile). */
function topFaceMaxUV(geo: THREE.BufferGeometry): [number, number] {
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    let mu = 0, mv = 0;
    for (let i = 8; i < 12; i++) { mu = Math.max(mu, uv.getX(i)); mv = Math.max(mv, uv.getY(i)); }
    return [mu, mv];
}

describe('TextureScale — size-derived UV tiling', () => {
    it('tile count tracks face size (one tile per tileMeters)', () => {
        const tile = 2;
        const floor = new THREE.BoxGeometry(16, 0.2, 16);
        applyBoxWorldUV(floor, [16, 0.2, 16], tile);
        const [fu, fv] = topFaceMaxUV(floor);
        expect(fu).toBeCloseTo(16 / tile); // 8 tiles across 16 m
        expect(fv).toBeCloseTo(16 / tile);
    });

    it('keeps texel density CONSTANT across wildly different face sizes', () => {
        const tile = 2;
        const big = new THREE.BoxGeometry(16, 1, 16);
        const small = new THREE.BoxGeometry(1, 1, 1);
        applyBoxWorldUV(big, [16, 1, 16], tile);
        applyBoxWorldUV(small, [1, 1, 1], tile);

        const [bu] = topFaceMaxUV(big);
        const [su] = topFaceMaxUV(small);
        // tiles-per-metre = maxU / sizeMetres — must be equal (= 1/tile) for both.
        expect(bu / 16).toBeCloseTo(su / 1);
        expect(bu / 16).toBeCloseTo(1 / tile);
    });

    it('defaults the tile size and leaves non-standard geometry untouched', () => {
        // A plane (not a 24-vertex box) must be left alone (no corruption).
        const plane = new THREE.PlaneGeometry(4, 4);
        const before = (plane.getAttribute('uv') as THREE.BufferAttribute).getX(0);
        applyBoxWorldUV(plane, [4, 0, 4]);
        const after = (plane.getAttribute('uv') as THREE.BufferAttribute).getX(0);
        expect(after).toBe(before);
        expect(DEFAULT_TILE_METERS).toBeGreaterThan(0);
    });
});
