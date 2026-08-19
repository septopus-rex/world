/**
 * MahjongGame — the "external game" in the Septopus Game Mode Protocol: it knows
 * NOTHING about the world engine, the ECS, or Three.js. The world reaches it only
 * through the Game Setting `methods` whitelist (start/state/discard/win/end),
 * exactly as it would reach a remote server — here the "server" just happens to
 * run in-page (and, on `services/mahjong`, actually is one).
 *
 * RULES COME FROM `engine/src/core/mahjong` — the same pure rule core the in-world
 * 3D table (MahjongSystem) uses. That import is the ONLY thing this file takes
 * from the engine tree, and it is not engine machinery: it is functions over
 * numbers. Before it existed the two mahjongs each had half a rulebook and
 * disagreed — the 3D table could not even detect a win.
 *
 * NOTE the relative import path rather than the `@engine` alias: `services/mahjong`
 * runs this file under bare `tsx`, which has no vite aliases.
 *
 * Scope: a compact but real mahjong — 3 suits (m/p/s) × ranks 1–9, 4 copies each
 * = 108 tiles, no honours. The human is seat 0; seats 1–3 play the shared bot
 * policy. Self-draw only (tsumo) — calling from discards belongs to the in-world
 * table, which has the 3D affordances to offer it. Deliberately smaller than the
 * full table: this one exists to prove the external-app seam, not to be the
 * better mahjong.
 *
 * Deterministic: all randomness comes from a seeded RNG, so a given seed always
 * deals the same wall.
 */

import {
    tally, kindLabel, kindName,
    isWinningHand as coreIsWinningHand, shanten,
    chooseDiscard, scoreHand, settle,
    type FanEntry,
} from '../../../../../engine/src/core/mahjong';

export type Tile = number; // 0..26 : suit*9 + (rank-1)  (m0..8, p9..17, s18..26)

export interface MahjongState {
    gameId: string;
    seat: number;                       // the human seat (always 0)
    hand: Tile[];                       // sorted; 13 between turns, 14 after a draw
    drawn: Tile | null;                 // the tile just self-drawn (highlight in UI)
    canWin: boolean;                    // current 14-tile hand is a winning hand
    /** How far from a win, from the shared rule core: −1 won, 0 tenpai, n away. */
    shanten: number;
    discards: Record<number, Tile[]>;   // per-seat discard piles (0..3)
    wallRemaining: number;
    turn: number;                       // whose turn (0 = human)
    finished: boolean;
    won: boolean;                       // human won by tsumo
    result: MahjongResult | null;
}

export interface MahjongResult {
    won: boolean;
    reason: 'tsumo' | 'exhausted' | 'resigned' | 'lost';
    hand: Tile[];
    turns: number;
    /** 番 breakdown when someone won (empty for a draw / resignation). */
    fan: FanEntry[];
    total: number;
    /** Per-seat point delta, winner first-class. */
    delta: number[];
    /** Which seat won, when one did. */
    winner: number | null;
}

/** Human-readable tile label, e.g. 0 → "1m", 17 → "9p". */
export function tileLabel(t: Tile): string { return kindLabel(t); }
/** Chinese tile name for richer UI, e.g. 0 → 一萬. */
export function tileName(t: Tile): string { return kindName(t); }

/** Is this 14-tile hand complete? Thin wrapper so callers need not build a tally. */
export function isWinningHand(hand: Tile[]): boolean {
    return hand.length === 14 && coreIsWinningHand(tally(hand));
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

const SUIT_COUNT = 27;   // no honours in this deck

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
        for (let t = 0; t < SUIT_COUNT; t++) for (let k = 0; k < 4; k++) wall.push(t);
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
            this.endGame('exhausted', null);
            return;
        }
        const t = this.wall.shift()!;
        this.drawn = t;
        this.hands[0].push(t);
        this.hands[0].sort((a, b) => a - b);
        this.turn = 0;
    }

    /** Everything a seat can see: every discard on the table so far. */
    private seen(): number[] {
        const all: Tile[] = [];
        for (let s = 0; s < 4; s++) all.push(...this.discards[s]);
        return tally(all);
    }

    /**
     * Bots 1..3 each draw, then discard by the SHARED policy (not 摸打). A bot that
     * draws its winning tile takes the hand — the human can lose, which is what
     * makes their own discards a decision rather than a formality.
     */
    private runBots(): void {
        for (let seat = 1; seat <= 3; seat++) {
            if (this.wall.length === 0) { this.endGame('exhausted', null); return; }
            const t = this.wall.shift()!;
            const hand = this.hands[seat];
            hand.push(t);
            hand.sort((a, b) => a - b);

            if (coreIsWinningHand(tally(hand))) { this.endGame('lost', seat, t); return; }

            const kind = chooseDiscard({ hand: tally(hand), melds: [], seen: this.seen() });
            const idx = hand.indexOf(kind);
            const out = idx >= 0 ? hand.splice(idx, 1)[0] : hand.pop()!;
            this.discards[seat].push(out);
        }
    }

    private endGame(reason: MahjongResult['reason'], winner: number | null, winTile?: Tile): void {
        this.finished = true;
        this.won = reason === 'tsumo';
        const hand = this.hands[winner ?? 0].slice();

        let fan: FanEntry[] = [];
        let total = 0;
        let delta = [0, 0, 0, 0];
        if (winner != null) {
            const score = scoreHand({
                concealed: tally(hand),
                melds: [],
                winTile: winTile ?? hand[hand.length - 1],
                selfDraw: true,          // this deck only wins by 自摸
                seatWind: 27 + winner,
                roundWind: 27,
            });
            fan = score.fan;
            total = score.total;
            delta = settle(score, winner, -1);
        }
        this.result = {
            won: this.won, reason, hand, turns: this.turnCount,
            fan, total, delta, winner,
        };
    }

    // ── External API surface (matches the Game Setting `methods` whitelist) ──

    /** `start` — return the opening state (human already drew to 14). */
    public start(): MahjongState { return this.state(); }

    /** `state` — current snapshot. */
    public state(): MahjongState {
        const hand = this.hands[0];
        return {
            gameId: this.gameId,
            seat: 0,
            hand: hand.slice(),
            drawn: this.drawn,
            canWin: !this.finished && hand.length === 14 && coreIsWinningHand(tally(hand)),
            shanten: shanten(tally(hand)),
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
        if (!this.finished && this.hands[0].length === 14 && coreIsWinningHand(tally(this.hands[0]))) {
            this.endGame('tsumo', 0, this.drawn ?? undefined);
        }
        return this.state();
    }

    /** `end` — finalize the session (resign if still running); return the result. */
    public end(): MahjongResult {
        if (!this.finished) this.endGame('resigned', null);
        return this.result!;
    }
}
