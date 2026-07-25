import { describe, it, expect } from 'vitest';
import { getBuiltinAdjunct } from '../../src/core/services/AdjunctRegistry';
import { AdjunctType } from '../../src/core/types/AdjunctType';
import { thinAxis } from '../../src/plugins/adjunct/_shared';
import type { STDObject, RenderObject } from '../../src/core/types/Adjunct';

// ─── Composite shapes for the functional adjuncts (2026-07-25) ───────────────
//
// e4 book / e5 board / e1 link / e3 video / e2 audio each used to render as ONE
// flat-coloured box. They now emit a handful of sub-boxes (cover · spine · pages
// · brass plate, frame · cork · pins, bezel · face …) so a book reads as a book.
//
// This file pins the invariants that make that VISUAL-ONLY, because every one of
// them is a way the refinement could silently break something real:
//   · parts stay inside the AUTHORED AABB → nothing pokes through the wall or
//     floor the author placed it against, and the collider (built from the STD
//     row, not from parts) still describes what you see;
//   · part 0 is the PRIMARY surface → callers/tests that mean "the panel" get it;
//   · a media directive rides on EXACTLY ONE part → AdjunctFactory attaches the
//     VideoTexture/PositionalAudio to that mesh, so N parts must not mean N players;
//   · sub-parts carry NO rotation → the mesh GROUP already applies the row's, and
//     repeating it would rotate every child twice.

/** Septopus-axis size (engine order is [w=E, h=Alt, d=N] — Coords.getBoxDimensions). */
const septSize = (p: RenderObject): [number, number, number] =>
    [p.params.size[0], p.params.size[2], p.params.size[1]];

const CASES: Array<{ name: string; typeId: number; raw: any[]; parts: number; media?: 'audio' | 'video' }> = [
    { name: 'e4 book', typeId: AdjunctType.Book, parts: 6, raw: [[0.7, 0.2, 0.9], [8, 8, 1], [0, 0, 0], 0, [1, 1], 0, 0, ['p1'], 'Title'] },
    { name: 'e5 board', typeId: AdjunctType.Board, parts: 7, raw: [[2.4, 0.15, 1.6], [8, 8, 1.5], [0, 0, 0], 0, [1, 1], 0, 0, 'chan'] },
    { name: 'e1 link', typeId: AdjunctType.Link, parts: 3, raw: [[1.2, 0.1, 1.2], [8, 8, 1.5], [0, 0, 0], 0, [1, 1], null, null, 'https://x.io'] },
    { name: 'e3 video', typeId: AdjunctType.Video, parts: 3, media: 'video', raw: [[3.2, 0.1, 1.8], [8, 8, 2], [0, 0, 0], 'clip.mp4'] },
    { name: 'e2 audio', typeId: AdjunctType.Audio, parts: 3, media: 'audio', raw: [[0.4, 0.4, 0.4], [8, 8, 1], [0, 0, 0], 'tune.mp3'] },
];

describe('functional adjuncts — composite shapes stay visual-only', () => {
    for (const c of CASES) {
        const def = getBuiltinAdjunct(c.typeId)! as any;
        const std: STDObject = def.attribute.deserialize(c.raw);
        const parts: RenderObject[] = def.transform.stdToRenderData([std], 0);

        it(`${c.name}: emits a multi-part shape (was a single box)`, () => {
            expect(parts.length).toBe(c.parts);
            expect(parts.every((p) => p.type === 'box')).toBe(true);
            // More than one distinct material — the material BREAKS are what make a
            // silhouette read as an object rather than a prism.
            const colors = new Set(parts.map((p) => p.material?.color));
            expect(colors.size).toBeGreaterThan(1);
        });

        it(`${c.name}: every part sits inside the authored AABB`, () => {
            const body = [std.x, std.y, std.z].map(Math.abs);
            const centre = [std.ox, std.oy, std.oz];
            for (const [i, p] of parts.entries()) {
                const size = septSize(p);
                const pos = p.params.position;
                for (const a of [0, 1, 2]) {
                    const reach = Math.abs(pos[a] - centre[a]) + size[a] / 2;
                    // 10% slack: a face may stand a few percent proud of its frame to
                    // avoid coplanar z-fighting, and `min` floors degenerate trim.
                    expect(reach, `${c.name} part ${i} axis ${a} escapes the AABB`)
                        .toBeLessThanOrEqual(body[a] / 2 + Math.max(0.05, body[a] * 0.1));
                }
            }
        });

        it(`${c.name}: sub-parts carry no rotation of their own`, () => {
            for (const p of parts) expect(p.params.rotation).toEqual([0, 0, 0]);
        });

        if (c.media) {
            it(`${c.name}: the media directive rides on exactly one part`, () => {
                const carriers = parts.filter((p) => (p as any).media);
                expect(carriers.length).toBe(1);
                expect((carriers[0] as any).media.kind).toBe(c.media);
                expect(carriers[0]).toBe(parts[0]); // part 0 = the primary surface
            });
        }
    }
});

describe('functional adjuncts — the derived axis follows the authored proportions', () => {
    it('thinAxis picks the panel/cover normal, upright or flat', () => {
        const mk = (x: number, y: number, z: number) => ({ x, y, z } as STDObject);
        expect(thinAxis(mk(0.7, 0.2, 0.9))).toBe(1);   // upright tome, thin along N
        expect(thinAxis(mk(0.7, 0.9, 0.2))).toBe(2);   // lying flat, thin along Alt
        expect(thinAxis(mk(0.2, 0.9, 0.7))).toBe(0);   // edge-on, thin along E
    });

    it('a book lying flat still gets covers on its flat faces', () => {
        const def = getBuiltinAdjunct(AdjunctType.Book)! as any;
        const std = def.attribute.deserialize([[0.7, 0.9, 0.2], [8, 8, 1], [0, 0, 0], 0, [1, 1], 0, 0, ['p'], 'T']);
        const parts: RenderObject[] = def.transform.stdToRenderData([std], 0);
        // Covers are the two widest-area parts and must be thin along Alt (engine h).
        const covers = parts.filter((p) => septSize(p)[2] < 0.06);
        expect(covers.length).toBeGreaterThanOrEqual(2);
    });
});

describe('functional adjuncts — the authored texture lands on the face', () => {
    it('e1 link: slot 8 texture goes to part 0, tinted white', () => {
        const def = getBuiltinAdjunct(AdjunctType.Link)! as any;
        const std = def.attribute.deserialize(
            [[1.2, 0.1, 1.2], [8, 8, 1.5], [0, 0, 0], 0, [1, 1], null, null, 'https://x.io', 9]);
        const parts: RenderObject[] = def.transform.stdToRenderData([std], 0);
        expect(parts[0].material?.texture).toBe('9');
        expect(parts[0].material?.color).toBe(0xffffff);
        expect(parts.slice(1).every((p) => p.material?.texture == null),
            'the frame must not be wallpapered with the QR code').toBe(true);
    });

    it('e4 book: a cover texture lands on both covers only', () => {
        const def = getBuiltinAdjunct(AdjunctType.Book)! as any;
        const std = def.attribute.deserialize([[0.7, 0.2, 0.9], [8, 8, 1], [0, 0, 0], 0, [1, 1], 0, 0, ['p'], 'T']);
        (std.material as any).texture = '7';
        const parts: RenderObject[] = def.transform.stdToRenderData([std], 0);
        const textured = parts.filter((p) => p.material?.texture === '7');
        expect(textured.length).toBe(2);
        expect(textured.every((p) => p.material?.color === 0xffffff)).toBe(true);
    });
});
