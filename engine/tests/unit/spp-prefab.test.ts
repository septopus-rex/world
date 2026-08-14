/**
 * Prefabs (组合件) — the non-face half of a StylePack (spp-editors.md §9).
 *
 * What these pin down is the SEAM, not the geometry maths (that is partToBox,
 * already covered by spp-parts.test.ts): a pack can carry named compositions,
 * they are addressed by `pack#key` and never by index, and stamping one yields
 * ORDINARY authored rows — the same rows the library editor previews.
 */
import { describe, it, expect } from 'vitest';
import {
    registerStylePack, listPrefabs, getPrefab, prefabRef, DEFAULT_PREFAB_SIZE,
    type StylePack, type Prefab,
} from '../../src/core/spp/Variants';
import { expandPrefab } from '../../src/core/spp/Expander';
import { checkPrefab, checkPack } from '../../src/core/spp/OptionGuard';
import { AdjunctType } from '../../src/core/types/AdjunctType';

const A2 = AdjunctType.Box, B4 = AdjunctType.Stop;

/** A two-part composition: a visual slab + a functional stop — the "阻挡花瓶"
 *  shape the spec uses as the canonical example of an option/prefab. */
const STOOL: Prefab = {
    key: 'stool', name: '凳', size: 2,
    parts: [
        { type: A2, u: 0.2, v: 0.2, su: 0.6, sv: 0.6, w: 0.4, sw: 0.1, props: [7, [1, 1], 0, 1] },
        { type: B4, u: 0.2, v: 0.2, su: 0.6, sv: 0.6, w: 0, sw: 0.5, props: [0, null] },
    ],
};

const packWith = (id: string, prefabs?: Prefab[]): StylePack => ({
    format: 'septopus.spp.stylepack', version: 1, id, thickness: 0.2,
    closed: [{ key: 'solid', name: 'solid', parts: [{ type: A2, u: 0, v: 0, su: 1, sv: 1, props: [0, [1, 1], 0, 1] }] }],
    open: [{ key: 'empty', name: 'empty', parts: [] }],
    ...(prefabs ? { prefabs } : {}),
});

describe('prefabs — the library seam', () => {
    it('a pack carries prefabs, and they list with a pack#key ref', () => {
        registerStylePack(packWith('pf-a', [STOOL]));
        const listed = listPrefabs('pf-a');
        expect(listed).toEqual([
            { ref: 'pf-a#stool', pack: 'pf-a', key: 'stool', name: '凳', parts: 2, size: 2 },
        ]);
        expect(prefabRef('pf-a', 'stool')).toBe('pf-a#stool');
    });

    it('a pack without prefabs is still valid and simply contributes none', () => {
        expect(registerStylePack(packWith('pf-none'))).toBe('pf-none');
        expect(listPrefabs('pf-none')).toEqual([]);
    });

    it('listPrefabs() with no argument spans every loaded pack', () => {
        registerStylePack(packWith('pf-b', [{ ...STOOL, key: 'other', name: '别的' }]));
        const refs = listPrefabs().map(p => p.ref);
        expect(refs).toContain('pf-a#stool');
        expect(refs).toContain('pf-b#other');
    });

    it('getPrefab resolves by key — and a dangling ref is undefined, not a throw', () => {
        expect(getPrefab('pf-a#stool')?.name).toBe('凳');
        expect(getPrefab('pf-a#gone')).toBeUndefined();
        expect(getPrefab('no-such-pack#stool')).toBeUndefined();
        expect(getPrefab('malformed')).toBeUndefined();
    });

    it('a key survives reordering the array — the §3.6 lesson applied at birth', () => {
        const two: Prefab[] = [{ ...STOOL, key: 'first' }, { ...STOOL, key: 'second' }];
        registerStylePack(packWith('pf-order', two));
        expect(getPrefab('pf-order#second')?.key).toBe('second');
        registerStylePack(packWith('pf-order', [two[1], two[0]]));   // swap
        expect(getPrefab('pf-order#second')?.key).toBe('second');    // same thing
    });

    it('a malformed prefabs field is dropped, not fatal — the two pools still register', () => {
        const bad = { ...packWith('pf-bad'), prefabs: 'nope' as any };
        expect(registerStylePack(bad)).toBe('pf-bad');
        expect(listPrefabs('pf-bad')).toEqual([]);
    });
});

