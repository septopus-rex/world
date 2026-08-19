/**
 * Mahjong (3D in-world, turn-based) ECS components.
 *
 * The deliberate counterpart to the pool components: where pool is CONTINUOUS
 * physics, mahjong is DISCRETE, turn-based, hidden-information state. Same split
 * though — the entity/adjunct is DATA, the MahjongSystem is the LOGIC. Tiles are
 * a2 box adjunct entities physically on the table; the System owns the wall,
 * hands, melds, discards and turn order, mutates entity lifecycle on draw /
 * discard / claim, and derives each live tile's engine TransformComponent every
 * frame (Septopus→engine).
 *
 * The RULES are not here and not in the System: shape, win detection, shanten,
 * claim legality, scoring and bot policy all live in `core/mahjong/` as pure
 * functions, shared with the external-app mahjong (Pattern A). The System owns
 * the table — whose turn it is, which tile entity sits where — and asks the rule
 * core every question about legality or value.
 */

import type { MeldType } from '../mahjong/Tiles';
import type { FanEntry } from '../mahjong/Score';

export type MahjongZone = 'wall' | 'hand' | 'meld' | 'discard';

/** One mahjong tile that is currently rendered (a wall tile has no entity). */
export interface MahjongTileComponent {
    tileId: number;       // stable identity 0..135
    kind: number;         // 0..33 tile face (suit*9+rank, winds, dragons)
    zone: MahjongZone;    // never 'wall' for a live entity (wall tiles aren't spawned)
    seat: number;         // owning seat (0..3)
    slot: number;         // position within its hand/meld/discard row (for layout)
    faceUp: boolean;      // human hand + all melds + all discards face up
    /** Hand tiles stand upright facing their seat; melds and discards lie flat. */
    upright: boolean;
    /** Just-drawn tile, held slightly apart from the rest of the hand. */
    drawn?: boolean;
}

/** An exposed set on the table, in tile ids (the rule core works in kinds). */
export interface TableMeld {
    type: MeldType;
    tileIds: number[];
    from: number;         // seat the claimed tile came from (self for ankan)
    claimed: number;      // tileId that was claimed
}

/** What a seat may do in response to a discard (or to its own draw). */
export type ClaimAction = 'ron' | 'kan' | 'pon' | 'chi' | 'tsumo' | 'ankan' | 'pass';

export interface ClaimOffer {
    seat: number;
    action: ClaimAction;
    /** For chi: the two kinds from hand that complete the run. For ankan/kan on
     *  a draw: the kind being quadded. */
    kinds?: number[];
}

export interface MahjongResult {
    kind: 'tsumo' | 'ron' | 'draw';
    winner: number | null;
    from: number | null;          // discarder's seat for a ron
    fan: FanEntry[];
    total: number;                // 番
    delta: number[];              // per-seat point change
    hand: number[];               // winner's kinds, for the result panel
    melds: TableMeld[];
    winTile: number | null;       // kind
}

/**
 * Phases:
 *   · `turn`  — the seat on turn holds a drawn tile and must discard (or win/kan)
 *   · `claim` — a tile was discarded and seats may call on it; the human's window
 *               is open (bots have already decided)
 *   · `over`  — someone won, or the wall ran out (流局)
 */
export type MahjongPhase = 'turn' | 'claim' | 'over';

/** The mahjong table: authoritative game state + playfield geometry (SPP metres). */
export interface MahjongTableComponent {
    block: [number, number];     // which block the table sits on
    cx: number; cy: number;      // table centre (block-local SPP)
    seats: number;               // 4
    humanSeat: number;           // the seat the local player controls

    // ── game state (the System is the only writer) ──
    kinds: number[];             // tileId → kind (fixed identity, length 136)
    wall: number[];              // tileIds not yet drawn, in draw order
    hands: number[][];           // per seat: tileIds held concealed
    melds: TableMeld[][];        // per seat: exposed sets
    discards: number[][];        // per seat: tileIds discarded, in order
    turn: number;                // whose turn it is
    drawnTile: number | null;    // tileId the seat on turn just drew (null after a claim)
    lastDiscard: number | null;  // tileId of the most recent discard
    lastDiscardSeat: number;     // who discarded it (−1 = none yet)
    phase: MahjongPhase;
    botTimer: number;            // seconds until the current bot acts
    botDelay: number;            // seconds a bot "thinks"

    // ── claim window ──
    /** Offers available to the HUMAN right now (empty = nothing to decide). */
    humanOffers: ClaimOffer[];
    /** The best offer each bot made on the current discard, already decided. */
    botOffers: ClaimOffer[];
    claimTimer: number;          // seconds left in the human's claim window
    claimWindow: number;         // how long that window is

    // ── scoring ──
    roundWind: number;           // 27..30
    seatWinds: number[];         // per seat, 27..30
    scores: number[];            // running points
    afterKan: boolean;           // next draw is a replacement tile (杠上开花)
    result: MahjongResult | null;

    // ── geometry ──
    surfaceZ: number;            // table top altitude
    tileW: number; tileD: number; tileH: number;
    spacing: number;             // gap between tiles along a row
    handDist: number;            // hand row distance from centre
    discDist: number;            // discard grid distance from centre
    meldGap: number;             // gap between the hand row and the meld row
}
