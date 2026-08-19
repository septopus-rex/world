/**
 * Mahjong rules — hand shape, win detection, shanten (distance to tenpai),
 * waits, and claim legality. Pure functions over 34-bucket histograms.
 *
 * A winning hand is 4 sets + 1 pair, where a set is a run (3 consecutive in one
 * suit) or a triplet; melded sets already claimed count toward the four. Two
 * special shapes are also winning: 七对 (seven distinct pairs, concealed only)
 * and 十三幺 (thirteen orphans).
 *
 * The decomposition search is exhaustive but tiny — at most 14 tiles over 34
 * buckets, and it prunes at the lowest occupied kind, so a full enumeration is
 * microseconds. Callers can therefore ask "is this a win?" per keystroke.
 */

import {
    Kind, KINDS, Meld, tally, isHonor, isTerminalOrHonor, meldTriplet,
} from './Tiles';

/** One way to read a winning hand — needed by scoring (碰碰和 vs 平和 …). */
export interface Decomposition {
    /** Sets from the concealed part: each is a sorted kind triple. */
    sets: Kind[][];
    /** Which of `sets` are triplets (vs runs), index-aligned. */
    isTriplet: boolean[];
    /** The pair's kind. */
    pair: Kind;
}

/** Every distinct way `counts` (concealed tiles) reads as `need` sets + a pair. */
export function decompose(counts: readonly number[], need: number): Decomposition[] {
    const out: Decomposition[] = [];
    const c = counts.slice();
    for (let p = 0; p < KINDS; p++) {
        if (c[p] < 2) continue;
        c[p] -= 2;
        const sets: Kind[][] = [];
        const trip: boolean[] = [];
        walk(c, need, sets, trip, 0, (s, t) => out.push({ sets: s.map((x) => x.slice()), isTriplet: t.slice(), pair: p }));
        c[p] += 2;
    }
    return out;
}

/** Recursive set extraction from the lowest occupied kind (canonical order → no dupes). */
function walk(
    c: number[], need: number, sets: Kind[][], trip: boolean[], from: number,
    emit: (sets: Kind[][], trip: boolean[]) => void,
): void {
    if (sets.length === need) {
        for (let i = 0; i < KINDS; i++) if (c[i] !== 0) return;
        emit(sets, trip);
        return;
    }
    let i = from;
    while (i < KINDS && c[i] === 0) i++;
    if (i === KINDS) return;

    if (c[i] >= 3) {                                   // triplet
        c[i] -= 3;
        sets.push([i, i, i]); trip.push(true);
        walk(c, need, sets, trip, i, emit);
        sets.pop(); trip.pop();
        c[i] += 3;
    }
    // run — honors (≥27) never run, and a run must stay inside its suit
    if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
        c[i]--; c[i + 1]--; c[i + 2]--;
        sets.push([i, i + 1, i + 2]); trip.push(false);
        walk(c, need, sets, trip, i, emit);
        sets.pop(); trip.pop();
        c[i]++; c[i + 1]++; c[i + 2]++;
    }
}

/** 七对: seven distinct pairs. Four-of-a-kind counts as two pairs of the same
 *  kind in some rules; we require SEVEN DISTINCT kinds (the stricter, common
 *  Chinese reading) so 四张相同 can't masquerade as two pairs. */
export function isSevenPairs(counts: readonly number[]): boolean {
    let pairs = 0;
    for (let i = 0; i < KINDS; i++) {
        if (counts[i] === 0) continue;
        if (counts[i] !== 2) return false;
        pairs++;
    }
    return pairs === 7;
}

const ORPHANS: Kind[] = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

/** 十三幺: one of each terminal/honor plus a duplicate of any of them. */
export function isThirteenOrphans(counts: readonly number[]): boolean {
    let total = 0, pair = 0;
    for (let i = 0; i < KINDS; i++) {
        if (counts[i] === 0) continue;
        if (!ORPHANS.includes(i)) return false;
        total += counts[i];
        if (counts[i] === 2) pair++;
        else if (counts[i] !== 1) return false;
    }
    return total === 14 && pair === 1 && ORPHANS.every((k) => counts[k] >= 1);
}

/**
 * Is this a complete hand? `concealed` is the 34-histogram of tiles in hand
 * (including the winning tile); `melds` are already-claimed sets.
 */
export function isWinningHand(concealed: readonly number[], melds: readonly Meld[] = []): boolean {
    const need = 4 - melds.length;
    if (need < 0) return false;
    if (melds.length === 0) {
        if (isSevenPairs(concealed)) return true;
        if (isThirteenOrphans(concealed)) return true;
    }
    let n = 0;
    for (let i = 0; i < KINDS; i++) n += concealed[i];
    if (n !== need * 3 + 2) return false;
    return decompose(concealed, need).length > 0;
}

// ── shanten (how many tile swaps away from tenpai) ───────────────────────────

/**
 * Standard-shape shanten. −1 = already a winning hand, 0 = tenpai (waiting).
 *
 * Classic formula: with `m` complete sets and `p` partial sets (pairs / runs
 * missing one), shanten = 8 − 2m − p, where m + p ≤ 4 and at most one pair is
 * counted as the eventual head beyond that. We search over decompositions to
 * maximise (2m + p) rather than trusting a greedy pass, which is wrong on hands
 * like 234567 + a lone pair.
 */
