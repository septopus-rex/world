/**
 * Palette — the built-in colour + material table that `slot 3` indexes.
 *
 * WHY THIS EXISTS. The standard primitives (a1 wall · a2 box · a5 water ·
 * a6 cone · a7 ball) carry their appearance in raw slot 3. Until now a2's
 * mapping was four hard-coded `if`s inside basic_box.ts (10→#eee, 1→#555,
 * 2→blue, 3→red, everything else mid-grey), so ALL authored content — demo
 * blocks, motifs, the SPP StylePacks, the whole gallery — could only ever be
 * white, dark grey, blue or red. That is the single biggest reason built
 * scenes read as "白模" (untextured massing study) rather than architecture.
 *
 * TWO channels, one slot (protocol/{cn,en}/adjunct-types.md §2):
 *   · `0 .. 255`  → an index into this table (a NORMATIVE table: a second
 *                   engine must reproduce these colours to match a screenshot)
 *   · `>= 256`    → a literal 24-bit `0xRRGGBB` colour, no table lookup
 *
 * The threshold is unambiguous because indices are dense and small; it also
 * retro-fixes content that already authored a hex there (gallery water at
 * 0x2290CC, a demo box at 0x336699) and never rendered as intended.
 *
 * Each entry may carry PBR params, so picking "brushed metal" gets you the
 * metalness too — material variety without adding a material slot to the wire
 * format. Absent params fall back to the engine defaults in MeshFactory.
 *
 * Index STABILITY: 0, 1 and 10 (the neutrals) keep their historical RGB — every
 * shipped block/level/motif references them. 2 and 3 were deliberately re-toned
 * (see below): repainting an index is allowed and is the cheapest way to lift
 * existing content, but RE-ASSIGNING one (index 6 meaning something other than
 * brick) would silently rewrite every scene that used it. Append, don't reorder.
 */

export interface PaletteEntry {
    /** 0xRRGGBB base colour. */
    color: number;
    /** PBR roughness [0,1]; omitted = engine default (0.85). */
    roughness?: number;
    /** PBR metalness [0,1]; omitted = engine default (0). */
    metalness?: number;
    /** Short label — surfaced in the editor's Material dropdown. */
    label: string;
}

/** Slot-3 values at or above this are literal 0xRRGGBB colours, not indices. */
export const PALETTE_MAX_INDEX = 255;

/**
 * The built-in table. Grouped so authored content can reach for a *material*
 * ("concrete", "timber", "glass") instead of a bare RGB triple — which is what
 * makes a scene read as built rather than blocked-out.
 */
