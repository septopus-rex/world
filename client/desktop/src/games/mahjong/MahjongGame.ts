/**
 * MahjongGame — a small, self-contained mahjong engine. This is the "external
 * game" in the Septopus Game Mode Protocol: it knows NOTHING about the world
 * engine, the ECS, or Three.js. The world reaches it only through the Game
 * Setting `methods` whitelist (start/state/discard/win/end), exactly as it would
 * reach a remote server — here the "server" just happens to run in-page.
 *
 * Rules (a compact but real mahjong): 3 suits (m/p/s) × ranks 1–9, 4 copies each
 * = 108 tiles, no honors. The human is seat 0; seats 1–3 are tsumogiri bots
 * (draw and immediately discard). A win is the standard 4 melds + 1 pair, where a
 * meld is a triplet (3 identical) or a run (3 consecutive in one suit). Self-draw
 * only (tsumo) — no calling from discards, which keeps the mock honest yet small.
 *
 * Deterministic: all randomness comes from a seeded RNG, so a given seed always
 * deals the same wall (makes the flow testable).
 */

export type Tile = number; // 0..26 : suit*9 + (rank-1)  (m0..8, p9..17, s18..26)

export interface MahjongState {
    gameId: string;
    seat: number;                       // the human seat (always 0)
    hand: Tile[];                       // sorted; 13 between turns, 14 after a draw
    drawn: Tile | null;                 // the tile just self-drawn (highlight in UI)
    canWin: boolean;                    // current 14-tile hand is a winning hand
    discards: Record<number, Tile[]>;   // per-seat discard piles (0..3)
    wallRemaining: number;
    turn: number;                       // whose turn (0 = human)
    finished: boolean;
    won: boolean;                       // human won by tsumo
    result: MahjongResult | null;
}

export interface MahjongResult {
    won: boolean;
    reason: 'tsumo' | 'exhausted' | 'resigned';
    hand: Tile[];
    turns: number;
}

const SUITS = ['m', 'p', 's'] as const;

/** Human-readable tile label, e.g. 0 → "1m", 17 → "9p". */
export function tileLabel(t: Tile): string {
    return `${(t % 9) + 1}${SUITS[Math.floor(t / 9)]}`;
}

/** mulberry32 — tiny deterministic PRNG so a seed reproduces a deal. */
function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** 27-bucket tile-count histogram from a hand. */
function counts(hand: Tile[]): number[] {
    const c = new Array(27).fill(0);
    for (const t of hand) c[t]++;
    return c;
}

/**
 * Standard win test: can `c` (a 27-count histogram, 14 tiles) decompose into one
 * pair + four melds? Tries each possible pair, then checks the rest is all melds.
 */
export function isWinningHand(hand: Tile[]): boolean {
    if (hand.length !== 14) return false;
    const c = counts(hand);
    for (let p = 0; p < 27; p++) {
        if (c[p] >= 2) {
            c[p] -= 2;
            if (allMelds(c.slice())) return true;
            c[p] += 2;
        }
    }
    return false;
}

/** Does the histogram decompose entirely into melds (triplets / runs)? */
function allMelds(c: number[]): boolean {
    // First non-empty tile.
    let i = 0;
    while (i < 27 && c[i] === 0) i++;
    if (i === 27) return true; // nothing left → success

    // Try a triplet at i.
    if (c[i] >= 3) {
        c[i] -= 3;
        if (allMelds(c)) return true;
        c[i] += 3;
    }
    // Try a run i, i+1, i+2 (must stay within the same suit: rank 0..6 in-suit).
    const rank = i % 9;
    if (rank <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
        c[i]--; c[i + 1]--; c[i + 2]--;
        if (allMelds(c)) return true;
        c[i]++; c[i + 1]++; c[i + 2]++;
    }
    return false; // tile i can't be consumed → dead end
}

