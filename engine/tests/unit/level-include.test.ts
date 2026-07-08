import { describe, it, expect } from 'vitest';
import { levelSceneProvider, type AuthoredLevel } from '../../src/core/services/AuthoredLevel';

// full-data-migration.md P1 — AuthoredLevel `include(ref, offset, overlay)` makes
// worldHub-class composition (hub + relocated sub-level + injected anchor/portal)
// pure DATA. The offset only shifts block KEYS; content rides verbatim (relies on
// block-relative refs, the sibling P1 change). Own blocks win; overlay merges
// extra adjunct groups into the post-offset coord; the source doc is never mutated.

const A2 = 0x00a2; // box
const B8 = 0x00b8; // trigger (used here as the overlaid arrival anchor)

const box = (color: number): any => [[1, 1, 1], [8, 8, 0.5], [0, 0, 0], color, [1, 1], 0, 0];
const anchorRow: any = [[2, 2, 2], [8, 8, 1], [0, 0, 0], 1, 0, [], { name: 'arrival' }];
const blk = (groups: any): any => [0, 1, groups, [], 0];

const lvl = (name: string, extra: Partial<AuthoredLevel>): AuthoredLevel => ({
    format: 'septopus.world.level', version: 1, name,
    start: { block: [0, 0], position: [8, 8, 1], rotation: [0, 0, 0] },
    blocks: [], ...extra,
});

const sub = lvl('sub', { blocks: [{ x: 5, y: 5, raw: blk([[A2, [box(9)]]]) }] });

const composed = lvl('composed', {
    blocks: [{ x: 100, y: 100, raw: blk([[A2, [box(2)]]]) }], // hub
    include: [{
        level: sub,
        offset: [110, 100],                         // sub [5,5] → [115,105]
        overlay: { '115_105': [[B8, [anchorRow]]] }, // inject an arrival anchor there
    }],
});

describe('AuthoredLevel include composition (full-data-migration P1)', () => {
    const p = levelSceneProvider(composed);

    it('own block wins over includes', () => {
        expect(p.block(100, 100)[2]).toEqual([[A2, [box(2)]]]);
    });

    it('included sub-level appears at the offset, with overlay groups merged', () => {
        const raw = p.block(115, 105);
        const groups = raw[2] as any[];
        expect(groups.map((g) => g[0])).toEqual([A2, B8]);       // sub's box + overlaid anchor
        expect(groups[0]).toEqual([A2, [box(9)]]);               // sub content intact
        expect(groups[1]).toEqual([B8, [anchorRow]]);            // anchor appended
    });

    it('unauthored coord → empty block', () => {
        expect(p.block(999, 999)).toEqual([0, 1, [], [], 0]);
    });

    it('does not mutate the included source doc (overlay clones)', () => {
        p.block(115, 105);
        expect(sub.blocks[0].raw![2]).toEqual([[A2, [box(9)]]]); // no anchor leaked in
    });
});

describe('AuthoredLevel fallback + ref resolution (P7)', () => {
    const registry: Record<string, any> = {
        'blk:ground': blk([[A2, [box(7)]]]),
        'lvl:sub': sub,
    };
    const resolver = (ref: string) => registry[ref] ?? null;

    const doc = lvl('with-fallback', {
        blocks: [
            { x: 1, y: 1, raw: blk([[A2, [box(2)]]]) },
            { x: 2, y: 2, ref: 'blk:ground' } as any,       // block by REF
        ],
        include: [{ ref: 'lvl:sub', offset: [10, 10] } as any], // include by REF
        fallback: { ref: 'blk:ground' } as any,                  // fallback by REF
    });
    const p = levelSceneProvider(doc, resolver);

    it('resolves block refs through the host resolver', () => {
        expect(p.block(2, 2)[2]).toEqual([[A2, [box(7)]]]);
    });

    it('resolves include refs (sub-level at offset)', () => {
        expect(p.block(15, 15)[2]).toEqual([[A2, [box(9)]]]); // sub [5,5] + [10,10]
    });

    it('serves the declared fallback for unauthored coords, as fresh clones', () => {
        const a = p.block(500, 500);
        const b = p.block(501, 500);
        expect(a[2]).toEqual([[A2, [box(7)]]]);
        expect(b).toEqual(a);
        expect(b).not.toBe(a);              // clone per coordinate — no aliasing
        (a[2] as any).push(['junk']);
        expect(p.block(500, 500)[2]).toEqual([[A2, [box(7)]]]); // template unpolluted
    });

    it('throws on a dangling ref', () => {
        const bad = lvl('bad', { blocks: [{ x: 0, y: 0, ref: 'blk:nope' } as any] });
        expect(() => levelSceneProvider(bad, resolver)).toThrow(/unresolved content ref/);
    });
});
