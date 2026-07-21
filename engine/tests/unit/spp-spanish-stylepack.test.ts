import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { expandSpp, SppCell } from '../../src/core/spp/Expander';
import {
    getSppTheme, registerStylePack, listSppThemes, setStyleOverride, StylePack,
} from '../../src/core/spp/Variants';
import spanishPack from '../../../client/core/src/stylepacks/spanish.stylepack.json';

// The Spanish Revival StylePack — the SECOND textured pack after terran, and a
// regression guard for the resource contract it must follow (texture.md §9 /
// resource.md §6): textures ride a2 box slot 7 as NUMERIC catalog ids
// (43 stucco / 44 roof tile / 45 arch door — demo.manifest.json), slot 3 stays
// a colour/palette INDEX, and a1 walls carry colour only. A pack is CID-able
// JSON — host-relative asset URLs inside it would break chain boot, so the
// no-URL guard below is the point of this file, not a formality.

beforeAll(() => {
    registerStylePack(spanishPack as StylePack);
});

afterEach(() => {
    setStyleOverride(null);
});

const cellWith = (face0: [number, number | string]): SppCell => ({
    position: [0, 0, 0], level: 0,
    faces: [face0, [1, 'solid'], [1, 'solid'], [1, 'solid'], [1, 'solid'], [1, 'solid']],
});

const boxes = (rows: ReturnType<typeof expandSpp>) => rows.filter(r => r[0] === 0x00a2);
const walls = (rows: ReturnType<typeof expandSpp>) => rows.filter(r => r[0] === 0x00a1);
const slot = (row: any[], i: number) => row[1][i];
const thickness = (row: any[]) => Math.min(...(row[1][0] as number[]));

describe('SPP Spanish Revival StylePack', () => {
    it('registers into the SPP theme registry with its base colour', () => {
        expect(listSppThemes()).toContain('spanish');
        const theme = getSppTheme('spanish')!;
        expect(theme.thickness).toBeCloseTo(0.35);
        expect(theme.color).toBe(16314855); // 0xF8F1E7 stucco white
    });

    it('expands a solid cell into 6 textured a2 slabs (texture = slot 7 catalog id)', () => {
        const rows = expandSpp([[0, 0, 0], [cellWith([1, 'solid'])], 'spanish']);
        const slabs = boxes(rows);
        expect(slabs).toHaveLength(6);
        for (const slab of slabs) {
            expect(thickness(slab)).toBeCloseTo(0.35);
            expect(slot(slab, 3), 'slot 3 is a colour/palette index, never a texture').toBe(0);
            expect(slot(slab, 7), 'texture rides a2 slot 7 as a catalog id').toBe(43);
        }
        expect(walls(rows), 'solid faces have no colour-only a1 parts').toHaveLength(0);
    });

    it('expands arch_door into 11 a2 slabs, exactly one carrying the arch texture', () => {
        const rows = expandSpp([[0, 0, 0], [cellWith([1, 'arch_door'])], 'spanish']);
        // arch_door face: 2 jambs + 2 spandrels + keystone + door panel = 6 parts,
        // plus 5 solid faces at 1 part each.
        const slabs = boxes(rows);
        expect(slabs).toHaveLength(11);
        expect(slabs.filter(s => slot(s, 7) === 45), 'the wooden door panel').toHaveLength(1);
        expect(slabs.filter(s => slot(s, 7) === 43)).toHaveLength(10);
    });

    it('window mixes textured a2 piers with a colour-only a1 glass pane', () => {
        const rows = expandSpp([[0, 0, 0], [cellWith([1, 'window'])], 'spanish']);
        expect(boxes(rows), '4 window-frame parts + 5 solid faces').toHaveLength(9);
        const glass = walls(rows);
        expect(glass).toHaveLength(1);
        expect(slot(glass[0], 6), 'glass is pass-through (stop 0)').toBe(0);
        expect(slot(glass[0], 7), 'a1 slot 7 is a colour, not a texture').toBe(2763306);
        expect(typeof slot(glass[0], 3), 'a1 slot 3 stays a numeric palette index').toBe('number');
    });

    it('never leaks resource URLs into expanded rows (packs must stay CID-able)', () => {
        for (const key of ['solid', 'doorway', 'arch_door', 'window', 'balcony', 'roof_eaves']) {
            const rows = expandSpp([[0, 0, 0], [cellWith([1, key])], 'spanish']);
            expect(JSON.stringify(rows)).not.toMatch(/\/assets\/|https?:/);
        }
    });

    it('restyles other themes via the world style override', () => {
        setStyleOverride('spanish');
        const rows = expandSpp([[0, 0, 0], [cellWith([1, 0])], 'basic']);
        const slabs = boxes(rows);
        expect(slabs.length).toBeGreaterThan(0);
        expect(slot(slabs[0], 7)).toBe(43);
        expect(thickness(slabs[0])).toBeCloseTo(0.35);
    });
});
