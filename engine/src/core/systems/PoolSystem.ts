import { World, ISystem, EntityId } from '../World';
import { AdjunctType } from '../types/AdjunctType';
import { SystemMode } from '../types/SystemMode';
import { Coords } from '../utils/Coords';
import { BlockComponent } from '../components/BlockComponent';
import { TransformComponent } from '../components/PlayerComponents';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { PoolBallComponent, PoolTableComponent } from '../components/PoolComponents';

/**
 * PoolSystem — a real, in-world 3D billiards simulation (Plan A: physics in a
 * SYSTEM, balls are adjunct entities; the bus/UI only feeds the strike).
 *
 * Deterministic per-frame physics on the table plane (SPP X/Y): friction, wall
 * bounce, equal-mass elastic ball-ball collisions, pocket capture. Sub-stepped
 * so fast balls don't tunnel. Each frame it writes every ball entity's
 * TransformComponent (SPP→engine), so VisualSync moves the meshes — runs before
 * VisualSyncSystem, exactly like CoasterSystem drives the cart.
 *
 * No mode gating: the balls are always physically present ("在场"). A shot is an
 * impulse on the cue ball via shoot(), called from the client (key/HUD) or an
 * event — the system never reads input itself.
 */
const SUBSTEPS = 4;          // per-frame integration sub-steps (anti-tunnel)
const MAX_SHOT_SPEED = 6;    // m/s at power = 1
const REST_EPS = 0.04;       // below this speed a ball is parked
const WALL_RESTITUTION = 0.9;

export interface PoolConfig {
    block: [number, number];
    origin: [number, number];   // table centre, block-local SPP
    bedW: number; bedD: number; // playfield size (E × N)
    bedSurfaceZ: number;        // bed top altitude (ball centre = this + ballR)
    ballR: number;
    pocketR: number;
    friction: number;           // per-second retention (0..1)
    cueColor?: number;          // hex colour for the cue ball
    ballColor?: number;         // hex colour for object balls
}

export class PoolSystem implements ISystem {
    private config: PoolConfig | null = null;   // armed declaration (block + params)
    private ballEids: EntityId[] = [];
    private tableEid: EntityId | null = null;    // live session (null = no session)

    // ── arm / lifecycle ──────────────────────────────────────────────────────

    /** Arm this block as a pool table. The balls spawn when the player ENTERS Game
     *  mode in this block, and tear down on leaving (Game exit / step off the block
     *  → GameZoneSystem reverts to Normal) — the game is scoped to the zone, so
     *  walking away ends it cleanly with nothing left to evict (#3). The armed
     *  config persists across eviction so re-entering re-racks. */
    public configure(world: World, config: PoolConfig): void {
        this.endSession(world);
        this.config = config;
        this.syncSession(world); // start immediately if already in Game mode here
    }

    /** Reconcile the live session with "should there be one?" = armed + Game mode
     *  + the player standing in our block. Called every frame + on (re)arm. */
    private syncSession(world: World): void {
        const want = this.config != null
            && world.mode === SystemMode.Game
            && this.playerInBlock(world, this.config.block);
        if (want && this.tableEid == null) this.startSession(world);
        else if (!want && this.tableEid != null) this.endSession(world);
    }

    private playerInBlock(world: World, [bx, by]: [number, number]): boolean {
        const players = world.getEntitiesWith(['TransformComponent', 'InputStateComponent']);
        if (players.length === 0) return false;
        const t = world.getComponent<TransformComponent>(players[0], 'TransformComponent');
        if (!t) return false;
        const spp = Coords.engineToSpp([t.position[0], t.position[1], t.position[2]]);
        return spp.block[0] === bx && spp.block[1] === by;
    }