export class MahjongGame {
    private wall: Tile[] = [];
    private hands: Tile[][] = [[], [], [], []];
    private discards: Record<number, Tile[]> = { 0: [], 1: [], 2: [], 3: [] };
    private drawn: Tile | null = null;
    private turn = 0;
    private finished = false;
    private won = false;
    private result: MahjongResult | null = null;
    private turnCount = 0;
    private readonly rand: () => number;
    public readonly gameId: string;

    constructor(seed: number) {
        this.rand = rng(seed);
        this.gameId = `mj-${(seed >>> 0).toString(36)}`;
        this.deal();
    }

    private deal(): void {
        // Build + shuffle the 108-tile wall (Fisher–Yates, seeded).
        const wall: Tile[] = [];
        for (let t = 0; t < 27; t++) for (let k = 0; k < 4; k++) wall.push(t);
        for (let i = wall.length - 1; i > 0; i--) {
            const j = Math.floor(this.rand() * (i + 1));
            [wall[i], wall[j]] = [wall[j], wall[i]];
        }
        for (let seat = 0; seat < 4; seat++) {
            this.hands[seat] = wall.splice(0, 13).sort((a, b) => a - b);
        }
        this.wall = wall;
        // Human draws to open the game so they have a discard to make.
        this.drawForHuman();
    }

    /** Human self-draws (hand → 14); sets canWin / draw-game as needed. */
    private drawForHuman(): void {
        if (this.wall.length === 0) {
            this.endGame('exhausted');
            return;
        }
        const t = this.wall.shift()!;
        this.drawn = t;
        this.hands[0].push(t);
        this.hands[0].sort((a, b) => a - b);
        this.turn = 0;
    }

    /** Bots 1..3 each draw and immediately discard (tsumogiri). */
    private runBots(): void {
        for (let seat = 1; seat <= 3; seat++) {
            if (this.wall.length === 0) { this.endGame('exhausted'); return; }
            const t = this.wall.shift()!;
            this.discards[seat].push(t); // discard the drawn tile
        }
    }

    private endGame(reason: MahjongResult['reason']): void {
        this.finished = true;
        this.won = reason === 'tsumo';
        this.result = { won: this.won, reason, hand: this.hands[0].slice(), turns: this.turnCount };
    }

    // ── External API surface (matches the Game Setting `methods` whitelist) ──

    /** `start` — return the opening state (human already drew to 14). */
    public start(): MahjongState { return this.state(); }

    /** `state` — current snapshot. */
    public state(): MahjongState {
        return {
            gameId: this.gameId,
            seat: 0,
            hand: this.hands[0].slice(),
            drawn: this.drawn,
            canWin: !this.finished && this.hands[0].length === 14 && isWinningHand(this.hands[0]),
            discards: { 0: this.discards[0].slice(), 1: this.discards[1].slice(), 2: this.discards[2].slice(), 3: this.discards[3].slice() },
            wallRemaining: this.wall.length,
            turn: this.turn,
            finished: this.finished,
            won: this.won,
            result: this.result,
        };
    }

    /** `discard` — human discards `tile`; bots play; human draws again. */
    public discard(tile: Tile): MahjongState {
        if (this.finished) return this.state();
        const h = this.hands[0];
        const idx = h.indexOf(tile);
        if (idx < 0) throw new Error(`discard: tile ${tile} not in hand`);
        h.splice(idx, 1);
        this.discards[0].push(tile);
        this.drawn = null;
        this.turnCount++;
        this.runBots();
        if (!this.finished) this.drawForHuman();
        return this.state();
    }

    /** `win` — declare tsumo if the 14-tile hand is a winning hand. */
    public win(): MahjongState {
        if (!this.finished && this.hands[0].length === 14 && isWinningHand(this.hands[0])) {
            this.endGame('tsumo');
        }
        return this.state();
    }

    /** `end` — finalize the session (resign if still running); return the result. */
    public end(): MahjongResult {
        if (!this.finished) this.endGame('resigned');
        return this.result!;
    }
}