describe('expandPrefab — stamping into ordinary rows', () => {
    it('the unit frame is the cell floor: u→X 东, v→Y 北, w/sw→Z 上', () => {
        const rows = expandPrefab(STOOL, [10, 20, 3], 2);
        expect(rows).toHaveLength(2);
        const [type, raw] = rows[0];
        expect(type).toBe(A2);
        // u 0.2..0.8 of 2m → 1.2m wide, centred at 0.2+0.3 = 0.5 of the cube.
        expect(raw[0]).toEqual([1.2, 1.2, 0.2]);
        // Z centre = origin.z + (w + sw/2) * size = 3 + (0.4 + 0.05) * 2 = 3.9
        expect(raw[1]).toEqual([11, 21, 3.9]);
        expect(raw[2]).toEqual([0, 0, 0]);
    });

    it('props are appended verbatim as the raw tail — the row is a normal adjunct', () => {
        const [, seat] = expandPrefab(STOOL, [0, 0, 0], 2)[0];
        expect(seat.slice(3)).toEqual([7, [1, 1], 0, 1]);
        const [stopType, stop] = expandPrefab(STOOL, [0, 0, 0], 2)[1];
        expect(stopType).toBe(B4);
        expect(stop.slice(3)).toEqual([0, null]);
    });

    it('rows carry NO derivedFrom — a stamp is authored data, not expansion output', () => {
        // The rows are plain arrays; "derived" is a property the BlockSystem sets
        // on SPP/motif products. Asserting the shape keeps the distinction honest.
        for (const [, raw] of expandPrefab(STOOL, [0, 0, 0], 2)) {
            expect(Array.isArray(raw)).toBe(true);
            expect(raw.some(v => v && typeof v === 'object' && 'derivedFrom' in v)).toBe(false);
        }
    });

    it('the frame is scale-invariant: same shape, twice the size', () => {
        const small = expandPrefab(STOOL, [0, 0, 0], 2)[0][1];
        const big = expandPrefab(STOOL, [0, 0, 0], 4)[0][1];
        expect(big[0]).toEqual(small[0].map((n: number) => n * 2));
        expect(big[1]).toEqual(small[1].map((n: number) => n * 2));
    });

    it('the size falls back to the prefab\'s own, then to the furniture default', () => {
        expect(expandPrefab({ ...STOOL, size: 6 }, [0, 0, 0])[0][1][0][0]).toBeCloseTo(0.6 * 6);
        const noSize: Prefab = { key: 'k', name: 'n', parts: STOOL.parts };
        expect(expandPrefab(noSize, [0, 0, 0])[0][1][0][0]).toBeCloseTo(0.6 * DEFAULT_PREFAB_SIZE);
    });
});

describe('the guard treats a prefab as a volume, not as cladding', () => {
    it('a full-height part is fine in a prefab and flagged on a face', () => {
        const tall: Prefab = { key: 't', name: 't', parts: [{ type: A2, u: 0.2, v: 0.2, su: 0.6, sv: 0.6, w: 0, sw: 0.9 }] };
        expect(checkPrefab(tall).map(i => i.code)).toEqual([]);
        // Same geometry as a FACE option trips part-too-deep (it would stand in
        // front of the other five faces) — the asymmetry is the whole point.
        const asFace = checkPack({ closed: [{ key: 't', name: 't', parts: tall.parts }], open: [] });
        expect(asFace.map(i => i.code)).toContain('part-too-deep');
    });

    it('geometric errors still bite: out of the cube, zero size, empty', () => {
        expect(checkPrefab({ key: 'x', name: 'x', parts: [{ type: A2, u: 0.5, v: 0, su: 0.8, sv: 1, sw: 0.2 }] })
            .map(i => i.code)).toContain('part-out-of-cell');
        expect(checkPrefab({ key: 'x', name: 'x', parts: [{ type: A2, u: 0, v: 0, su: 0, sv: 1, sw: 0.2 }] })
            .map(i => i.code)).toContain('part-zero-size');
        expect(checkPrefab({ key: 'x', name: 'x', parts: [] }).map(i => i.code)).toEqual(['prefab-empty']);
    });

    it('checkPack reports prefab issues tagged with the prefabs pool', () => {
        const issues = checkPack({ closed: [], open: [], prefabs: [{ key: 'empty-one', name: 'e', parts: [] }] });
        expect(issues).toEqual([expect.objectContaining({ pool: 'prefabs', variantKey: 'empty-one', code: 'prefab-empty' })]);
    });
});

describe('the bundled garden pack ships usable furniture', () => {
    it('its prefabs pass the guard and stamp real rows', async () => {
        const garden = (await import('../../../client/core/src/stylepacks/garden.stylepack.json')).default as unknown as StylePack;
        expect(garden.prefabs?.length).toBeGreaterThan(0);
        for (const pf of garden.prefabs!) {
            const errors = checkPrefab(pf).filter(i => i.level === 'error');
            expect(errors, `${pf.key}: ${errors.map(e => e.message).join(' · ')}`).toEqual([]);
            expect(expandPrefab(pf, [0, 0, 0]).length).toBe(pf.parts.length);
        }
    });
});
