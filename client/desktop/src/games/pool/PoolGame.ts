/**
 * PoolGame — a small, self-contained billiards engine. Like MahjongGame, this is
 * the "external game": it knows NOTHING about the world engine. The world reaches
 * it only through the Game Setting `methods` whitelist (start/state/shoot/end).
 *
 * Light deterministic physics: a cue ball + object balls on a rectangular table
 * with 6 pockets. A shot gives the cue ball a velocity (angle + power); the sim
 * steps with friction, wall bounces, equal-mass ball collisions, and pocket
 * capture until everything rests. No RNG — a given break + shots reproduce.
 */

export interface Ball { id: number; x: number; y: number; potted: boolean }
export interface PoolState {
    gameId: string;
    table: { w: number; h: number; pocketR: number; ballR: number };
    pockets: Array<[number, number]>;
    balls: Ball[];      // index 0 = cue
    shots: number;
    pottedCount: number; // object balls sunk
    finished: boolean;
    scratched: boolean;  // last shot pocketed the cue ball
    result: PoolResult | null;
}
export interface PoolResult { potted: number; shots: number; cleared: boolean }

const W = 200, H = 100;          // table interior
const BALL_R = 4, POCKET_R = 9;  // radii
const FRICTION = 0.985;          // per-step velocity decay
const DT = 1, EPS = 0.04, MAX_STEPS = 4000;
const POCKETS: Array<[number, number]> = [
    [0, 0], [W / 2, 0], [W, 0], [0, H], [W / 2, H], [W, H],
];

interface V { id: number; x: number; y: number; vx: number; vy: number; potted: boolean }

export class PoolGame {
    private balls: V[] = [];
    private shots = 0;
    private finished = false;
    private scratched = false;
    public readonly gameId: string;

    constructor(seed: number) {
        this.gameId = `pool-${(seed >>> 0).toString(36)}`;
        this.rack();
    }

    private rack(): void {
        // Cue on the left; a small triangle of 6 object balls on the right.
        this.balls = [{ id: 0, x: W * 0.25, y: H / 2, vx: 0, vy: 0, potted: false }];
        const apex = W * 0.65, gap = BALL_R * 2.1;
        let id = 1;
        for (let col = 0; col < 3; col++) {
            for (let row = 0; row <= col; row++) {
                this.balls.push({
                    id: id++,
                    x: apex + col * gap * 0.9,
                    y: H / 2 + (row - col / 2) * gap,
                    vx: 0, vy: 0, potted: false,
                });
            }
        }
    }

    private simulate(): void {
        for (let step = 0; step < MAX_STEPS; step++) {
            let moving = false;
            // Integrate + friction + walls + pockets.
            for (const b of this.balls) {
                if (b.potted) continue;
                if (Math.abs(b.vx) < EPS && Math.abs(b.vy) < EPS) { b.vx = 0; b.vy = 0; continue; }
                moving = true;
                b.x += b.vx * DT; b.y += b.vy * DT;
                b.vx *= FRICTION; b.vy *= FRICTION;
                // Pocket capture.
                for (const [px, py] of POCKETS) {
                    if (Math.hypot(b.x - px, b.y - py) < POCKET_R) {
                        b.potted = true; b.vx = 0; b.vy = 0;
                        if (b.id === 0) this.scratched = true;
                        break;
                    }
                }
                if (b.potted) continue;
                // Wall bounce.
                if (b.x < BALL_R) { b.x = BALL_R; b.vx = -b.vx; }
                else if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -b.vx; }
                if (b.y < BALL_R) { b.y = BALL_R; b.vy = -b.vy; }
                else if (b.y > H - BALL_R) { b.y = H - BALL_R; b.vy = -b.vy; }
            }
            // Pairwise elastic collisions (equal mass → swap normal components).
            for (let i = 0; i < this.balls.length; i++) {
                const a = this.balls[i]; if (a.potted) continue;
                for (let j = i + 1; j < this.balls.length; j++) {
                    const c = this.balls[j]; if (c.potted) continue;
                    const dx = c.x - a.x, dy = c.y - a.y;
                    const d = Math.hypot(dx, dy);
                    if (d > 0 && d < BALL_R * 2) {
                        const nx = dx / d, ny = dy / d;
                        // Separate so they no longer overlap.
                        const overlap = BALL_R * 2 - d;
                        a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
                        c.x += nx * overlap / 2; c.y += ny * overlap / 2;
                        // Exchange the velocity components along the normal.
                        const av = a.vx * nx + a.vy * ny;
                        const cv = c.vx * nx + c.vy * ny;
                        const diff = cv - av;
                        a.vx += diff * nx; a.vy += diff * ny;
                        c.vx -= diff * nx; c.vy -= diff * ny;
                    }
                }
            }
            if (!moving) break;
        }
        // Respot the cue if scratched (so the game can continue).
        if (this.scratched) {
            const cue = this.balls[0];
            cue.potted = false; cue.x = W * 0.25; cue.y = H / 2; cue.vx = 0; cue.vy = 0;
        }
        if (this.balls.slice(1).every(b => b.potted)) this.finished = true;
    }

    // ── External API surface (matches the Game Setting `methods` whitelist) ──

    public start(): PoolState { return this.state(); }

    public state(): PoolState {
        return {
            gameId: this.gameId,
            table: { w: W, h: H, pocketR: POCKET_R, ballR: BALL_R },
            pockets: POCKETS.map(p => [p[0], p[1]] as [number, number]),
            balls: this.balls.map(b => ({ id: b.id, x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, potted: b.potted })),
            shots: this.shots,
            pottedCount: this.balls.slice(1).filter(b => b.potted).length,
            finished: this.finished,
            scratched: this.scratched,
            result: this.finished ? this.makeResult() : null,
        };
    }

    /** `shoot` — strike the cue ball at `angleDeg` with `power` (0..100). */
    public shoot(angleDeg: number, power: number): PoolState {
        if (this.finished) return this.state();
        const cue = this.balls[0];
        if (cue.potted) { cue.potted = false; cue.x = W * 0.25; cue.y = H / 2; }
        const a = (angleDeg * Math.PI) / 180;
        const speed = Math.max(0, Math.min(100, power)) * 0.12; // tuned to the table
        cue.vx = Math.cos(a) * speed; cue.vy = Math.sin(a) * speed;
        this.scratched = false;
        this.shots++;
        this.simulate();
        return this.state();
    }

    private makeResult(): PoolResult {
        return { potted: this.balls.slice(1).filter(b => b.potted).length, shots: this.shots, cleared: this.finished };
    }

    /** `end` — finalize and report. */
    public end(): PoolResult { this.finished = true; return this.makeResult(); }
}
