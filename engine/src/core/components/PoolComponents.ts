/**
 * Pool (3D in-world billiards) ECS components.
 *
 * The PoolSystem owns the physics; these components are the DATA it integrates.
 * All positions are SPP block-local metres (X = East, Y = North); the system
 * derives each ball's engine TransformComponent from them every frame (the same
 * data→behaviour split as everything else — the adjunct/entity is data, the
 * System is the logic).
 */

/** A pool ball's authoritative table-plane state. */
export interface PoolBallComponent {
    ballId: number;   // 0 = cue ball
    x: number;        // SPP East (block-local metres)
    y: number;        // SPP North
    vx: number;       // velocity, m/s
    vy: number;
    potted: boolean;
    radius: number;   // metres
}

/** The pool table: playfield geometry + pockets (SPP block-local metres). */
export interface PoolTableComponent {
    block: [number, number];      // which block the table sits on
    cx: number; cy: number;       // table centre (block-local)
    bedW: number; bedD: number;   // playfield size (E × N)
    ballZ: number;                // ball CENTRE altitude (bed top + radius)
    ballR: number;
    pocketR: number;
    friction: number;             // per-second velocity retention (0..1)
    pockets: Array<[number, number]>;
    potted: number;               // object balls sunk
    scratches: number;            // times the cue was pocketed (then respotted)
    finished: boolean;            // all object balls sunk
}
