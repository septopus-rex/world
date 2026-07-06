import type { AuthoredLevel } from '@engine/core/services/AuthoredLevel';
import { AdjunctType } from '@engine/core/types/AdjunctType';

/**
 * refineScene — a diorama for SPP RECURSIVE REFINEMENT (Workstream D, protocol
 * §3.2.5), reached via `?level=refine`. Two structures from ONE b6 source:
 *
 *   WEST  — a coarse 4m solid cell (level 0): a plain closed box, 6 big faces.
 *   EAST  — the SAME 4m footprint, but REFINED into a 2×2×2 grid of level-1 (2m)
 *           children. The children carry no faces of their own: each INHERITS the
 *           parent's boundary faces and defaults its interior faces to Open, so
 *           the shell is rebuilt at finer resolution and the parent's south-face
 *           doorway passes through as an opening. The coarse parent emits nothing
 *           (finer-owns). → the east structure is a hollow room of 2m walls with
 *           a doorway, vs the west solid 4m block.
 *
 * The engine holds no level content; this composes the source programmatically.
 */

const SPP = AdjunctType.Spp;   // 0x00b6
const BOX = AdjunctType.Box;   // 0x00a2

export const REFINE_BLOCK: [number, number] = [2050, 2050];

const solid6: Array<[number, number]> = [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0]];
// solid everywhere except Front (south, index 2) = Open → a doorway interface.
const roomFaces: Array<[number, number]> = [[1, 0], [1, 0], [0, 0], [1, 0], [1, 0], [1, 0]];

/** The 8 children of a 2×2×2 refinement, each inheriting the parent's faces. */
function roomChildren() {
    const cells = [];
    for (let x = 0; x < 2; x++)
        for (let y = 0; y < 2; y++)
            for (let z = 0; z < 2; z++)
                cells.push({ position: [x, y, z], level: 1 }); // no faces → inherit
    return cells;
}

export function buildRefineLevel(): AuthoredLevel {
    const [bx, by] = REFINE_BLOCK;
    const ground = [[16, 16, 0.4], [8, 8, -0.2], [0, 0, 0], 10, [1, 1], 0, 1]; // walkable plane

    // One SPP source, origin near the block's south edge; two cells side by side.
    const origin: [number, number, number] = [3, 3, 0];
    const sppRow = [origin, [
        { position: [0, 0, 0], level: 0, faces: solid6 },                                  // WEST: coarse solid
        { position: [2, 0, 0], level: 0, faces: roomFaces, refinement: { cells: roomChildren() } }, // EAST: refined room
    ], 'basic'];

    return {
        format: 'septopus.world.level',
        version: 1,
        name: 'refine',
        start: { block: REFINE_BLOCK, position: [8, 1.5, 1.7], rotation: [0, 0, 0] },
        blocks: [
            { x: bx, y: by, raw: [0, 1, [[BOX, [ground]], [SPP, [sppRow]]], []] },
        ],
    };
}