    /** Build the table + rack: spawn a7 sphere ball entities and tag them with
     *  PoolBallComponent, create the PoolTableComponent. */
    private startSession(world: World): void {
        const config = this.config;
        if (!config) return;
        const blockEid = this.findBlock(world, config.block);
        if (blockEid == null) return;
        const bs = world.systems.findSystemByName('BlockSystem') as any;
        if (!bs?.spawnAdjunct) return;

        const table: PoolTableComponent = {
            block: config.block,
            cx: config.origin[0], cy: config.origin[1],
            bedW: config.bedW, bedD: config.bedD,
            ballZ: config.bedSurfaceZ + config.ballR,
            ballR: config.ballR,
            pocketR: config.pocketR,
            friction: config.friction,
            pockets: this.computePockets(config.origin[0], config.origin[1], config.bedW, config.bedD),
            potted: 0,
            scratches: 0,
            finished: false,
        };
        this.tableEid = world.createEntity();
        world.addComponent(this.tableEid, 'PoolTableComponent', table);

        const r = config.ballR;
        const cueColor = config.cueColor ?? 0xf0f0f0;   // near-white
        const ballColor = config.ballColor ?? 0xcc2233; // billiard red
        this.computeRack(table).forEach((p, i) => {
            const raw = [[r * 2, r * 2, r * 2], [p.x, p.y, table.ballZ], [0, 0, 0], 0, [1, 1], 0, 0];
            const eid = bs.spawnAdjunct(world, blockEid, AdjunctType.Ball, raw);
            if (eid == null) return;
            // Spheres don't map resource→colour, so set the material colour directly
            // (before the mesh builds next frame) to tell the cue from object balls.
            const adj = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent');
            if (adj?.stdData) {
                adj.stdData.material = { ...(adj.stdData.material || {}), color: i === 0 ? cueColor : ballColor };
                // Balls are simulation state, not authored geometry — tag them so
                // serializeBlockToRaw skips them and they never pollute the block
                // draft (mirrors MahjongSystem's tiles).
                (adj.stdData as any).derivedFrom = 'pool';
            }
            world.addComponent<PoolBallComponent>(eid, 'PoolBallComponent', {
                ballId: i, x: p.x, y: p.y, vx: 0, vy: 0, potted: false, radius: r,
            });
            this.ballEids.push(eid);
        });
    }

    /** Strike the cue ball: angle in TABLE coords (East = 0, North = +π/2),
     *  power 0..1. No-op while balls are still moving (one shot at a time). */
    public shoot(world: World, angleRad: number, power: number): boolean {
        const table = this.findTable(world);
        if (!table) return false;
        const balls = this.collectBalls(world).map((x) => x.b);
        if (this.anyMoving(balls)) return false;
        const cue = balls.find((b) => b.ballId === 0 && !b.potted);
        if (!cue) return false;
        const speed = Math.max(0, Math.min(1, power)) * MAX_SHOT_SPEED;
        cue.vx = Math.cos(angleRad) * speed;
        cue.vy = Math.sin(angleRad) * speed;
        return true;
    }

    /** Diagnostics / tests. */
    public snapshot(world: World): { balls: PoolBallComponent[]; table: PoolTableComponent | null } {
        return { balls: this.collectBalls(world).map((x) => x.b), table: this.findTable(world) };
    }

    // ── per-frame ──────────────────────────────────────────────────────────────

    public update(world: World, dt: number): void {
        this.syncSession(world); // start/stop the session on Game-mode / zone transitions
        const table = this.findTable(world);
        if (!table) return;
        const entries = this.collectBalls(world);
        if (entries.length === 0) return;

        this.simulate(table, entries.map((e) => e.b), dt);

        const elevation = this.blockElevation(world, table.block);
        for (const { eid, b } of entries) {
            const z = b.potted ? table.ballZ - 1.4 : table.ballZ; // potted balls drop into the pocket
            const e = Coords.sppToEngine([b.x, b.y, z], table.block);
            e[1] += elevation;
            const t = world.getComponent<TransformComponent>(eid, 'TransformComponent');
            if (t) { t.position[0] = e[0]; t.position[1] = e[1]; t.position[2] = e[2]; t.dirty = true; }
        }
    }

    private simulate(table: PoolTableComponent, balls: PoolBallComponent[], dt: number): void {
        const h = dt / SUBSTEPS;
        const hx = table.bedW / 2 - table.ballR;
        const hy = table.bedD / 2 - table.ballR;

        for (let s = 0; s < SUBSTEPS; s++) {
            for (const b of balls) {
                if (b.potted) continue;
                if (Math.hypot(b.vx, b.vy) < REST_EPS) { b.vx = 0; b.vy = 0; continue; }
                b.x += b.vx * h; b.y += b.vy * h;
                const decay = Math.pow(table.friction, h);
                b.vx *= decay; b.vy *= decay;

                // Pocket capture.
                let sunk = false;
                for (const [px, py] of table.pockets) {
                    if (Math.hypot(b.x - px, b.y - py) < table.pocketR) { sunk = true; break; }
                }
                if (sunk) { b.potted = true; b.vx = 0; b.vy = 0; continue; }

                // Cushions (relative to the table centre).
                if (b.x < table.cx - hx) { b.x = table.cx - hx; b.vx = -b.vx * WALL_RESTITUTION; }
                else if (b.x > table.cx + hx) { b.x = table.cx + hx; b.vx = -b.vx * WALL_RESTITUTION; }
                if (b.y < table.cy - hy) { b.y = table.cy - hy; b.vy = -b.vy * WALL_RESTITUTION; }
                else if (b.y > table.cy + hy) { b.y = table.cy + hy; b.vy = -b.vy * WALL_RESTITUTION; }
            }

            // Pairwise equal-mass elastic collisions (exchange the normal component).
            for (let i = 0; i < balls.length; i++) {
                const a = balls[i]; if (a.potted) continue;
                for (let j = i + 1; j < balls.length; j++) {
                    const c = balls[j]; if (c.potted) continue;
                    const dx = c.x - a.x, dy = c.y - a.y;
                    const d = Math.hypot(dx, dy);
                    const min = a.radius + c.radius;
                    if (d > 0 && d < min) {
                        const nx = dx / d, ny = dy / d, overlap = min - d;
                        a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
                        c.x += nx * overlap / 2; c.y += ny * overlap / 2;
                        const av = a.vx * nx + a.vy * ny;
                        const cv = c.vx * nx + c.vy * ny;
                        const diff = cv - av;
                        a.vx += diff * nx; a.vy += diff * ny;
                        c.vx -= diff * nx; c.vy -= diff * ny;
                    }
                }
            }
        }

        // Scratch → count it, then respot the cue so play continues.
        const cue = balls.find((b) => b.ballId === 0);
        if (cue && cue.potted) {
            table.scratches++;
            cue.potted = false; cue.x = table.cx - table.bedW * 0.25; cue.y = table.cy; cue.vx = 0; cue.vy = 0;
        }
        table.potted = balls.filter((b) => b.ballId !== 0 && b.potted).length;
        table.finished = balls.filter((b) => b.ballId !== 0).every((b) => b.potted);
    }

