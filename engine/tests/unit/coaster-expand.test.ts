import { describe, it, expect } from 'vitest';
import { expandSpp } from '../../src/core/spp/Expander';
import { getBuiltinAdjunct } from '../../src/core/services/AdjunctRegistry';

// C1: a b6 with the 'coaster' theme COLLAPSES into c1 tube track pieces (one per
// cell), instead of a1 walls. Each track cell has two OPEN faces; the piece is a
// tube through entry-face-center → cell-center → exit-face-center. Adjacent
// cells share a face center, so the pieces line up into a continuous rail.

// faces order [Top, Bottom, Front, Back, Left, Right]; Open=0, Closed=1.
const O: [number, number] = [0, 0]; // open
const C: [number, number] = [1, 0]; // closed
//                Top Bot Front Back Left Right
const straightNS = [C, C, O, O, C, C];   // Front(-Y) + Back(+Y) → straight along N
const upBend = [O, C, O, C, C, C];       // Top(+Z) + Front(-Y) → quarter arc up

describe('SPP coaster collapse (C1)', () => {
    it('a coaster b6 expands to c1 track pieces, one per cell', () => {
        const cells = [
            { position: [0, 0, 0], level: 0, faces: straightNS },
            { position: [0, 1, 0], level: 0, faces: straightNS },
            { position: [0, 2, 0], level: 0, faces: upBend },
        ];
        const rows = expandSpp([[0, 0, 0], cells as any, 'coaster']);
        expect(rows).toHaveLength(3);
        expect(rows.every(([t]) => t === 0x00c1)).toBe(true);
    });

    it('a straight cell makes a collinear (straight) path; control points are face centers', () => {
        const rows = expandSpp([[0, 0, 0], [{ position: [0, 0, 0], level: 0, faces: straightNS }] as any, 'coaster']);
        const [, raw] = rows[0];
        // raw = [cellOrigin, [f1, center, f2], radius]; s=4, h=2
        expect(raw[0]).toEqual([0, 0, 0]);            // cell origin
        expect(raw[1]).toEqual([[2, 0, 2], [2, 2, 2], [2, 4, 2]]); // Front, center, Back — collinear in Y
        expect(raw[2]).toBe(0.3);                     // radius
        // and the c1 adjunct deserializes the expanded raw cleanly
        const std = getBuiltinAdjunct(0x00c1)!.attribute!.deserialize(raw);
        expect(std.path).toEqual([[2, 0, 2], [2, 2, 2], [2, 4, 2]]);
    });

    it('an adjacent-face cell makes an L (arc) path', () => {
        const rows = expandSpp([[0, 0, 0], [{ position: [0, 0, 0], level: 0, faces: upBend }] as any, 'coaster']);
        const [, raw] = rows[0];
        // Top=[2,2,4], center=[2,2,2], Front=[2,0,2] → not collinear → Catmull-Rom arc
        expect(raw[1]).toEqual([[2, 2, 4], [2, 2, 2], [2, 0, 2]]);
    });

    it('cell position offsets the piece origin (continuity across cells)', () => {
        const rows = expandSpp([[1, 2, 3], [{ position: [0, 1, 0], level: 0, faces: straightNS }] as any, 'coaster']);
        const [, raw] = rows[0];
        // cellOrigin = origin + position*4 = [1, 2+4, 3] = [1, 6, 3]
        expect(raw[0]).toEqual([1, 6, 3]);
    });
});
