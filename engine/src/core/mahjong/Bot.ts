/**
 * Bot policy — what an opponent seat does with its turn.
 *
 * The previous table played 摸打 (discard whatever you just drew), which is not
 * a policy but the absence of one: bots never approached a hand, so the human
 * could not lose and nothing they discarded was ever dangerous. This plays a
 * real, if plain, game: minimise shanten, break ties by counting how many live
 * tiles still improve the hand, prefer throwing terminals/honors early, and fold
 * to safe tiles once another seat is clearly committed and this hand is not.
 *
 * Deliberately NOT modelled: reading which specific tiles an opponent waits on,
 * hand-value estimation, or pushing through danger for a big hand. Those change
 * how a bot feels, not whether the rules work — and each needs its own tuning
 * pass. `Difficulty` is the seam for that ('easy' turns off both the acceptance
 * tiebreak and the fold).
 */

import { Kind, KINDS, Meld, isTerminalOrHonor, isHonor, suitOf } from './Tiles';
import { shanten, canPon, canKan, chiOptions, waits } from './Rules';

export type Difficulty = 'easy' | 'normal';

export interface BotView {
    /** The bot's concealed tiles as a 34-histogram. */
    hand: number[];
    melds: Meld[];
    /** Tiles visible to everyone (all discards + exposed melds), 34-histogram —
     *  used to weight draws by how many copies are actually still live. */
    seen: number[];
    /** What each OTHER seat has shown: their discard pile and how many sets they
     *  have exposed. Absent = no defensive read (the bot plays pure offence). */
    threats?: { discards: Kind[]; melds: number }[];
    difficulty?: Difficulty;
}

/** A seat is worth defending against once it has committed to a hand. */
function isThreat(t: { discards: Kind[]; melds: number }): boolean {
    return t.melds >= 2 || t.discards.length >= 9;
}

/**
 * How dangerous `k` is against the seats that look committed. 0 = 现物 (they
 * already discarded it, so they cannot win on it), rising through spent honors
 * and terminals to live middle tiles.
 */
function danger(k: Kind, view: BotView): number {
    const threats = (view.threats ?? []).filter(isThreat);
    if (threats.length === 0) return 0;
    let worst = 0;
    for (const t of threats) {
        if (t.discards.includes(k)) continue;         // 现物 — free to throw
        let d = 3;
        if (isHonor(k)) d = view.seen[k] >= 2 ? 1 : 2; // spent honors rarely pair up
        else {
            const r = k % 9;
            if (r === 0 || r === 8) d = 2;             // terminals
            else if (r >= 3 && r <= 5) d = 4;          // the middle is where runs live
        }
        worst = Math.max(worst, d);
    }
    return worst;
}

/** Copies of `k` that could still be drawn, from this seat's information. */
function live(view: BotView, k: Kind): number {
    return Math.max(0, 4 - view.seen[k] - view.hand[k]);
}

/**
 * How many live tiles would reduce shanten if drawn. This is the tiebreaker that
 * makes a bot keep 4-5 over 1-9: both may be shanten-neutral to discard, but one
 * leaves far more ways to improve.
 */
function acceptance(hand: number[], melds: Meld[], view: BotView): number {
    const base = shanten(hand, melds.length);
    let total = 0;
    for (let k = 0; k < KINDS; k++) {
        const n = live(view, k);
        if (n <= 0) continue;
        hand[k]++;
        if (shanten(hand, melds.length) < base) total += n;
        hand[k]--;
    }
    return total;
}

/** Isolated honors and terminals go first — cheap, and matches how people play. */
function safetyRank(k: Kind, hand: number[]): number {
    let r = 0;
    if (isHonor(k)) r += 3;
    else if (k % 9 === 0 || k % 9 === 8) r += 2;
    // A tile with no neighbours in hand is a floater.
    if (!isHonor(k)) {
        const s = suitOf(k);
        let neighbours = 0;
        for (let d = -2; d <= 2; d++) {
            const n = k + d;
            if (d === 0 || n < 0 || n >= 27 || suitOf(n) !== s) continue;
            neighbours += hand[n];
        }
        if (neighbours === 0) r += 2;
    }
    return r;
}

/**
 * Pick a tile to discard from a 14-tile (or post-claim) hand. Returns the kind;
 * the caller maps it back to a physical tile id.
 */
