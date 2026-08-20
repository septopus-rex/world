import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { serializeBlockToRaw } from '../../src/core/utils/BlockSerializer';
import { AdjunctType } from '../../src/core/types/AdjunctType';
import { SystemMode } from '../../src/core/types/SystemMode';

// L3 — the in-world 3D pool sim (PoolSystem): configure spawns balls, a shot
// rolls them with deterministic physics, transforms are written for the meshes.

const CFG = {
    block: [2048, 2048] as [number, number],
    origin: [8, 8] as [number, number],
    bedW: 7, bedD: 4, bedSurfaceZ: 0.95, ballR: 0.12, pocketR: 0.22, friction: 0.55,
};

async function bootPool() {
    const engine = await makeHeadlessEngine(); // player defaults into block [2048,2048]
    engine.injectBlock({ x: 2048, y: 2048, world: 'main', adjuncts: [], elevation: 0 } as any);
    stepN(engine, 3);
    engine.setupPool({ ...CFG });                       // arm the table
    engine.setMode(SystemMode.Game, { force: true });   // enter Game in this block → balls spawn
    stepN(engine, 2);                                   // session starts (1) + meshes build (2)
    return engine;
}

function balls(engine: any) {
    const w = engine.getWorld();
    const out: any[] = [];
    for (const eid of w.getEntitiesWith(['PoolBallComponent'])) out.push(w.getComponent(eid, 'PoolBallComponent'));
    return out.sort((a, b) => a.ballId - b.ballId);
}

function cueEntity(engine: any) {
    const w = engine.getWorld();
    for (const eid of w.getEntitiesWith(['PoolBallComponent', 'TransformComponent'])) {
        if (w.getComponent(eid, 'PoolBallComponent').ballId === 0) return eid;
    }
    return null;
}

