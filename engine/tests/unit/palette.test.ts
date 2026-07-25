import { describe, it, expect } from 'vitest';
import { PALETTE, PALETTE_MAX_INDEX, resolveSurface, isLiteralColor } from '../../src/core/utils/Palette';
import { AdjunctBox } from '../../src/plugins/adjunct/basic_box';
import { BasicWallAdjunct } from '../../src/plugins/adjunct/basic_wall';
import { BasicWaterAdjunct } from '../../src/plugins/adjunct/basic_water';

// ─── slot 3 = colour, two channels ───────────────────────────────────────────
//
// Before 2026-07-25, slot 3 was four hard-coded `if`s in basic_box (10/1/2/3)
// and DEAD on a1/a5/a6/a7 — content that authored a colour there rendered as
// the fallback grey. These tests pin the replacement contract
// (protocol/{cn,en}/adjunct-types.md §2):
//
//   0        → the family's own default colour
//   1..255   → an index into the built-in PALETTE (normative table)
//   >=256    → a literal 0xRRGGBB
//
// The whole point is that it is ADDITIVE: every shipped row leaves slot 3 at 0,
// so nothing already built changes colour. The "unchanged" cases below are the
// load-bearing ones.

describe('palette — slot 3 resolution', () => {
    it('0 falls back to the family default (nothing already authored moves)', () => {
        expect(resolveSurface(0, 0xf8f8f8).color).toBe(0xf8f8f8);
        expect(resolveSurface(undefined, 0x44aaff).color).toBe(0x44aaff);
        // No family default (a2 box) → entry 0, its historical mid-grey.
        expect(resolveSurface(0).color).toBe(0x888888);
    });

    it('1..255 indexes the table; out-of-table degrades to the default', () => {
        expect(resolveSurface(6).color).toBe(PALETTE[6].color);
        expect(resolveSurface(11).metalness).toBe(0.9);           // steel carries PBR
        expect(resolveSurface(200, 0x123456).color).toBe(0x123456); // beyond the table
    });

    it('>=256 is a literal colour, not an index', () => {
        expect(isLiteralColor(255)).toBe(false);
        expect(isLiteralColor(256)).toBe(true);
        expect(resolveSurface(0x2290cc).color).toBe(0x2290cc);
        expect(resolveSurface(PALETTE_MAX_INDEX + 1).color).toBe(256);
    });

    it('the neutrals keep their historical RGB (content references them)', () => {
        expect(PALETTE[0].color).toBe(0x888888);
        expect(PALETTE[1].color).toBe(0x555555);
        expect(PALETTE[10].color).toBe(0xeeeeee);
    });
});

describe('palette — reaches the render data of every standard primitive', () => {
    const std = (typeId: 'box' | 'wall' | 'water', slot3: any) => {
        const def = typeId === 'box' ? AdjunctBox : typeId === 'wall' ? BasicWallAdjunct : BasicWaterAdjunct;
        const row = def.attribute!.deserialize([[1, 1, 1], [0, 0, 0], [0, 0, 0], slot3, [1, 1], null, 1]);
        return def.transform.stdToRenderData([row], 0)[0];
    };

    it('a2 box: index → colour + PBR params', () => {
        expect(std('box', 6).material?.color).toBe(PALETTE[6].color);
        expect(std('box', 11).material?.metalness).toBe(0.9);
        expect(std('box', 0).material?.color).toBe(0x888888);
    });

    it('a1 wall: index and literal both land (slot 3 used to be ignored entirely)', () => {
        expect(std('wall', 9).material?.color).toBe(PALETTE[9].color);
        expect(std('wall', 0xff8800).material?.color).toBe(0xff8800);
        expect(std('wall', 0).material?.color, 'wall keeps its own default').toBe(0xf8f8f8);
    });

    it('a5 water: a literal colour wins, and opacity survives', () => {
        const w = std('water', 0x2290cc);
        expect(w.material?.color).toBe(0x2290cc);
        expect(w.material?.opacity).toBe(0.6);
        expect(std('water', 0).material?.color).toBe(0x44aaff);
    });

    it('slot 7 (explicit colour) still outranks slot 3 on the standard family', () => {
        const row = BasicWallAdjunct.attribute!.deserialize(
            [[1, 1, 1], [0, 0, 0], [0, 0, 0], 6, [1, 1], null, 1, 0x123456]);
        expect(BasicWallAdjunct.transform.stdToRenderData([row], 0)[0].material?.color).toBe(0x123456);
    });

    it('a2 with a texture keeps the white tint (the image supplies the colour)', () => {
        const row = AdjunctBox.attribute!.deserialize(
            [[1, 1, 1], [0, 0, 0], [0, 0, 0], 6, [1, 1], 0, 1, 46]);
        const out = AdjunctBox.transform.stdToRenderData([row], 0)[0];
        expect(out.material?.texture).toBe('46');
        expect(out.material?.color).toBe(0xffffff);
        // …but the palette's PBR params still apply to the textured surface.
        expect(out.material?.roughness).toBe(PALETTE[6].roughness);
    });
});
