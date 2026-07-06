import { describe, it, expect, beforeAll } from 'vitest';
import { expandSpp, SppCell } from '../../src/core/spp/Expander';
import { registerStylePack, getVariant, StylePack } from '../../src/core/spp/Variants';
import { FaceState } from '../../src/core/types/ParticleCell';

// P4 — a face references a variant by a STABLE KEY (string), not a positional
// index (aligns to SPP-Core §3.2.4: option ids are opaque references). Legacy
// numeric indices still resolve (dual-read). Spec: spp-editors.md §3.6.

const A1 = 0x00a1;
const PACK: StylePack = {
    format: 'septopus.spp.stylepack', version: 1, id: 'keyed', thickness: 0.2,
    closed: [
        { key: 'wall', name: 'solid', pieces: [{ du: 0, dv: 0, su: 1, sv: 1 }] },          // index 0 → 1 slab/face
        { key: 'lattice', name: 'hedge', pieces: [                                         // index 1 → 3 slats/face
            { du: 0.05, dv: 0, su: 0.15, sv: 1 }, { du: 0.425, dv: 0, su: 0.15, sv: 1 }, { du: 0.8, dv: 0, su: 0.15, sv: 1 },
        ] },
        { name: 'named-only', pieces: [{ du: 0, dv: 0, su: 0.5, sv: 0.5 }] },              // no key → resolved by name
    ],
    open: [{ key: 'gap', name: 'empty', pieces: [] }],
};
beforeAll(() => { registerStylePack(PACK); });

const walls = (rows: ReturnType<typeof expandSpp>) => rows.filter(r => r[0] === A1);
const cellFaces = (ref: number | string): SppCell => ({
    position: [0, 0, 0], level: 0, faces: [[1, ref], [1, ref], [1, ref], [1, ref], [1, ref], [1, ref]],
});

describe('SPP variant reference by key (P4)', () => {
    it('resolves a variant by STABLE KEY', () => {
        expect(walls(expandSpp([[0, 0, 0], [cellFaces('wall')], 'keyed'])), 'wall → 1 slab × 6 faces').toHaveLength(6);
        expect(walls(expandSpp([[0, 0, 0], [cellFaces('lattice')], 'keyed'])), 'lattice → 3 slats × 6 faces').toHaveLength(18);
    });

    it('LEGACY numeric index still resolves (dual-read, backward compatible)', () => {
        expect(walls(expandSpp([[0, 0, 0], [cellFaces(0)], 'keyed'])), 'index 0 = wall').toHaveLength(6);
        expect(walls(expandSpp([[0, 0, 0], [cellFaces(1)], 'keyed'])), 'index 1 = lattice').toHaveLength(18);
    });

    it('falls back to `name` when a variant has no explicit key', () => {
        expect(getVariant(PACK as any, FaceState.Closed, 'named-only')?.name).toBe('named-only');
        expect(walls(expandSpp([[0, 0, 0], [cellFaces('named-only')], 'keyed'])), 'name-referenced → 1 half slab × 6').toHaveLength(6);
    });

    it('an unknown key resolves to nothing for that face (no throw)', () => {
        expect(getVariant(PACK as any, FaceState.Closed, 'does-not-exist')).toBeUndefined();
        expect(walls(expandSpp([[0, 0, 0], [cellFaces('does-not-exist')], 'keyed']))).toHaveLength(0);
    });

    it('collapse works with KEYED candidate options', () => {
        const cell: SppCell = {
            position: [0, 0, 0], level: 0,
            faceOptions: [
                [[1, 'wall'], [1, 'lattice']], [[1, 'wall']], [[1, 'wall']], [[1, 'wall']], [[1, 'wall']], [[1, 'wall']],
            ],
        };
        const a = expandSpp([[0, 0, 0], [cell], 'keyed'], { blockX: 2, blockY: 5 });
        const b = expandSpp([[0, 0, 0], [cell], 'keyed'], { blockX: 2, blockY: 5 });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));   // deterministic collapse over keys
        expect(walls(a).length).toBeGreaterThan(0);
    });
});
