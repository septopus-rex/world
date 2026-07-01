import * as THREE from 'three';

/**
 * Size-derived UV tiling — the structural fix for the old engine's texture
 * "mosaic" (低 texel 密度) artifact.
 *
 * THE PROBLEM (old engine): a BoxGeometry's UVs are a fixed 0..1 per face,
 * independent of the face's real size. With an authored repeat of ~[1,1], a
 * single low-res image was stretched once across a multi-metre (multi-thousand
 * mm) face — each texel covered a huge area, so up close it read as blocky
 * mosaic. The millimetre scaling only made the faces bigger; the real bug was
 * that tiling never tracked face size.
 *
 * THE FIX: scale each face's UVs by faceSizeMeters / tileMeters, so ONE texture
 * tile always covers `tileMeters` of world space regardless of how large the
 * face is. Texel density is then constant — a 16 m floor and a 1 m crate show
 * the texture at the same crispness. The authored `material.repeat` still
 * applies on top of the shared texture as a fine multiplier.
 *
 * This is deterministic from (w,h,d), so it composes with MeshFactory's
 * size-keyed geometry cache (same size → same UVs → safely shared), and a
 * single shared texture (repeat [1,1]) serves every face size — preserving
 * texture dedup.
 */

/** Default world-space size of one texture tile (metres). 1 tile per 2 m.
 *  Normative cross-engine contract (repeat_per_face = faceSizeMeters / TILE_METERS):
 *  protocol/{cn,en}/adjunct.md §6 — another engine must match this density to align. */
export const DEFAULT_TILE_METERS = 2;

/**
 * Rewrite a (1-segment) BoxGeometry's UVs so texel density is constant across
 * face sizes. Box dims are Three [w(x), h(y), d(z)] in metres.
 *
 * Face/vertex layout for a non-segmented BoxGeometry (24 verts, 4 per face) in
 * THREE's build order: +x, -x, +y, -y, +z, -z. Each face's two UV axes map to
 * two of the three dimensions:
 *   ±x faces span (d, h) · ±y faces span (w, d) · ±z faces span (w, h)
 */
export function applyBoxWorldUV(
    geometry: THREE.BufferGeometry,
    dims: [number, number, number],
    tileMeters: number = DEFAULT_TILE_METERS
): void {
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
    if (!uv || uv.count !== 24) return; // not a standard 1-segment box — leave UVs alone

    const tile = tileMeters > 1e-6 ? tileMeters : DEFAULT_TILE_METERS;
    const [w, h, d] = dims;

    // [uSpanMeters, vSpanMeters] per face, in build order.
    const faceSpans: Array<[number, number]> = [
        [d, h], // +x
        [d, h], // -x
        [w, d], // +y
        [w, d], // -y
        [w, h], // +z
        [w, h], // -z
    ];

    for (let face = 0; face < 6; face++) {
        const [uSpan, vSpan] = faceSpans[face];
        const su = uSpan / tile;
        const sv = vSpan / tile;
        for (let v = 0; v < 4; v++) {
            const i = face * 4 + v;
            uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
        }
    }
    uv.needsUpdate = true;
}