describe('3D pool (PoolSystem)', () => {
    it('configure spawns a cue + 6 object balls on the table', async () => {
        const engine = await bootPool();
        const bs = balls(engine);
        expect(bs.length).toBe(7);
        expect(bs[0].ballId).toBe(0);
        expect(bs.every((b) => !b.potted)).toBe(true);
        // all racked inside the playfield
        for (const b of bs) {
            expect(Math.abs(b.x - CFG.origin[0])).toBeLessThanOrEqual(CFG.bedW / 2);
            expect(Math.abs(b.y - CFG.origin[1])).toBeLessThanOrEqual(CFG.bedD / 2);
        }
    });

    it('a break shot moves the cue East, disturbs the pack, stays in bounds, is deterministic', async () => {
        const run = async () => {
            const engine = await bootPool();
            const cue0 = { ...balls(engine)[0] };
            const rack0 = balls(engine).slice(1).map((b) => ({ x: b.x, y: b.y }));
            expect(engine.poolShoot(0, 1)).toBe(true); // strike due East into the pack
            stepN(engine, 240);
            const fin = balls(engine);
            return { cue0, rack0, fin: fin.map((b) => ({ id: b.ballId, x: Math.round(b.x * 1e4) / 1e4, y: Math.round(b.y * 1e4) / 1e4, potted: b.potted })) };
        };
        const a = await run();
        const b = await run();

        const cueFin = a.fin.find((x) => x.id === 0)!;
        expect(cueFin.x).toBeGreaterThan(a.cue0.x);                 // cue advanced East
        const moved = a.fin.slice(1).some((f, i) => Math.hypot(f.x - a.rack0[i].x, f.y - a.rack0[i].y) > 0.05);
        expect(moved).toBe(true);                                  // pack was struck
        for (const f of a.fin) {                                   // nothing escaped the felt
            if (f.potted) continue;
            expect(Math.abs(f.x - CFG.origin[0])).toBeLessThanOrEqual(CFG.bedW / 2 + 1e-6);
            expect(Math.abs(f.y - CFG.origin[1])).toBeLessThanOrEqual(CFG.bedD / 2 + 1e-6);
        }
        expect(a.fin).toEqual(b.fin);                              // fully deterministic
        // eslint-disable-next-line no-console
        console.log('POOL-BREAK', JSON.stringify(a.fin));
    });

    it('refuses a second shot while balls are still moving', async () => {
        const engine = await bootPool();
        expect(engine.poolShoot(0, 1)).toBe(true);
        stepN(engine, 2);
        expect(engine.poolShoot(Math.PI, 1)).toBe(false);
    });

    it('a clear shot into an empty corner pocket sinks the cue (counts a scratch)', async () => {
        const engine = await bootPool();
        const w = engine.getWorld();
        const table = () => w.getComponent(w.getEntitiesWith(['PoolTableComponent'])[0], 'PoolTableComponent');
        const cue = balls(engine)[0];
        // SW corner pocket at (cx-bedW/2, cy-bedD/2) = (4.5, 6); the pack is East,
        // so the path is clear. Aim straight at it and hit hard.
        const ang = Math.atan2((CFG.origin[1] - CFG.bedD / 2) - cue.y, (CFG.origin[0] - CFG.bedW / 2) - cue.x);
        expect(table().scratches).toBe(0);
        expect(engine.poolShoot(ang, 1)).toBe(true);
        stepN(engine, 120);
        expect(table().scratches).toBeGreaterThanOrEqual(1); // cue reached the pocket
    });

    it('balls are derived state — they never serialize into the block draft', async () => {
        const engine = await bootPool();
        const w = engine.getWorld();
        // sanity: the balls really are live adjunct entities on the table block
        expect(balls(engine).length).toBe(7);

        const blockEid = w.getEntitiesWith(['BlockComponent'])[0];
        const raw = serializeBlockToRaw(w, blockEid)!;
        const adjunctsRaw: any[] = raw[2];
        const ballGroup = adjunctsRaw.find((g) => g[0] === AdjunctType.Ball);
        expect(ballGroup, 'a7 ball rows must not persist into the block raw').toBeUndefined();
    });

    it('reconfiguring tears the old balls down (no entity leak)', async () => {
        const engine = await bootPool();
        expect(balls(engine).length).toBe(7);
        // a second configure must free the old balls via BlockSystem.destroyAdjunct
        // (mesh + instanced resources) before respawning — not pile a 2nd rack on top.
        engine.setupPool({ ...CFG });
        stepN(engine, 1);
        expect(balls(engine).length).toBe(7);
    });

    it('writes the cue entity transform each frame (mesh follows)', async () => {
        const engine = await bootPool();
        const w = engine.getWorld();
        const eid = cueEntity(engine)!;
        const before = [...w.getComponent(eid, 'TransformComponent').position];
        engine.poolShoot(0, 1);
        stepN(engine, 30);
        const after = w.getComponent(eid, 'TransformComponent').position;
        expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeGreaterThan(0.05);
    });

    // ── placeable: one armed table PER BLOCK (native-in-world-games.md #4) ────

    /** A block whose b8 game trigger declares a pool table — the real data path
     *  (BlockSystem → game.declare → PoolSystem.configure), no host setupPool. */
    function tableBlock(bedW: number) {
        return [0, 1, [[0x00b8, [[
            [5, 5, 3], [8, 8, 1.5], [0, 0, 0], 1, 0,
            [{
                type: 'in', oneTime: false,
                actions: [{
                    type: 'player', method: 'enterGame',
                    params: [{ exitPolicy: 'confirm', game: { kind: 'pool', origin: [8, 8], bedW, bedD: 4, bedSurfaceZ: 0.95, ballR: 0.12, pocketR: 0.22, friction: 0.55 } }],
                }],
            }],
        ]]]], [], 1];
    }

    function movePlayerTo(engine: any, bx: number, by: number) {
        const w = engine.getWorld();
        const eid = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
        const t = w.getComponent(eid, 'TransformComponent');
        const e = w.metrics.septopusToEngine([8, 8, 2], [bx, by]);
        t.position[0] = e[0]; t.position[1] = e[1]; t.position[2] = e[2];
        t.dirty = true;
    }

    function tableOf(engine: any) {
        const w = engine.getWorld();
        const eid = w.getEntitiesWith(['PoolTableComponent'])[0];
        return eid != null ? w.getComponent(eid, 'PoolTableComponent') : null;
    }

    it('is placeable: two blocks of table data arm two independent tables, with no host call', async () => {
        const engine = await makeHeadlessEngine();
        engine.injectBlock({ x: 2048, y: 2048, world: 'main', elevation: 0, adjuncts: tableBlock(7) } as any);
        engine.injectBlock({ x: 2049, y: 2048, world: 'main', elevation: 0, adjuncts: tableBlock(3) } as any);
        stepN(engine, 4);   // block init → game.declare → BOTH tables arm themselves

        // The east block declared last. With one `config` field it overwrote the
        // west one, and the west table then went silently dead: you walked up, the
        // zone opened, you entered Game — and nothing racked.
        movePlayerTo(engine, 2048, 2048);
        engine.setMode(SystemMode.Game, { force: true });
        stepN(engine, 2);
        expect(tableOf(engine)?.block, 'the west table racked').toEqual([2048, 2048]);
        expect(tableOf(engine)?.bedW, 'with its own bed size').toBe(7);

        engine.setMode(SystemMode.Normal, { force: true });
        stepN(engine, 2);
        expect(tableOf(engine), 'leaving clears the table').toBeNull();

        movePlayerTo(engine, 2049, 2048);
        engine.setMode(SystemMode.Game, { force: true });
        stepN(engine, 2);
        expect(tableOf(engine)?.block, 'and the east one is its own table').toEqual([2049, 2048]);
        expect(tableOf(engine)?.bedW).toBe(3);
    });

    it('an identical re-arm does not re-rack a table mid-shot', async () => {
        const engine = await bootPool();
        const racked = balls(engine)[0].x;
        engine.poolShoot(0, 1);                 // strike east
        stepN(engine, 20);
        const moved = balls(engine)[0].x;
        expect(Math.abs(moved - racked), 'the cue is under way').toBeGreaterThan(0.5);

        // A block re-load re-emits the SAME declaration every time. Before the
        // guard this re-racked the table under the player mid-shot.
        engine.setupPool({ ...CFG });
        stepN(engine, 1);
        // Still rolling from where it was, not back on the spot (it keeps moving,
        // so assert "not re-racked" rather than an exact position).
        expect(balls(engine)[0].x, 'the shot survived the re-arm').toBeGreaterThan(moved - 0.01);
        expect(Math.abs(balls(engine)[0].x - racked), 'and was NOT put back on the spot').toBeGreaterThan(0.5);

        // A GENUINELY different declaration still replaces the table.
        engine.setupPool({ ...CFG, bedW: 8 });
        stepN(engine, 2);
        expect(tableOf(engine)?.bedW).toBe(8);
        expect(balls(engine)[0].x, 'fresh rack on the new bed').toBeCloseTo(8 - 8 * 0.25, 5);
    });
});
