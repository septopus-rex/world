import { describe, it, expect, beforeAll } from 'vitest';
import { registerStylePack, listVariants, getVariant, StylePack } from '../../src/core/spp/Variants';
import { FaceState } from '../../src/core/types/ParticleCell';

// Editor 1's "read the library" seam (spp-editors.md §2.2): a face picker lists
// the options the ACTIVE theme actually provides — never a hard-coded cycle.
// The returned `key` must be the same stable reference getVariant resolves, so
// "what the picker showed" and "what the face renders" cannot drift apart.

const PACK: StylePack = {
    format: 'septopus.spp.stylepack', version: 1, id: 'listed', thickness: 0.2,
    closed: [
        { key: 'wall', name: 'solid wall', pieces: [{ du: 0, dv: 0, su: 1, sv: 1 }] },
        { name: 'screen', pieces: [{ du: 0, dv: 0, su: 1, sv: 0.5 }] }, // no key → name is the key
    ],
    open: [{ key: 'gap', name: 'empty', pieces: [] }],
};
beforeAll(() => { registerStylePack(PACK); });

describe('listVariants — the live library a face picker reads', () => {
    it('lists a pool as {key, name}, key falling back to name', () => {
        expect(listVariants('listed', FaceState.Closed)).toEqual([
            { key: 'wall', name: 'solid wall' },
            { key: 'screen', name: 'screen' },
        ]);
        expect(listVariants('listed', FaceState.Open)).toEqual([{ key: 'gap', name: 'empty' }]);
    });

    it('every listed key resolves via getVariant — picker and renderer agree', () => {
        for (const state of [FaceState.Closed, FaceState.Open]) {
            for (const v of listVariants('listed', state)) {
                expect(getVariant({ thickness: 0.2, ...PACK }, state, v.key)?.name).toBe(v.name);
            }
        }
    });

    it('lists the built-in basic theme (the sandbox default library)', () => {
        expect(listVariants('basic', FaceState.Closed).map(v => v.key)).toEqual(['solid', 'doorway', 'window']);
        expect(listVariants('basic', FaceState.Open).map(v => v.key)).toEqual(['empty']);
    });

    it('unknown theme → empty list, not a throw', () => {
        expect(listVariants('no-such-theme', FaceState.Closed)).toEqual([]);
    });
});
