import { MockBlockData } from '@engine/core/mocks/BlockMocks';

/**
 * dynamicAdjunctScene — proof that a DYNAMIC adjunct (type loaded at runtime from
 * sandboxed code, not compiled into the engine) renders from authored block data
 * exactly like a built-in.
 *
 * The flow:
 *   1. DYNAMIC_ADJUNCT_CODE is a tiny JS file. The loader runs it in the
 *      AdjunctSandbox (Web Worker) at boot via engine.loadDynamicAdjunct, which
 *      registers it under DYN_TYPE_ID.
 *   2. This block authors three instances of DYN_TYPE_ID in plain raw — the same
 *      [size, pos, rot, resource, repeat, animate, stop] layout the built-in
 *      primitives use.
 *   3. BlockSystem resolves DYN_TYPE_ID through the registry (built-in → dynamic),
 *      so the monoliths materialize, take collision (stop=1), and are editable —
 *      with ZERO engine code knowing about "monolith".
 *
 * The adjunct is DECLARATIVE: the sandboxed code returns a plain-data descriptor
 * (meta + render parts); the engine builds the meshes via MeshFactory. The code
 * never imports Three.js, so the render-layer boundary stays intact.
 */

/** Block holding the dynamic-adjunct showcase. Not a game zone. */
export const DYN_BLOCK: [number, number] = [2049, 2047];

/** Type-id the dynamic code declares (must match DYNAMIC_ADJUNCT_CODE's meta). */
export const DYN_TYPE_ID = 0xf001;

/** Where to drop the player to view the row of monoliths (SPP local). */
export const DYN_VIEW: [number, number, number] = [8, 2.5, 1];

/**
 * The dynamic adjunct, as sandbox-loadable source. It assigns a plain `hooks`
 * descriptor — a violet box "monolith" capped by a floating golden orb. Kept free
 * of any sandbox-forbidden token (eval / Function / window. / fetch( / …) since
 * AdjunctSandbox.validateCode scans the whole string, comments included.
 */
export const DYNAMIC_ADJUNCT_CODE = `
const PALETTE = [0x6a5acd, 0x2e9bbf, 0xb0478f];
const hooks = {
  meta: { typeId: 0xf001, name: 'monolith', short: 'MON', desc: 'dynamic declarative monolith', version: '1.0.0' },
  layout: 'standard',
  render: [
    { mesh: 'box', color: PALETTE[0] },
    { mesh: 'sphere', color: 0xffd54a, size: [0.8, 0.8, 0.8], offset: [0, 0, 2.4] }
  ]
};
`;

/** Authored block raw seeding three dynamic monoliths in a row. */
export function buildDynamicAdjunctScene(bx: number, by: number): any[] {
    const data = MockBlockData(bx, by);

    // Standard layout: [size[E,N,Alt], pos[ox,oy,oz], rot, resource, repeat, animate, stop].
    // size 1.2×1.2×3.0; oz = height/2 so the 3 m box sits ON the ground; stop=1
    // makes it a solid the player can't walk through.
    const rows: any[] = [
        [[1.2, 1.2, 3.0], [5, 8, 1.5], [0, 0, 0], 0, [1, 1], 0, 1],
        [[1.2, 1.2, 3.0], [8, 8, 1.5], [0, 0, 0], 0, [1, 1], 0, 1],
        [[1.2, 1.2, 3.0], [11, 8, 1.5], [0, 0, 0], 0, [1, 1], 0, 1],
    ];

    (data.raw[2] as any[]).push([DYN_TYPE_ID, rows]);
    return data.raw;
}
