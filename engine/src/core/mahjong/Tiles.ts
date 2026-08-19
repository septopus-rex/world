/**
 * Mahjong tile vocabulary — the shared, engine-independent alphabet.
 *
 * This module (and its siblings in `core/mahjong/`) is the RULE CORE: pure
 * functions over plain numbers, zero imports, no ECS / renderer / DOM. Both
 * mahjong hosts consume it —
 *   · `core/systems/MahjongSystem.ts` (Pattern B, the in-world 3D table), and
 *   · `client/core/src/games/mahjong/MahjongGame.ts` (Pattern A, the external
 *     app that also runs on `services/mahjong`).
 * Before this existed each had its own half-rules; the 3D table had no win
 * detection at all. Rules live in ONE place so the two can never disagree.
 *
 * Encoding (34 kinds, 4 copies each = 136 tiles) — matches the face art order in
 * `client/core/src/scenes/mahjongFaces.ts`:
 *
 *   0..8    characters 萬 1–9   (man)
 *   9..17   circles    筒 1–9   (pin)
 *   18..26  bamboo     索 1–9   (sou)
 *   27..30  winds      東南西北 (E S W N)
 *   31..33  dragons    中發白   (red / green / white)
 */

export type Kind = number;  // 0..33

export const KINDS = 34;
export const COPIES = 4;
export const DECK = KINDS * COPIES;   // 136
export const HAND_SIZE = 13;

export const SUIT_MAN = 0;
export const SUIT_PIN = 1;
export const SUIT_SOU = 2;
export const HONORS = 3;              // pseudo-suit for winds + dragons

export const WIND_EAST = 27;
export const WIND_SOUTH = 28;
export const WIND_WEST = 29;
export const WIND_NORTH = 30;
export const DRAGON_RED = 31;
export const DRAGON_GREEN = 32;
export const DRAGON_WHITE = 33;

/** Suit bucket: 0 man · 1 pin · 2 sou · 3 honors. */
export function suitOf(k: Kind): number {
    return k < 27 ? Math.floor(k / 9) : HONORS;
}

/** Rank 1..9 for a suited tile; 0 for honors. */
export function rankOf(k: Kind): number {
    return k < 27 ? (k % 9) + 1 : 0;
}

export function isHonor(k: Kind): boolean { return k >= 27; }
export function isWind(k: Kind): boolean { return k >= 27 && k <= 30; }
export function isDragon(k: Kind): boolean { return k >= 31; }

/** 幺九 — terminals (1 and 9) and every honor. */
export function isTerminalOrHonor(k: Kind): boolean {
    return k >= 27 || k % 9 === 0 || k % 9 === 8;
}

/** True when the three kinds form a run within one suit (no wrap across suits). */
export function isRun(a: Kind, b: Kind, c: Kind): boolean {
    if (a >= 27) return false;
    return b === a + 1 && c === a + 2 && suitOf(a) === suitOf(c);
}

/** ASCII label, stable across locales: `3m`, `7p`, `E`, `Rd`. */
const SUIT_TAG = ['m', 'p', 's'];
const HONOR_TAG = ['E', 'S', 'W', 'N', 'Rd', 'Gr', 'Wh'];
export function kindLabel(k: Kind): string {
    return k < 27 ? `${rankOf(k)}${SUIT_TAG[suitOf(k)]}` : HONOR_TAG[k - 27];
}

/** Chinese label for HUD / result panels: 三萬 · 七筒 · 東 · 中. */
const CN_DIGITS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const CN_SUITS = ['萬', '筒', '索'];
const CN_HONORS = ['東', '南', '西', '北', '中', '發', '白'];
export function kindName(k: Kind): string {
    return k < 27 ? `${CN_DIGITS[rankOf(k) - 1]}${CN_SUITS[suitOf(k)]}` : CN_HONORS[k - 27];
}

/** 34-bucket histogram of a kind list. */
export function tally(kinds: readonly Kind[]): number[] {
    const c = new Array(KINDS).fill(0);
    for (const k of kinds) c[k]++;
    return c;
}

/** A full 136-tile wall as kinds, in fixed (unshuffled) order. */
export function freshWallKinds(): Kind[] {
    const out: Kind[] = [];
    for (let k = 0; k < KINDS; k++) for (let c = 0; c < COPIES; c++) out.push(k);
    return out;
}

// ── melds ────────────────────────────────────────────────────────────────────

export type MeldType = 'chi' | 'pon' | 'kan' | 'ankan';

/**
 * One exposed (or concealed-kan) set. `kinds` is the sorted kind list — 3 for
 * chi/pon, 4 for either kan. `from` is the seat the claimed tile came from
 * (self for ankan); `claimed` is that tile's kind.
 */
export interface Meld {
    type: MeldType;
    kinds: Kind[];
    from: number;
    claimed: Kind;
}

/** Concealed kan and pon-upgraded kan both count as "a triplet" for shape tests. */
export function meldTriplet(m: Meld): Kind | null {
    return m.type === 'chi' ? null : m.kinds[0];
}

/** Does this meld contain a terminal or honor? (全带幺 / 混幺九 tests) */
export function meldHasTerminal(m: Meld): boolean {
    return m.kinds.some(isTerminalOrHonor);
}
