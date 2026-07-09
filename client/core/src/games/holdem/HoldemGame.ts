/**
 * HoldemGame — a small, self-contained Texas Hold'em engine. Like MahjongGame
 * and PoolGame it is the "external game" of the Septopus Game Mode Protocol:
 * it knows NOTHING about the world engine — the world reaches it only through
 * the Game Setting `methods` whitelist (start/state/act/end), exactly as it
 * would reach a remote server.
 *
 * Rules (compact but real): 52 cards, the human (seat 0) vs 3 calling-station
 * bots (they always match — the mahjong tsumogiri precedent: honest, tiny,
 * deterministic). One hand per session: ante 5 each → preflop (2 hole cards) →
 * flop(3) → turn(1) → river(1) → showdown. On each street the human acts once:
 *   check — no chips move, deal on
 *   bet   — fixed 10; every bot calls (pot grows by 40)
 *   fold  — hand over, antes/bets are lost
 * Showdown evaluates the best 5-of-7 for every seat (full ranking incl. the
 * wheel A-2-3-4-5); the winner(s) split the pot.
 *
 * Card encoding: id 0..51 → rank 2..14 = 2 + (id >> 2), suit 0..3 = id & 3.
 * Determinism: mulberry32(seed) drives the shuffle — same seed, same deal,
 * byte-identical on the loopback and on services/holdem.
 */

const mulberry32 = (seed: number) => {
    let a = seed >>> 0 || 1;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

export const rankOf = (card: number): number => 2 + (card >> 2); // 2..14 (A=14)
export const suitOf = (card: number): number => card & 3;

/** Score one 5-card hand as a lexicographically comparable tuple:
 *  [category, tiebreak…] — 8 SF · 7 quads · 6 full house · 5 flush ·
 *  4 straight · 3 trips · 2 two pair · 1 pair · 0 high card. */
export function score5(cards: number[]): number[] {
    const ranks = cards.map(rankOf).sort((a, b) => b - a);
    const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
    // straight: 5 distinct ranks in a row; the wheel (A-5) counts with high=5
    const uniq = [...new Set(ranks)];
    let straightHigh = 0;
    if (uniq.length === 5) {
        if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
        else if (uniq[0] === 14 && uniq[1] === 5 && uniq[1] - uniq[4] === 3) straightHigh = 5; // A-2-3-4-5
    }
    const count = new Map<number, number>();
    for (const r of ranks) count.set(r, (count.get(r) ?? 0) + 1);
    // group ranks by multiplicity, then rank (both desc) — the tiebreak order
    const groups = [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const g = groups.map(([r]) => r);
    const n = groups.map(([, c]) => c);

    if (flush && straightHigh) return [8, straightHigh];
    if (n[0] === 4) return [7, g[0], g[1]];
    if (n[0] === 3 && n[1] === 2) return [6, g[0], g[1]];
    if (flush) return [5, ...ranks];
    if (straightHigh) return [4, straightHigh];
    if (n[0] === 3) return [3, g[0], g[1], g[2]];
    if (n[0] === 2 && n[1] === 2) return [2, g[0], g[1], g[2]];
    if (n[0] === 2) return [1, g[0], g[1], g[2], g[3]];
    return [0, ...ranks];
}

export function compareScore(a: number[], b: number[]): number {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const d = (a[i] ?? 0) - (b[i] ?? 0);
        if (d !== 0) return d;
    }
    return 0;
}

/** Best 5-of-7 score (all 21 combinations). */
export function score7(cards: number[]): number[] {
    let best: number[] | null = null;
    for (let i = 0; i < 7; i++) {
        for (let j = i + 1; j < 7; j++) {
            const five = cards.filter((_, k) => k !== i && k !== j);
            const s = score5(five);
            if (!best || compareScore(s, best) > 0) best = s;
        }
    }
    return best!;
}

export const HAND_NAMES = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'];

const PHASES = ['preflop', 'flop', 'turn', 'river', 'showdown'] as const;
export type HoldemPhase = typeof PHASES[number];

const ANTE = 5;
const BET = 10;
const SEATS = 4; // human is seat 0; 1..3 are calling stations

export class HoldemGame {
    public readonly gameId: string;
    private deck: number[] = [];
    private holes: number[][] = [];      // per seat, 2 cards
    private board: number[] = [];        // 5 community cards (revealed by phase)
    private phaseIdx = 0;
    private pot = 0;
    private chips = 100;                 // the human's stack
    private finished = false;
    private won = false;
    private result: any = null;

    constructor(seed: number) {
        this.gameId = 'hd-' + ((seed >>> 0) || 1).toString(36);
        const rng = mulberry32(seed);
        this.deck = Array.from({ length: 52 }, (_, i) => i);
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    start(): any {
        this.holes = Array.from({ length: SEATS }, () => [this.deck.pop()!, this.deck.pop()!]);
        this.board = Array.from({ length: 5 }, () => this.deck.pop()!);
        this.pot = ANTE * SEATS;
        this.chips -= ANTE;
        this.phaseIdx = 0;
        return this.state();
    }

    /** The human acts once per street; bots always match. */
    act(action: 'check' | 'bet' | 'fold'): any {
        if (this.finished) return this.state();
        if (action === 'fold') {
            this.finished = true;
            this.won = false;
            this.result = { reason: 'fold', pot: this.pot };
            return this.state();
        }
        if (action === 'bet') {
            this.chips -= BET;
            this.pot += BET * SEATS; // every calling station matches
        }
        this.phaseIdx++;
        if (PHASES[this.phaseIdx] === 'showdown') this.showdown();
        return this.state();
    }

    private showdown(): void {
        const scores = this.holes.map((h) => score7([...h, ...this.board]));
        const best = scores.reduce((a, s) => (compareScore(s, a) > 0 ? s : a), scores[0]);
        const winners = scores.map((s, i) => (compareScore(s, best) === 0 ? i : -1)).filter((i) => i >= 0);
        this.finished = true;
        this.won = winners.includes(0);
        if (this.won) this.chips += Math.floor(this.pot / winners.length);
        this.result = {
            reason: 'showdown',
            winners,
            pot: this.pot,
            hands: this.holes.map((h, i) => ({ seat: i, hole: h, score: scores[i], name: HAND_NAMES[scores[i][0]] })),
        };
    }

    /** Community cards visible in the current phase (0/3/4/5). */
    private visibleBoard(): number[] {
        const n = [0, 3, 4, 5, 5][this.phaseIdx];
        return this.board.slice(0, n);
    }

    state(): any {
        return {
            gameId: this.gameId,
            phase: PHASES[this.phaseIdx],
            hole: this.holes[0] ?? [],
            community: this.visibleBoard(),
            pot: this.pot,
            chips: this.chips,
            canAct: !this.finished && PHASES[this.phaseIdx] !== 'showdown',
            finished: this.finished,
            won: this.won,
            result: this.result,
        };
    }

    end(): any {
        if (!this.finished) { this.finished = true; this.result = { reason: 'left', pot: this.pot }; }
        return { gameId: this.gameId, chips: this.chips, won: this.won, result: this.result };
    }
}