export function chooseDiscard(view: BotView): Kind {
    const hand = view.hand.slice();
    const melds = view.melds;
    const own = shanten(hand, melds.length);
    // Defence: once someone is clearly committed and this hand is not going to
    // get there first, stop pushing and throw the safest tile that doesn't set
    // the hand back. Without this every seat races, and hands end in a 点炮
    // within eight turns — the table never reaches the middle game.
    const defending = view.difficulty !== 'easy'
        && own >= 2 && (view.threats ?? []).some(isThreat);

    let best: Kind = -1;
    let bestShanten = 99, bestAccept = -1, bestSafety = -1, bestDanger = 99;

    for (let k = 0; k < KINDS; k++) {
        if (hand[k] === 0) continue;
        hand[k]--;
        const sh = shanten(hand, melds.length);
        const acc = view.difficulty === 'easy' ? 0 : acceptance(hand, melds, view);
        hand[k]++;
        const safety = safetyRank(k, view.hand);
        const risk = defending ? danger(k, view) : 0;

        const better = defending
            // keep shanten from getting worse, then take the safest tile
            ? (sh < bestShanten
                || (sh === bestShanten && risk < bestDanger)
                || (sh === bestShanten && risk === bestDanger && acc > bestAccept))
            : (sh < bestShanten
                || (sh === bestShanten && acc > bestAccept)
                || (sh === bestShanten && acc === bestAccept && safety > bestSafety));
        if (better) {
            best = k; bestShanten = sh; bestAccept = acc; bestSafety = safety; bestDanger = risk;
        }
    }
    return best;
}

export type ClaimDecision =
    | { type: 'pass' }
    | { type: 'pon' }
    | { type: 'kan' }
    | { type: 'chi'; with: Kind[] };

/**
 * Should this seat claim `tile`?
 *
 * Improving shanten is necessary but NOT sufficient. Opening a hand forfeits
 * 门前清 / 不求人 and every concealed pattern, so a seat that calls at every
 * opportunity finishes fast and cheap — measured over 24 hands, unconditional
 * calling produced up to 7 melds per table and ended hands in 20–50 actions,
 * roughly a third of a real one. The gates below (already open, or close enough
 * that the tempo is worth the value) keep hands the length they should be.
 */
export function decideClaim(view: BotView, tile: Kind, canChi: boolean): ClaimDecision {
    const before = shanten(view.hand, view.melds.length);
    const open = view.melds.some((m) => m.type !== 'ankan');
    const hand = view.hand.slice();

    // Kan first — free value when the hand is already committed to the set, and
    // it never costs tempo the way a chi does.
    if (canKan(hand, tile)) {
        hand[tile] -= 3;
        if (shanten(hand, view.melds.length + 1) <= before) return { type: 'kan' };
        hand[tile] += 3;
    }
    // Pon: worth breaking concealment for honors and terminals (they carry 番),
    // or once the hand is close enough that speed beats value.
    if (canPon(hand, tile)) {
        hand[tile] -= 2;
        const after = shanten(hand, view.melds.length + 1);
        hand[tile] += 2;
        const valuable = isHonor(tile) || isTerminalOrHonor(tile);
        if (after < before && (open || valuable || before <= 2)) return { type: 'pon' };
    }
    // Chi is the weakest call — it buys tempo and nothing else, so only take it
    // on an already-open hand or when it is close to finishing one.
    if (canChi && (open || before <= 2)) {
        for (const pair of chiOptions(view.hand, tile)) {
            const h = view.hand.slice();
            h[pair[0]]--; h[pair[1]]--;
            if (shanten(h, view.melds.length + 1) < before) return { type: 'chi', with: pair };
        }
    }
    return { type: 'pass' };
}

/** Bots always take a legal win — declining (見逃し) is a nuance, not a rule. */
export function wantsWin(): boolean { return true; }

/** Is this hand one tile away? Exposed for HUD hints ("聽" indicator). */
export function tenpaiInfo(view: BotView): { tenpai: boolean; waits: Kind[] } {
    const w = waits(view.hand, view.melds);
    return { tenpai: w.length > 0, waits: w };
}

/** Rough "how close am I" label for the human's HUD. */
export function handProgress(hand: number[], melds: Meld[]): string {
    const sh = shanten(hand, melds.length);
    if (sh < 0) return '和了';
    if (sh === 0) return '聽牌';
    return `${sh} 向聽`;
}

/** Terminal/honor-heavy hands are what a bot throws first; used by tests. */
export { isTerminalOrHonor };