export function shantenStandard(counts: readonly number[], meldCount = 0): number {
    const c = counts.slice();
    let best = 8;
    const search = (from: number, sets: number, partials: number, hasPair: boolean): void => {
        // bound: sets already melded count as complete
        const m = sets + meldCount;
        const p = Math.min(partials, 4 - m);
        const est = 8 - 2 * m - p - (hasPair && m + p < 5 ? 1 : 0);
        if (est < best) best = est;
        if (m + partials >= 5) return;

        let i = from;
        while (i < KINDS && c[i] === 0) i++;
        if (i === KINDS) return;

        // skip this kind entirely (its tiles become floaters)
        const held = c[i];
        c[i] = 0;
        search(i + 1, sets, partials, hasPair);
        c[i] = held;

        if (c[i] >= 3) {                                   // triplet
            c[i] -= 3; search(i, sets + 1, partials, hasPair); c[i] += 3;
        }
        if (c[i] >= 2) {                                   // pair (head or partial)
            c[i] -= 2;
            if (!hasPair) search(i, sets, partials, true);
            search(i, sets, partials + 1, hasPair);
            c[i] += 2;
        }
        if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {   // run
            c[i]--; c[i + 1]--; c[i + 2]--;
            search(i, sets + 1, partials, hasPair);
            c[i]++; c[i + 1]++; c[i + 2]++;
        }
        if (i < 27 && i % 9 <= 7 && c[i + 1] > 0) {        // two-sided / edge partial
            c[i]--; c[i + 1]--;
            search(i, sets, partials + 1, hasPair);
            c[i]++; c[i + 1]++;
        }
        if (i < 27 && i % 9 <= 6 && c[i + 2] > 0) {        // gap partial
            c[i]--; c[i + 2]--;
            search(i, sets, partials + 1, hasPair);
            c[i]++; c[i + 2]++;
        }
    };
    search(0, 0, 0, false);
    return best;
}

/** 七对 shanten (concealed hands only). */
export function shantenSevenPairs(counts: readonly number[]): number {
    let pairs = 0, kinds = 0;
    for (let i = 0; i < KINDS; i++) {
        if (counts[i] > 0) kinds++;
        if (counts[i] >= 2) pairs++;
    }
    return 6 - pairs + Math.max(0, 7 - kinds);
}

/** 十三幺 shanten. */
export function shantenOrphans(counts: readonly number[]): number {
    let kinds = 0, hasPair = false;
    for (const k of ORPHANS) {
        if (counts[k] > 0) kinds++;
        if (counts[k] >= 2) hasPair = true;
    }
    return 13 - kinds - (hasPair ? 1 : 0);
}

/** Best shanten across all three shapes. Melded hands only use the standard one. */
export function shanten(counts: readonly number[], meldCount = 0): number {
    const std = shantenStandard(counts, meldCount);
    if (meldCount > 0) return std;
    return Math.min(std, shantenSevenPairs(counts), shantenOrphans(counts));
}

/** Kinds that would complete the hand right now (empty = not tenpai). */
export function waits(concealed: readonly number[], melds: readonly Meld[] = []): Kind[] {
    const c = concealed.slice();
    const out: Kind[] = [];
    for (let k = 0; k < KINDS; k++) {
        if (c[k] >= 4) continue;             // all four already visible in hand
        c[k]++;
        if (isWinningHand(c, melds)) out.push(k);
        c[k]--;
    }
    return out;
}

/** Is the hand one tile from winning? */
export function isTenpai(concealed: readonly number[], melds: readonly Meld[] = []): boolean {
    return waits(concealed, melds).length > 0;
}

// ── claim legality (碰 / 杠 / 吃) ─────────────────────────────────────────────

/** Can `hand` claim `tile` as a triplet? */
export function canPon(counts: readonly number[], tile: Kind): boolean {
    return counts[tile] >= 2;
}

/** Can `hand` claim `tile` as an open kan? */
export function canKan(counts: readonly number[], tile: Kind): boolean {
    return counts[tile] >= 3;
}

/** Kinds in hand that could be declared as a concealed kan right now. */
export function concealedKans(counts: readonly number[]): Kind[] {
    const out: Kind[] = [];
    for (let k = 0; k < KINDS; k++) if (counts[k] === 4) out.push(k);
    return out;
}

/** Melded pon that could be upgraded to a kan by the tile just drawn. */
export function addedKans(counts: readonly number[], melds: readonly Meld[]): Kind[] {
    const out: Kind[] = [];
    for (const m of melds) {
        if (m.type !== 'pon') continue;
        const k = meldTriplet(m)!;
        if (counts[k] >= 1) out.push(k);
    }
    return out;
}

/**
 * Every run that could absorb `tile` — returned as the two OTHER kinds needed
 * from hand, so a caller can present the choices (e.g. 3m can chi as 1-2, 2-4
 * or 4-5). Only the player to the discarder's right may chi; that seat check is
 * the caller's (table order isn't a rule-core concern).
 */
export function chiOptions(counts: readonly number[], tile: Kind): Kind[][] {
    if (isHonor(tile)) return [];
    const r = tile % 9;
    const out: Kind[][] = [];
    const has = (k: Kind) => counts[k] > 0;
    if (r >= 2 && has(tile - 2) && has(tile - 1)) out.push([tile - 2, tile - 1]);
    if (r >= 1 && r <= 7 && has(tile - 1) && has(tile + 1)) out.push([tile - 1, tile + 1]);
    if (r <= 6 && has(tile + 1) && has(tile + 2)) out.push([tile + 1, tile + 2]);
    return out;
}

/** Would claiming `tile` complete the hand? (胡 on a discard — 点炮.) */
export function canRon(counts: readonly number[], melds: readonly Meld[], tile: Kind): boolean {
    const c = counts.slice();
    c[tile]++;
    return isWinningHand(c, melds);
}

/** True when no set in the hand contains a terminal or honor (断幺九). */
export function allSimples(counts: readonly number[], melds: readonly Meld[]): boolean {
    for (let k = 0; k < KINDS; k++) if (counts[k] > 0 && isTerminalOrHonor(k)) return false;
    return melds.every((m) => !m.kinds.some(isTerminalOrHonor));
}