export const PALETTE: readonly PaletteEntry[] = Object.freeze([
    /*  0 */ { color: 0x888888, roughness: 0.9, label: 'Grey (default)' },
    /*  1 */ { color: 0x555555, roughness: 0.85, label: 'Dark grey (pillar)' },
    // 2 and 3 were #3366ff / #ff0000 — full-saturation primaries, and the reason
    // generative motifs (which pick from indices 0/1/2/3/10) read as toy blocks.
    // Re-toned 2026-07-25 to the same hues at plausible pigment saturation. The
    // INDEX is what content and the cross-engine golden vectors pin, not the RGB,
    // so this repaints every existing scene without touching one byte of data.
    /*  2 */ { color: 0x3d63a8, roughness: 0.6, label: 'Blue' },
    /*  3 */ { color: 0xc0392b, roughness: 0.7, label: 'Red' },
    // 4–9: the neutral construction set — the tones real buildings are made of.
    /*  4 */ { color: 0xb9b3a7, roughness: 0.95, label: 'Concrete' },
    /*  5 */ { color: 0x8f8578, roughness: 0.95, label: 'Weathered concrete' },
    /*  6 */ { color: 0x9c5a3c, roughness: 0.9, label: 'Brick' },
    /*  7 */ { color: 0x6f4b2f, roughness: 0.8, label: 'Timber' },
    /*  8 */ { color: 0xd8cbb0, roughness: 0.9, label: 'Sandstone' },
    /*  9 */ { color: 0x3b3f46, roughness: 0.7, label: 'Slate' },
    /* 10 */ { color: 0xeeeeee, roughness: 0.9, label: 'Off-white (ground)' },
    // 11–15: surfaces that need a non-diffuse response to look right at all.
    /* 11 */ { color: 0xc8ccd0, roughness: 0.35, metalness: 0.9, label: 'Steel' },
    /* 12 */ { color: 0xb08d57, roughness: 0.4, metalness: 0.85, label: 'Brass' },
    /* 13 */ { color: 0x2a2d33, roughness: 0.25, metalness: 0.6, label: 'Dark metal' },
    /* 14 */ { color: 0xdcecf2, roughness: 0.08, metalness: 0.1, label: 'Glass (tinted)' },
    /* 15 */ { color: 0xfaf7f0, roughness: 0.55, label: 'Plaster' },
    // 16–23: vegetation / terrain / water — the outdoor half.
    /* 16 */ { color: 0x4a7c3f, roughness: 0.95, label: 'Grass' },
    /* 17 */ { color: 0x2f5233, roughness: 0.95, label: 'Foliage (dark)' },
    /* 18 */ { color: 0x7a8b3f, roughness: 0.95, label: 'Foliage (light)' },
    /* 19 */ { color: 0x6b5540, roughness: 0.95, label: 'Earth' },
    /* 20 */ { color: 0xc2a878, roughness: 0.95, label: 'Sand' },
    /* 21 */ { color: 0x2290cc, roughness: 0.15, label: 'Water' },
    /* 22 */ { color: 0xe8e8ee, roughness: 0.8, label: 'Snow' },
    /* 23 */ { color: 0x1d2733, roughness: 0.9, label: 'Asphalt' },
    // 24–31: saturated accents — signage, gameplay markers, painted trim.
    /* 24 */ { color: 0xffcc33, roughness: 0.6, label: 'Yellow' },
    /* 25 */ { color: 0xff8800, roughness: 0.6, label: 'Orange' },
    /* 26 */ { color: 0x33aa55, roughness: 0.6, label: 'Green' },
    /* 27 */ { color: 0x22ccbb, roughness: 0.5, label: 'Teal' },
    /* 28 */ { color: 0x7744cc, roughness: 0.6, label: 'Purple' },
    /* 29 */ { color: 0xdd4488, roughness: 0.6, label: 'Pink' },
    /* 30 */ { color: 0xf5f0e6, roughness: 0.75, label: 'Bone' },
    /* 31 */ { color: 0x141418, roughness: 0.8, label: 'Near-black' },
]);

/**
 * Resolve a slot-3 value to a colour + material.
 *
 *   · `>= 256`          → literal 0xRRGGBB, no lookup
 *   · `1 .. 255`        → PALETTE[idx] (out-of-table falls back like 0)
 *   · `0` / non-numeric → the caller's FAMILY DEFAULT, if it has one
 *
 * Zero means "unset", not "index 0" — every primitive family shipped its own
 * default colour before this table existed (wall #f8f8f8, water #44aaff, box
 * mid-grey) and virtually all authored rows leave slot 3 at 0. Honouring the
 * family default there is what makes the palette purely additive: nothing
 * already built changes colour. a2 box passes no default because ITS historical
 * default *is* entry 0.
 */
export function resolveSurface(value: unknown, familyDefault?: number): PaletteEntry {
    if (typeof value === 'number' && Number.isFinite(value)) {
        if (value > PALETTE_MAX_INDEX) return { color: Math.floor(value), label: 'literal' };
        const idx = Math.floor(value);
        if (idx >= 1 && idx < PALETTE.length) return PALETTE[idx];
    }
    return familyDefault == null
        ? PALETTE[0]
        : { color: familyDefault, roughness: PALETTE[0].roughness, label: 'family default' };
}

/** True when a slot-3 value is a literal colour rather than a table index. */
export function isLiteralColor(value: unknown): boolean {
    return typeof value === 'number' && Number.isFinite(value) && value > PALETTE_MAX_INDEX;
}
