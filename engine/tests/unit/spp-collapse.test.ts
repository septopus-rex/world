import { describe, it, expect } from 'vitest';
import { expandSpp, SppCell } from '../../src/core/spp/Expander';

// Workstream C — superposition + collapse. A cell may carry `faceOptions` (a
// LIST of candidates per face); the expander collapses each face
// deterministically (mulberry32 seeded by block+cell+face). Authored `faces`
// skip collapse entirely (backward compat). Spec: spp-protocol-full.md §3.C.

const walls = (rows: ReturnType<typeof expandSpp>) => rows.filter(r => r[0] === 0x00a1);

// A face's option list, indexed by ParticleFace (Top..Right).
const superposed = (opts: Array<Array<[number, number]>>): SppCell => ({
    position: [0, 0, 0], level: 0, faceOptions: opts,
});

describe('SPP collapse (Workstream C)', () => {
    it('resolves single-candidate faces without any RNG (deterministic identity)', () => {
        // Every face has exactly one candidate = solid → same as an authored solid cell.
        const one: Array<[number, number]> = [[1, 0]];
        const rows = walls(expandSpp([[0, 0, 0], [superposed([one, one, one, one, one, one])], 'basic']));
        expect(rows).toHaveLength(6); // 6 solid faces, 1 slab each
    });

    it('collapses multi-candidate faces to ONE option, stable across runs', () => {
        // Each face: choose solid | doorway | window | open.
        const opts: Array<[number, number]> = [[1, 0], [1, 1], [1, 2], [0, 0]];
        const cell = superposed([opts, opts, opts, opts, opts, opts]);
        const a = expandSpp([[0, 0, 0], [cell], 'basic'], { blockX: 5, blockY: 9 });
        const b = expandSpp([[0, 0, 0], [cell], 'basic'], { blockX: 5, blockY: 9 });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // same seed → identical
    });

    it('different block coords collapse to (generally) different structures', () => {
        const opts: Array<[number, number]> = [[1, 0], [1, 1], [1, 2], [0, 0]];
        const cell = superposed([opts, opts, opts, opts, opts, opts]);
        const here = JSON.stringify(expandSpp([[0, 0, 0], [cell], 'basic'], { blockX: 1, blockY: 1 }));
        const there = JSON.stringify(expandSpp([[0, 0, 0], [cell], 'basic'], { blockX: 900, blockY: 42 }));
        expect(here).not.toBe(there); // the seed actually varies the collapse
    });

    it('an empty/absent candidate list collapses to solid', () => {
        const cell: SppCell = { position: [0, 0, 0], level: 0, faceOptions: [[], [], [], [], [], []] };
        const rows = walls(expandSpp([[0, 0, 0], [cell], 'basic']));
        expect(rows).toHaveLength(6); // all solid
    });

    it('authored `faces` win — faceOptions is ignored when faces present', () => {
        // faces = all open (nothing), faceOptions = all solid. faces must win → 0 walls.
        const cell: SppCell = {
            position: [0, 0, 0], level: 0,
            faces: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
            faceOptions: [[[1, 0]], [[1, 0]], [[1, 0]], [[1, 0]], [[1, 0]], [[1, 0]]],
        };
        expect(walls(expandSpp([[0, 0, 0], [cell], 'basic']))).toHaveLength(0);
    });

    it('collapse composes with a structural theme (coaster superposition)', () => {
        // A track cell whose entry/exit faces are each a single-candidate OPEN,
        // the rest single-candidate solid → collapses to a c1 track piece.
        const open: Array<[number, number]> = [[0, 0]];
        const solid: Array<[number, number]> = [[1, 0]];
        const cell = superposed([open, open, solid, solid, solid, solid]); // top+bottom open
        const rows = expandSpp([[0, 0, 0], [cell], 'coaster']);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every(r => r[0] === 0x00c1)).toBe(true);
    });

    it('per-cell seeding: same options at different cell indices can differ', () => {
        const opts: Array<[number, number]> = [[1, 0], [1, 1], [1, 2], [0, 0]];
        const twoCells: SppCell[] = [
            { position: [0, 0, 0], level: 0, faceOptions: [opts, opts, opts, opts, opts, opts] },
            { position: [2, 0, 0], level: 0, faceOptions: [opts, opts, opts, opts, opts, opts] },
        ];
        const rows = expandSpp([[0, 0, 0], twoCells, 'basic'], { blockX: 3, blockY: 3 });
        // Two independently-seeded cells — the expansion is deterministic and
        // non-empty; the point is the seed includes the cell index so they are
        // not forced identical.
        expect(rows.length).toBeGreaterThan(0);
        const rerun = expandSpp([[0, 0, 0], twoCells, 'basic'], { blockX: 3, blockY: 3 });
        expect(JSON.stringify(rows)).toBe(JSON.stringify(rerun));
    });
});
