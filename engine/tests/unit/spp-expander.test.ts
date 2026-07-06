import { describe, it, expect } from 'vitest';
import { expandSpp, SppCell } from '../../src/core/spp/Expander';
import { ParticleFace, FaceState } from '../../src/core/types/ParticleCell';

// L1 — the SPP expander as a pure function (M1): cells + theme → standard
// adjunct raw rows. Deterministic, snapshot-style assertions.
// Spec: docs/plan/specs/spp-integration.md.

const C = FaceState.Closed, O = FaceState.Open;

/** All six faces closed-solid except overrides ([state, variant] by face). */
function cell(pos: [number, number, number], overrides: Partial<Record<ParticleFace, [number, number]>> = {}, level: 0 | 1 | 2 | 3 = 0, trigger?: any[]): SppCell {
    const faces: Array<[number, number]> = [];
    for (let f = 0; f < 6; f++) faces[f] = overrides[f as ParticleFace] ?? [C, 0];
    return { position: pos, level, faces, ...(trigger ? { trigger } : {}) };
}

const walls = (rows: ReturnType<typeof expandSpp>) => rows.filter(r => r[0] === 0x00a1);
const triggers = (rows: ReturnType<typeof expandSpp>) => rows.filter(r => r[0] === 0x00b8);

describe('SPP expander (M1)', () => {
    it('a fully-closed solid cell emits 6 walls, one per face', () => {
        const rows = expandSpp([[0, 0, 0], [cell([0, 0, 0])], 'basic']);
        expect(walls(rows)).toHaveLength(6);
        // Every wall is stop=1 (solid) and slab-thick on exactly one axis.
        for (const [, raw] of walls(rows)) {
            expect(raw[6]).toBe(1);
            expect(raw[0].filter((d: number) => d === 0.2)).toHaveLength(1);
        }
    });

    it('open faces emit nothing; doorway=3, window=4 pieces', () => {
        const rows = expandSpp([[0, 0, 0], [
            cell([0, 0, 0], {
                [ParticleFace.Top]: [O, 0],
                [ParticleFace.Bottom]: [O, 0],
                [ParticleFace.Front]: [C, 1],   // doorway
                [ParticleFace.Back]: [C, 2],    // window
                // Left/Right default solid
            }),
        ], 'basic']);
        // 0 + 0 + 3 + 4 + 1 + 1
        expect(walls(rows)).toHaveLength(9);
    });

    it('level scales cell size: level 1 solid face is a 2m slab', () => {
        const rows = expandSpp([[0, 0, 0], [cell([0, 0, 0], {}, 1)], 'basic']);
        const top = walls(rows).find(([, raw]) => raw[1][2] > 1)!; // top slab center near z=2-0.1
        expect(top[1][0]).toEqual([2, 2, 0.2]);
        expect(top[1][1][2]).toBeCloseTo(1.9, 5);
    });

    it('adjacency elimination: the shared plane is generated exactly once', () => {
        const pair: SppCell[] = [cell([0, 0, 0]), cell([1, 0, 0])];
        const rows = expandSpp([[0, 0, 0], pair, 'basic']);
        // 2 solid cells alone = 12 walls; sharing one X-plane removes ONE wall:
        // cell B's Left face is skipped, cell A's Right face owns the plane.
        expect(walls(rows)).toHaveLength(11);
        // The owned shared plane sits at x ≈ 4 - t/2 (inside cell A).
        const shared = walls(rows).filter(([, raw]) => Math.abs(raw[1][0] - 3.9) < 1e-9);
        expect(shared).toHaveLength(1);
    });

    it('cell trigger expands to a b8 row filling the cell interior', () => {
        const events = [{ type: 'in', actions: [{ type: 'flag', method: '', target: 'spp_in', params: [true] }] }];
        const rows = expandSpp([[2, 3, 0], [cell([0, 0, 0], {}, 0, events)], 'basic']);
        const trig = triggers(rows);
        expect(trig).toHaveLength(1);
        const [, raw] = trig[0];
        expect(raw[0]).toEqual([4, 4, 4]);
        expect(raw[1]).toEqual([4, 5, 2]);     // origin [2,3,0] + cell center [2,2,2]
        expect(raw[5]).toEqual(events);        // engine-native nodes pass through
    });

    it('origin offsets every emitted position', () => {
        const at0 = expandSpp([[0, 0, 0], [cell([0, 0, 0])], 'basic']);
        const at7 = expandSpp([[7, 2, 1], [cell([0, 0, 0])], 'basic']);
        for (let i = 0; i < at0.length; i++) {
            expect(at7[i][1][1][0]).toBeCloseTo(at0[i][1][1][0] + 7, 9);
            expect(at7[i][1][1][1]).toBeCloseTo(at0[i][1][1][1] + 2, 9);
            expect(at7[i][1][1][2]).toBeCloseTo(at0[i][1][1][2] + 1, 9);
        }
    });

    it('is deterministic: identical inputs → identical output', () => {
        const input: [any, SppCell[], string] = [[1, 1, 0], [
            cell([0, 0, 0], { [ParticleFace.Back]: [C, 1] }),
            cell([1, 0, 0], { [ParticleFace.Top]: [O, 0] }),
        ], 'basic'];
        expect(JSON.stringify(expandSpp(input))).toBe(JSON.stringify(expandSpp(input)));
    });

    it('unknown theme falls back to basic (graceful); malformed cells → [] (no throw)', () => {
        // An unresolved theme (e.g. an external StylePack CID not yet registered)
        // renders as `basic` rather than vanishing — the placeholder→swap path.
        expect(expandSpp([[0, 0, 0], [cell([0, 0, 0])], 'nope'])).toHaveLength(6);
        // Malformed cells still degrade to nothing.
        expect(expandSpp([[0, 0, 0], null as any, 'basic'])).toEqual([]);
    });
});
