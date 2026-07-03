import { describe, it, expect } from 'vitest';
import { expandMotif } from '../../src/core/motif/MotifExpander';
import { getMotifTemplate } from '../../src/core/motif/MotifTemplates';
import { makeRng } from '../../src/core/motif/Rng';
import { AdjunctType } from '../../src/core/types/AdjunctType';

// AI-authoring generator catalog (house / road / building) — static contracts.
// Walkability of the building stairs is proven DYNAMICALLY in
// tests/systems/building-stairs-walk.test.ts; here we pin determinism and the
// geometric invariants the walk relies on.

describe('motif template · house', () => {
    it('emits doorway wall (2 segs + lintel), 3 solid walls, roof — deterministic', () => {
        const build = () => getMotifTemplate('house')!.build(makeRng(42), { w: 5, d: 4, h: 2.6, door: 'S' });
        const a = build(), b = build();
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));   // same seed → same house
        expect(a).toHaveLength(7);                            // 3 door-wall + 3 walls + roof
        // The doorway leaves a gap: no south-wall box crosses x=0 below lintel height.
        const southFull = a.filter((bx) => bx.pos[1] === -2 && bx.pos[2] < 1.9 &&
            Math.abs(bx.pos[0]) - bx.size[0] / 2 < 0.1);
        expect(southFull).toHaveLength(0);
        // Roof covers the footprint.
        const roof = a[a.length - 1];
        expect(roof.size[0]).toBeGreaterThanOrEqual(5);
        expect(roof.pos[2]).toBeGreaterThan(2.6);
    });

    it('door side is honoured (E puts the gap on the east wall)', () => {
        const boxes = getMotifTemplate('house')!.build(makeRng(1), { w: 4, d: 4, door: 'E' });
        const eastPieces = boxes.filter((b) => b.pos[0] === 2);
        expect(eastPieces.length).toBe(3);                    // 2 segments + lintel
    });
});

describe('motif template · road', () => {
    it('one strip per polyline segment, flat and thin', () => {
        const boxes = getMotifTemplate('road')!.build(makeRng(0), {
            points: [[-6, 0], [0, 0], [0, 6]], width: 2,
        });
        expect(boxes).toHaveLength(2);
        for (const b of boxes) {
            expect(b.size[2]).toBeLessThanOrEqual(0.15);      // walk-over, not a wall
            expect(b.pos[2]).toBeLessThan(0.1);
        }
    });
});

describe('motif template · building', () => {
    const params = { floors: 5, w: 8, d: 8, floorHeight: 2.8 };
    const boxes = () => getMotifTemplate('building')!.build(makeRng(7), params);

    it('deterministic; tread rises stay under the 0.5 step-over cap', () => {
        const a = boxes(), b = boxes();
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        // Treads are the 1.2-wide thin slabs; group by flight via x lane, assert
        // consecutive top-face gaps ≤ 0.5 (the CharacterController step budget).
        const treads = a.filter((bx) => bx.resource === 1 && bx.size[2] === 0.25 &&
            (bx.size[0] === 1.2 || bx.size[1] === 1.2));
        expect(treads.length).toBe(4 * 2 * 4);                // 4 gaps × 2 flights × 4 steps
        const tops = treads.map((t) => +(t.pos[2] + 0.125).toFixed(3)).sort((x, y) => x - y);
        for (let i = 1; i < tops.length; i++) {
            expect(tops[i] - tops[i - 1]).toBeLessThanOrEqual(0.5 + 1e-9);
        }
        // The stair chain reaches the top storey.
        expect(Math.max(...tops)).toBeCloseTo(4 * 2.8, 1);
    });

    it('slabs leave the stair shaft open; the roof seals the top', () => {
        const a = boxes();
        const slabs = a.filter((bx) => bx.resource === 10);
        expect(slabs.length).toBe(4 * 2);                     // 2 pieces × 4 elevated floors
        const roof = a.find((bx) => bx.pos[2] > 5 * 2.8);
        expect(roof).toBeTruthy();
        expect(roof!.size[0]).toBeGreaterThanOrEqual(8);
    });

    it('expands through the real c2 pipeline into solid a2 rows', () => {
        const rows = expandMotif([[8, 8, 0], 'building', 7, params]);
        expect(rows.length).toBeGreaterThan(60);
        for (const [typeId, row] of rows) {
            expect(typeId).toBe(AdjunctType.Box);
            expect(row[6]).toBe(1);                           // stop=1 → solid
        }
    });
});