    // ── helpers ────────────────────────────────────────────────────────────────

    private anyMoving(balls: PoolBallComponent[]): boolean {
        return balls.some((b) => !b.potted && Math.hypot(b.vx, b.vy) >= REST_EPS);
    }

    private collectBalls(world: World): Array<{ eid: EntityId; b: PoolBallComponent }> {
        const out: Array<{ eid: EntityId; b: PoolBallComponent }> = [];
        for (const eid of world.getEntitiesWith(['PoolBallComponent', 'TransformComponent'])) {
            const b = world.getComponent<PoolBallComponent>(eid, 'PoolBallComponent');
            if (b) out.push({ eid, b });
        }
        out.sort((p, q) => p.b.ballId - q.b.ballId);
        return out;
    }

    private findTable(world: World): PoolTableComponent | null {
        const eid = world.getEntitiesWith(['PoolTableComponent'])[0];
        return eid != null ? world.getComponent<PoolTableComponent>(eid, 'PoolTableComponent') ?? null : null;
    }

    private findBlock(world: World, [bx, by]: [number, number]): EntityId | null {
        for (const eid of world.getEntitiesWith(['BlockComponent'])) {
            const b = world.getComponent<BlockComponent>(eid, 'BlockComponent');
            if (b?.x === bx && b?.y === by) return eid;
        }
        return null;
    }

    private blockElevation(world: World, block: [number, number]): number {
        const eid = this.findBlock(world, block);
        const b = eid != null ? world.getComponent<BlockComponent>(eid, 'BlockComponent') : null;
        return b?.elevation || 0;
    }

    private computePockets(cx: number, cy: number, w: number, d: number): Array<[number, number]> {
        const hw = w / 2, hd = d / 2;
        return [
            [cx - hw, cy - hd], [cx + hw, cy - hd],
            [cx - hw, cy + hd], [cx + hw, cy + hd],
            [cx, cy - hd], [cx, cy + hd],
        ];
    }

    /** Cue on one side + a 6-ball triangle on the other (deterministic, no RNG). */
    private computeRack(t: PoolTableComponent): Array<{ x: number; y: number }> {
        const out = [{ x: t.cx - t.bedW * 0.25, y: t.cy }]; // cue
        const apex = t.cx + t.bedW * 0.15;
        const gap = t.ballR * 2.2;
        let placed = 0;
        for (let col = 0; col < 3 && placed < 6; col++) {
            for (let row = 0; row <= col && placed < 6; row++) {
                out.push({ x: apex + col * gap * 0.9, y: t.cy + (row - col / 2) * gap });
                placed++;
            }
        }
        return out;
    }

    /** End the live session: free the ball meshes + destroy the table entity. The
     *  armed config is kept, so re-entering the zone re-racks. */
    private endSession(world: World): void {
        // Balls own meshes + instanced resources — free those before destroying the
        // entity (bare destroyEntity leaks the mesh). The table entity has no mesh.
        const bs = world.systems.findSystemByName('BlockSystem') as any;
        for (const eid of this.ballEids) {
            if (bs?.destroyAdjunct) bs.destroyAdjunct(world, eid);
            else world.destroyEntity?.(eid);
        }
        if (this.tableEid != null) world.destroyEntity?.(this.tableEid);
        this.ballEids = [];
        this.tableEid = null;
    }
}
