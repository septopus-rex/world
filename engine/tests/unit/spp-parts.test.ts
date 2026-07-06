import { describe, it, expect, beforeAll } from 'vitest';
import { expandSpp, SppCell } from '../../src/core/spp/Expander';
import { registerStylePack, StylePack } from '../../src/core/spp/Variants';

// P1 — an option/variant is a COMPOSITION of adjuncts (not just a1 walls):
// a "blocking vase" = an a4 model + a b4 stop; "two pillars" = two a4 parts and
// NO stop. Face-local unit frame (u/v in-plane, w inward depth). Legacy a1
// `pieces` still work (covered by spp-expander.test.ts). Spec: spp-editors.md §3.2.

const A1 = 0x00a1, A4 = 0x00a4, B4 = 0x00b4;

const PACK: StylePack = {
    format: 'septopus.spp.stylepack', version: 1, id: 'parts-test', thickness: 0.2,
    closed: [{
        key: 'vase', name: 'blocking vase',
        parts: [
            { type: A4, u: 0.35, v: 0, su: 0.3, sv: 0.5, w: 0, sw: 0.3, props: ['vase.glb'] }, // visual model
            { type: B4, u: 0, v: 0, su: 1, sv: 1, w: 0, sw: 0.2, props: [0, null] },           // full-face stop
        ],
    }],
    open: [{
        key: 'pillars', name: 'two pillars',
        parts: [
            { type: A4, u: 0.1, v: 0, su: 0.15, sv: 1, sw: 0.15, props: ['pillar.glb'] },
            { type: A4, u: 0.75, v: 0, su: 0.15, sv: 1, sw: 0.15, props: ['pillar.glb'] },
        ],
    }],
};

beforeAll(() => { registerStylePack(PACK); });

const byType = (rows: ReturnType<typeof expandSpp>, t: number) => rows.filter(r => r[0] === t);
const solidCell = (): SppCell => ({ position: [0, 0, 0], level: 0, faces: [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0]] });
const openCell = (): SppCell => ({ position: [0, 0, 0], level: 0, faces: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] });

describe('SPP variant = adjunct composition (P1)', () => {
    it('a "close" vase variant emits BOTH an a4 model and a b4 stop per face', () => {
        const rows = expandSpp([[0, 0, 0], [solidCell()], 'parts-test']);
        expect(byType(rows, A4), '6 faces × 1 vase model').toHaveLength(6);
        expect(byType(rows, B4), '6 faces × 1 stop').toHaveLength(6);
        expect(byType(rows, A1), 'no a1 walls — this variant is not wall-based').toHaveLength(0);
    });

    it('the a4 part carries its model ref in the raw tail (props)', () => {
        const rows = expandSpp([[0, 0, 0], [solidCell()], 'parts-test']);
        const a4 = byType(rows, A4)[0];
        // raw = [size, pos, rot, ...props] → slot 3 = 'vase.glb'
        expect(a4[1][3]).toBe('vase.glb');
    });

    it('an "open" pillars variant emits two a4 and NO stop (stays passable)', () => {
        const rows = expandSpp([[0, 0, 0], [openCell()], 'parts-test']);
        expect(byType(rows, A4), '6 open faces × 2 pillars').toHaveLength(12);
        expect(byType(rows, B4), 'no stop — open stays passable').toHaveLength(0);
    });

    it('inward depth (w/sw) sizes the part along the face normal', () => {
        // The full-face b4 stop has sw=0.2 → depth 0.2 × 4m = 0.8m along the normal.
        const rows = expandSpp([[0, 0, 0], [solidCell()], 'parts-test']);
        const stop = byType(rows, B4)[0];      // Top face first (FACES order): Z+ → depth is size.z
        const size = stop[1][0];               // [x,y,z]
        expect(Math.min(...size), 'the thin dimension = the inward depth').toBeCloseTo(0.8);
    });

    it('is deterministic — same parts variant expands byte-identically', () => {
        const a = expandSpp([[1, 2, 3], [solidCell()], 'parts-test']);
        const b = expandSpp([[1, 2, 3], [solidCell()], 'parts-test']);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});
