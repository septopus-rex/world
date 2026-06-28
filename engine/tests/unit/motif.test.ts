import { describe, it, expect } from 'vitest';
import { expandMotif } from '../../src/core/motif/MotifExpander';
import { motifTemplateIds } from '../../src/core/motif/MotifTemplates';
import { makeRng, range, int, pick } from '../../src/core/motif/Rng';
import { AdjunctMotif } from '../../src/plugins/adjunct/adjunct_motif';
import { AdjunctType } from '../../src/core/types/AdjunctType';

describe('motif (c2) generative adjunct', () => {
    it('is deterministic: same (template, seed) → identical rows', () => {
        const a = expandMotif([[0, 0, 0], 'totem', 42, null]);
        const b = expandMotif([[0, 0, 0], 'totem', 42, null]);
        expect(a).toEqual(b);
        expect(a.length).toBeGreaterThan(0);
    });

    it('different seed → different content', () => {
        const a = expandMotif([[0, 0, 0], 'totem', 1, null]);
        const b = expandMotif([[0, 0, 0], 'totem', 2, null]);
        expect(a).not.toEqual(b);
    });

    it('emits only standard a2 box rows, all solid', () => {
        const rows = expandMotif([[0, 0, 0], 'cluster', 7, null]);
        expect(rows.length).toBeGreaterThan(0);
        for (const [type, raw] of rows) {
            expect(type).toBe(AdjunctType.Box);
            expect((raw[0] as number[]).length).toBe(3); // size triple
            expect(raw[6]).toBe(1);                      // stop = solid
        }
    });

    it('every registered template expands to something', () => {
        const ids = motifTemplateIds();
        expect(ids).toContain('totem');
        expect(ids).toContain('cluster');
        expect(ids).toContain('arch');
        for (const id of ids) {
            expect(expandMotif([[0, 0, 0], id, 3, null]).length).toBeGreaterThan(0);
        }
    });

    it('params.texture (an IPFS hash) lands in box slot 7 on every piece', () => {
        const cid = 'bafytesthash';
        const rows = expandMotif([[0, 0, 0], 'panel', 1, { texture: cid }]);
        expect(rows.length).toBeGreaterThan(0);
        for (const [, raw] of rows) expect(raw[7]).toBe(cid);
        // No texture → no slot 7 (legacy 7-element box).
        const plain = expandMotif([[0, 0, 0], 'panel', 1, null]);
        expect(plain[0][1].length).toBe(7);
    });

    it('panel template is a single board (image canvas)', () => {
        const rows = expandMotif([[0, 0, 0], 'panel', 1, null]);
        expect(rows.length).toBe(1);
    });

    it('unknown template → no rows (graceful)', () => {
        expect(expandMotif([[0, 0, 0], 'does-not-exist', 1, null])).toEqual([]);
    });

    it('applies the origin offset to every piece', () => {
        const at0 = expandMotif([[0, 0, 0], 'arch', 5, null]);
        const at10 = expandMotif([[10, 20, 2], 'arch', 5, null]);
        expect(at0.length).toBe(at10.length);
        for (let i = 0; i < at0.length; i++) {
            const p0 = at0[i][1][1] as number[];
            const p10 = at10[i][1][1] as number[];
            expect(p10[0]).toBeCloseTo(p0[0] + 10);
            expect(p10[1]).toBeCloseTo(p0[1] + 20);
            expect(p10[2]).toBeCloseTo(p0[2] + 2);
        }
    });

    it('params override the piece count', () => {
        expect(expandMotif([[0, 0, 0], 'cluster', 1, { count: 3 }]).length).toBe(3);
        expect(expandMotif([[0, 0, 0], 'totem', 1, { count: 5 }]).length).toBe(5);
    });

    it('attribute round-trips raw → std → raw', () => {
        const raw = [[1, 2, 3], 'arch', 99, null];
        const std = AdjunctMotif.attribute!.deserialize!(raw as any);
        expect(std.template).toBe('arch');
        expect(std.seed).toBe(99);
        expect([std.ox, std.oy, std.oz]).toEqual([1, 2, 3]);
        const back = AdjunctMotif.attribute!.serialize!(std);
        expect(back[0]).toEqual([1, 2, 3]);
        expect(back[1]).toBe('arch');
        expect(back[2]).toBe(99);
    });

    it('renders nothing itself (hidden marker)', () => {
        const std = AdjunctMotif.attribute!.deserialize!([[0, 0, 0], 'totem', 1, null] as any);
        const ro = AdjunctMotif.transform!.stdToRenderData!([std], 0);
        expect(ro[0].hidden).toBe(true);
    });

    it('makeRng is deterministic and stays in [0, 1)', () => {
        const r1 = makeRng(123);
        const r2 = makeRng(123);
        for (let i = 0; i < 200; i++) {
            const v = r1();
            expect(v).toBe(r2());
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('rng helpers honour their bounds deterministically', () => {
        const rng = makeRng(7);
        for (let i = 0; i < 50; i++) {
            const f = range(rng, 2, 5);
            expect(f).toBeGreaterThanOrEqual(2);
            expect(f).toBeLessThan(5);
        }
        const rng2 = makeRng(7);
        for (let i = 0; i < 50; i++) {
            const n = int(rng2, 3, 6);
            expect(n).toBeGreaterThanOrEqual(3);
            expect(n).toBeLessThanOrEqual(6);
        }
        expect(pick(makeRng(1), ['a', 'b', 'c'])).toBe(pick(makeRng(1), ['a', 'b', 'c']));
    });
});
