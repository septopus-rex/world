import * as THREE from 'three';

/**
 * World-space box UVs — the structural fix for the old engine's texture "mosaic"
 * (低 texel 密度), and the geometry half of the texture protocol
 * (protocol/{cn,en}/texture.md §5–6).
 *
 * TWO scales, kept separate (texture.md §3–4):
 *   · WORLD SIZE (density) — how much world one image covers — lives on the
 *     TEXTURE as `size` and is applied via `texture.repeat = 1/size`
 *     (ResourceManager). NOT here.
 *   · GEOMETRY UV — this file — carries each face's extent in METRES (1 UV unit =
 *     1 metre) so tiling tracks face size (texel density is constant: a 16 m floor
 *     and a 1 m crate look equally crisp). Sampled tiles = metresUV × (1/size) =
 *     faceSizeMeters / size.
 *
 * ANCHOR (texture.md §6): face-local `[bottom, left]`. UVs are derived from vertex
 * POSITIONS so the origin sits at each face's min corner, with V running along
 * world height on the four VERTICAL faces — a wall's texture starts with a full
 * tile at the ground, not clipped mid-tile. Deterministic from (w,h,d), so it
 * still composes with MeshFactory's size-keyed geometry cache and preserves
 * texture dedup (one shared texture, repeat = 1/size, serves every face size).
 */

/** 1 UV unit = this many metres. The density knob moved to per-texture `size`
 *  (texture.md §3); the geometry side is now a plain metre mapping (=1). Kept
 *  exported for the cross-engine density contract note in texture.md §5. */
export const DEFAULT_TILE_METERS = 1;

/**
 * Rewrite a (1-segment) BoxGeometry's UVs to world-metre, [bottom,left]-anchored
 * coordinates. Box dims are Three [w(x), h(y), d(z)] in metres.
 *
 * Non-segmented BoxGeometry = 24 verts, 4 per face, THREE build order
 * +x,-x,+y,-y,+z,-z. Per face we pick the two spanning axes and map
 * U = (pos + half) along the horizontal axis, V likewise along "up":
 *   ±x faces span (z, y) · ±y faces span (x, z) · ±z faces span (x, y)
 * so on the four vertical faces V = world height (y) → V=0 at the bottom edge.
 */
export function applyBoxWorldUV(
    geometry: THREE.BufferGeometry,
    dims: [number, number, number]
): void {
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!uv || !pos || uv.count !== 24) return; // not a standard 1-segment box — leave UVs alone

    const half: [number, number, number] = [dims[0] / 2, dims[1] / 2, dims[2] / 2];
    const axis = (i: number, a: number) => (a === 0 ? pos.getX(i) : a === 1 ? pos.getY(i) : pos.getZ(i));

    // per face (build order): [uAxis, vAxis]. 0=x, 1=y(height), 2=z.
    const faces: Array<[number, number]> = [
        [2, 1], // +x : U=z, V=height
        [2, 1], // -x
        [0, 2], // +y (top)    : U=x, V=z
        [0, 2], // -y (bottom)
        [0, 1], // +z : U=x, V=height
        [0, 1], // -z
    ];

    for (let f = 0; f < 6; f++) {
        const [ua, va] = faces[f];
        for (let v = 0; v < 4; v++) {
            const i = f * 4 + v;
            uv.setXY(i, axis(i, ua) + half[ua], axis(i, va) + half[va]); // metres, origin at min corner
        }
    }
    uv.needsUpdate = true;
}
