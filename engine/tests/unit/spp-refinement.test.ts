import { describe, it, expect, vi } from 'vitest';
import { expandSpp, SppCell } from '../../src/core/spp/Expander';

// Workstream D — recursive refinement (protocol §3.2.5). A cell may nest a finer
// `refinement` chunk: the parent emits NO geometry of its own, its children own
// its planes (finer-owns), each child INHERITS the parent's boundary faces and
// defaults interior faces to Open. LOD gates depth (maxLevel) + rows (budget).
// Spec: spp-protocol-full.md §3.D · spp-recursive-refinement.md.

const walls = (rows: ReturnType<typeof expandSpp>) => rows.filter(r => r[0] === 0x00a1);
const maxDim = (row: any[]) => Math.max(...row[1][0]);           // largest wall dimension
const large = (rows: any[]) => walls(rows).filter(r => Math.abs(maxDim(r) - 4) < 0.001); // level-0 face
const small = (rows: any[]) => walls(rows).filter(r => Math.abs(maxDim(r) - 2) < 0.001); // level-1 face

const solid6: Array<[number, number]> = [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0]];
const solidCell = (pos: [number, number, number], level = 0): SppCell => ({ position: pos, level, faces: solid6 });

describe('SPP recursive refinement (Workstream D)', () => {
    it('a refined cell emits NO faces of its own — children (finer) own them', () => {
        // Parent (solid) with ONE refinement child at local [0,0,0], no faces →
        // the child inherits the parent's 3 boundary faces (Bottom/Front/Left),
        // its 3 interior faces default Open. So: 3 walls, all at level-1 size.
        const parent: SppCell = {
            position: [0, 0, 0], level: 0, faces: solid6,
            refinement: { cells: [{ position: [0, 0, 0], level: 1 }] },
        };
        const rows = expandSpp([[0, 0, 0], [parent], 'basic']);
        expect(walls(rows)).toHaveLength(3);
        expect(large(rows), 'the coarse parent emitted nothing').toHaveLength(0);
        expect(small(rows), 'the finer child owns the geometry').toHaveLength(3);
    });

    it('boundary faces INHERIT the parent (an open interface passes through)', () => {
        // Parent solid except its Back (north, index 3) is Open. A child on the
        // parent's north boundary [0,1,0] inherits that OPEN → no wall there.
        const facesNorthOpen: Array<[number, number]> = [[1, 0], [1, 0], [1, 0], [0, 0], [1, 0], [1, 0]];
        const parent: SppCell = {
            position: [0, 0, 0], level: 0, faces: facesNorthOpen,
            refinement: { cells: [{ position: [0, 1, 0], level: 1 }] }, // north-boundary child
        };
        const rows = expandSpp([[0, 0, 0], [parent], 'basic']);
        // child [0,1,0] boundaries: Bottom(z=0) solid, Back(y=1) INHERITS open, Left(x=0) solid → 2 walls.
        expect(walls(rows)).toHaveLength(2);
    });

    it('a child MAY override an inherited face', () => {
        // Parent all solid; child [0,0,0] explicitly opens its Bottom (index 1),
        // inherits the rest. Boundaries Bottom/Front/Left → Bottom open now → 2 walls.
        const parent: SppCell = {
            position: [0, 0, 0], level: 0, faces: solid6,
            refinement: { cells: [{ position: [0, 0, 0], level: 1, faces: [null, [0, 0], null, null, null, null] }] },
        };
        expect(walls(expandSpp([[0, 0, 0], [parent], 'basic']))).toHaveLength(2);
    });

    it('finer-owns: no double wall at a coarse/fine boundary', () => {
        // A (solid leaf) next to B (solid, refined). The shared plane at x=1 must
        // be emitted ONCE — by B's finer children — not by A's big level-0 face.
        const A = solidCell([0, 0, 0]);
        const B: SppCell = {
            position: [1, 0, 0], level: 0, faces: solid6,
            refinement: { cells: [solidCell([0, 0, 0], 1)] },
        };
        const rows = expandSpp([[0, 0, 0], [A, B], 'basic']);
        // A drops its Right face toward the refined B (finer-owns) → 5 large walls, not 6.
        expect(large(rows), 'A yields the shared plane to the finer neighbour').toHaveLength(5);
        expect(small(rows).length, 'B contributes finer walls at the boundary').toBeGreaterThan(0);
    });

    it('LOD maxLevel gates depth: below it, the coarse parent renders', () => {
        const parent: SppCell = {
            position: [0, 0, 0], level: 0, faces: solid6,
            refinement: { cells: [solidCell([0, 0, 0], 1)] },
        };
        // maxLevel 0 → the level-0 parent is at the floor → render it coarse (6 big faces).
        const coarse = expandSpp([[0, 0, 0], [parent], 'basic'], { maxLevel: 0 });
        expect(large(coarse)).toHaveLength(6);
        expect(small(coarse)).toHaveLength(0);
        // Default (unbounded) → descend into the child (finer).
        const fine = expandSpp([[0, 0, 0], [parent], 'basic']);
        expect(large(fine)).toHaveLength(0);
        expect(small(fine).length).toBeGreaterThan(0);
    });

    it('budget clips deeper refinement to coarse and warns (no silent cap)', () => {
        const parent: SppCell = {
            position: [0, 0, 0], level: 0, faces: solid6,
            refinement: { cells: [solidCell([0, 0, 0], 1)] },
        };
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const rows = expandSpp([[0, 0, 0], [parent], 'basic'], { budget: 0 });
        expect(large(rows), 'budget 0 → the coarse parent renders').toHaveLength(6);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('two-level nesting composes (grandchildren inherit through)', () => {
        // Parent → child → grandchild, all solid. The deepest leaf (level 2, 1m)
        // owns the geometry; nothing coarser is emitted.
        const parent: SppCell = {
            position: [0, 0, 0], level: 0, faces: solid6,
            refinement: {
                cells: [{
                    position: [0, 0, 0], level: 1,
                    refinement: { cells: [{ position: [0, 0, 0], level: 2 }] },
                }],
            },
        };
        const rows = expandSpp([[0, 0, 0], [parent], 'basic']);
        expect(large(rows)).toHaveLength(0);
        expect(small(rows)).toHaveLength(0);
        // grandchild faces are level-2 (1m) → maxDim 1.
        const tiny = walls(rows).filter(r => Math.abs(maxDim(r) - 1) < 0.001);
        expect(tiny.length).toBeGreaterThan(0);
    });

    it('is deterministic — same tree expands byte-identically', () => {
        const parent: SppCell = {
            position: [0, 0, 0], level: 0,
            faceOptions: [[[1, 0], [0, 0]], [[1, 0]], [[1, 0]], [[1, 0]], [[1, 0]], [[1, 0]]],
            refinement: { cells: [{ position: [0, 0, 0], level: 1 }, { position: [1, 1, 1], level: 1 }] },
        };
        const a = expandSpp([[0, 0, 0], [parent], 'basic'], { blockX: 4, blockY: 7 });
        const b = expandSpp([[0, 0, 0], [parent], 'basic'], { blockX: 4, blockY: 7 });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});
