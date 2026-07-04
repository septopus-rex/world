/**
 * Mahjong (3D in-world, turn-based) ECS components.
 *
 * The deliberate counterpart to the pool components: where pool is CONTINUOUS
 * physics, mahjong is DISCRETE, turn-based, hidden-information state. Same split
 * though — the entity/adjunct is DATA, the MahjongSystem is the LOGIC. Tiles are
 * a2 box adjunct entities physically on the table; the System owns the wall,
 * hands, discards and turn order, mutates entity lifecycle on draw/discard, and
 * derives each live tile's engine TransformComponent every frame (Septopus→engine).
 *
 * It is the adversarial second native case for Plan B: pool proved the per-frame
 * System pattern for physics; mahjong proves it isn't physics-specific — a game
 * with NO per-frame integration, hidden hands, and spawn/destroy on state change
 * fits the very same seam.
 */

export type MahjongZone = 'wall' | 'hand' | 'discard';

/** One mahjong tile that is currently rendered (a wall tile has no entity). */
export interface MahjongTileComponent {
    tileId: number;       // stable identity 0..(deckSize-1)
    kind: number;         // 0..33 tile face (suit*9+rank, winds, dragons)
    zone: MahjongZone;    // never 'wall' for a live entity (wall tiles aren't spawned)
    seat: number;         // owning seat (0..3)
    slot: number;         // position within its hand/discard row (for layout)
    faceUp: boolean;      // human hand + all discards face up; opponents face down
}

/** The mahjong table: authoritative game state + playfield geometry (SPP metres). */
export interface MahjongTableComponent {
    block: [number, number];     // which block the table sits on
    cx: number; cy: number;      // table centre (block-local SPP)
    seats: number;               // 4
    humanSeat: number;           // the seat the local player controls

    // ── game state (the System is the only writer) ──
    kinds: number[];             // tileId → kind (fixed identity, length = deck size)
    wall: number[];              // tileIds not yet drawn, in draw order
    hands: number[][];           // per seat: tileIds held (concealed)
    discards: number[][];        // per seat: tileIds discarded, in order
    turn: number;                // whose turn it is
    lastDiscard: number | null;  // tileId of the most recent discard
    phase: 'playing' | 'over';   // 'over' = wall exhausted (流局)
    botTimer: number;            // seconds until the current bot acts
    botDelay: number;            // seconds a bot "thinks" before discarding

    // ── geometry ──
    surfaceZ: number;            // table top altitude (tile centre = this + tileH/2)
    tileW: number; tileD: number; tileH: number;
    spacing: number;             // gap between tiles along a row
    handDist: number;            // hand row distance from centre
    discDist: number;            // discard grid distance from centre
}
