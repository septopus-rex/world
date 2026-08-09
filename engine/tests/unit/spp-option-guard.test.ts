import { describe, it, expect } from 'vitest';
import { checkOption, checkPack, faceCoverage, unionArea } from '../../src/core/spp/OptionGuard';
import { FaceState } from '../../src/core/types/ParticleCell';
import type { FaceVariant, VariantPart } from '../../src/core/spp/Variants';

// Contract guard for SPP options (spp-editors.md §3.7): the OBJECTIVE half of
// reviewing an option — geometry that leaves its cell, parts that draw nothing,
// a 挡 that blocks nothing, a 通 you cannot pass. Taste is not tested here; that
// is what the preview is for.

const A1 = 0x00a1;
const part = (p: Partial<VariantPart>): VariantPart => ({ type: A1, u: 0, v: 0, su: 1, sv: 1, ...p });
const variant = (key: string, parts: VariantPart[]): FaceVariant => ({ key, name: key, parts });
const codes = (v: FaceVariant, s: FaceState) => checkOption(v, s).map(i => i.code);

describe('unionArea — exact, not sampled', () => {
    it('sums disjoint rectangles', () => {
        expect(unionArea([{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }])).toBeCloseTo(0.5, 6);
    });
    it('counts an overlap once', () => {
        expect(unionArea([{ x: 0, y: 0, w: 1, h: 1 }, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }])).toBeCloseTo(1, 6);
    });
    it('merges partially overlapping strips', () => {
        // 0..0.6 and 0.4..1 on x, full height ⇒ the whole face.
        expect(unionArea([{ x: 0, y: 0, w: 0.6, h: 1 }, { x: 0.4, y: 0, w: 0.6, h: 1 }])).toBeCloseTo(1, 6);
    });
    it('ignores zero-size rects and empty input', () => {
        expect(unionArea([])).toBe(0);
        expect(unionArea([{ x: 0, y: 0, w: 0, h: 1 }])).toBe(0);
    });
    it('is resolution-independent for a thin sliver (a grid would round it away)', () => {
        expect(unionArea([{ x: 0, y: 0, w: 0.001, h: 1 }])).toBeCloseTo(0.001, 9);
    });
});

describe('geometry errors', () => {
    it('flags in-plane overflow and punch-through as errors', () => {
        expect(codes(variant('fat', [part({ u: 0.5, su: 0.8 })]), FaceState.Closed)).toContain('part-out-of-cell');
        expect(codes(variant('neg', [part({ u: -0.1 })]), FaceState.Closed)).toContain('part-out-of-cell');
        // too deep = out the opposite face
        expect(codes(variant('deep', [part({ w: 0.9, sw: 0.5 })]), FaceState.Closed)).toContain('part-out-of-cell');
    });

    it('treats an OVERHANG as a warning, not an error — eaves are a real technique', () => {
        // The bundled spanish pack's `roof_eaves` overhangs by 0.05 on purpose;
        // an error here would call correct authored content a mistake.
        const c = codes(variant('eaves', [part({ v: 0.8, sv: 0.2, w: -0.05, sw: 0.45 })]), FaceState.Closed);
        expect(c).toContain('part-overhang');
        expect(c).not.toContain('part-out-of-cell');
        expect(checkOption(variant('eaves', [part({ v: 0.8, sv: 0.2, w: -0.05, sw: 0.45 })]), FaceState.Closed)[0].level)
            .toBe('warn');
    });

    it('accepts a part that exactly fills the cell (boundary is legal)', () => {
        expect(codes(variant('full', [part({ u: 0, v: 0, su: 1, sv: 1, w: 0, sw: 1 })]), FaceState.Closed)).toEqual([]);
    });

    it('flags a part with no extent', () => {
        expect(codes(variant('flat', [part({ su: 0 })]), FaceState.Closed)).toContain('part-zero-size');
    });

    it('warns on coincident parts (z-fighting)', () => {
        const p = part({ u: 0.2, v: 0.2, su: 0.5, sv: 0.5 });
        expect(codes(variant('dup', [p, { ...p }]), FaceState.Closed)).toContain('parts-coincident');
    });

    it('does NOT flag parts that merely overlap at different depths', () => {
        const a = part({ u: 0.2, v: 0.2, su: 0.5, sv: 0.5, w: 0, sw: 0.2 });
        const b = part({ u: 0.2, v: 0.2, su: 0.5, sv: 0.5, w: 0.3, sw: 0.2 });
        expect(codes(variant('layered', [a, b]), FaceState.Closed)).not.toContain('parts-coincident');
    });
});

describe('semantics: 挡 must block, 通 must pass', () => {
    it('an empty closed option is an error (it is an open in disguise)', () => {
        expect(codes(variant('hollow', []), FaceState.Closed)).toContain('closed-empty');
    });

    it('a closed option covering almost nothing is warned about', () => {
        expect(codes(variant('vase', [part({ u: 0.45, v: 0, su: 0.1, sv: 0.3 })]), FaceState.Closed))
            .toContain('closed-thin');
    });

    it('a doorway is a legitimate closed option — jambs + lintel, not a warning', () => {
        const doorway = variant('doorway', [
            part({ u: 0, v: 0, su: 0.3, sv: 1 }),
            part({ u: 0.7, v: 0, su: 0.3, sv: 1 }),
            part({ u: 0.3, v: 0.75, su: 0.4, sv: 0.25 }),
        ]);
        expect(checkOption(doorway, FaceState.Closed)).toEqual([]);
    });

    it('a fully covered open option is warned about', () => {
        expect(codes(variant('sealed', [part({})]), FaceState.Open)).toContain('open-sealed');
    });

    it('an empty open option is exactly right — no issues', () => {
        expect(checkOption(variant('empty', []), FaceState.Open)).toEqual([]);
    });

    it('an open option with decoration that still leaves a gap is fine', () => {
        expect(checkOption(variant('arch', [part({ u: 0, v: 0.9, su: 1, sv: 0.1 })]), FaceState.Open)).toEqual([]);
    });
});

describe('faceCoverage', () => {
    it('is the union, not the sum (overlapping parts do not exceed 1)', () => {
        const v = variant('x', [part({}), part({ u: 0.2, v: 0.2, su: 0.5, sv: 0.5 })]);
        expect(faceCoverage(v)).toBeCloseTo(1, 6);
    });
});

describe('checkPack — tags where each issue lives', () => {
    it('reports pool + variant key for every issue', () => {
        const issues = checkPack({
            closed: [variant('hollow', [])],
            open: [variant('sealed', [part({})])],
        });
        expect(issues.map(i => [i.pool, i.variantKey, i.code])).toEqual([
            ['closed', 'hollow', 'closed-empty'],
            ['open', 'sealed', 'open-sealed'],
        ]);
    });

    it('a clean pack yields nothing', () => {
        expect(checkPack({
            closed: [variant('solid', [part({})])],
            open: [variant('empty', [])],
        })).toEqual([]);
    });
});
