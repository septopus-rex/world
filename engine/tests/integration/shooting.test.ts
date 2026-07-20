import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { serializeBlockToRaw } from '../../src/core/utils/BlockSerializer';
import { AdjunctType } from '../../src/core/types/AdjunctType';
import { SystemMode } from '../../src/core/types/SystemMode';

// L3 — the in-world 3D shooting range (ShootingRangeSystem): the SHOT-and-REACT
// native case after pool (continuous physics) + mahjong (discrete turn-based).
// Its reason to exist is RUNTIME RECOLOUR — a hit flips the SAME target red in
// place via the appearance-override channel (no destroy+respawn), then it rearms.
// Firing is deterministic via shootingFire (the camera raycast is e2e-only, since
// castRayFromCamera returns null with no GPU). Mirrors pool/mahjong in shape.

const CFG = {
    block: [2048, 2048] as [number, number],
    origin: [8, 8] as [number, number],
    targetCount: 5,
    duration: 60,
    litTime: 1.0,
    upColor: 0x33cc44,
    hitColor: 0xff3322,
};

async function bootRange(extra: Partial<typeof CFG> = {}) {
    const engine = await makeHeadlessEngine(); // player defaults into block [2048,2048]
    engine.injectBlock({ x: 2048, y: 2048, world: 'main', adjuncts: [], elevation: 0 } as any);
    stepN(engine, 3);
    engine.setupShooting({ ...CFG, ...extra });        // arm the range
    engine.setMode(SystemMode.Game, { force: true });   // enter Game in this block → targets spawn
    stepN(engine, 2);                                   // session starts (1) + meshes build (2)
    return engine;
}

function targetEid(engine: any, targetId: number) {
    const w = engine.getWorld();
    for (const eid of w.getEntitiesWith(['ShootingTargetComponent'])) {
        if (w.getComponent(eid, 'ShootingTargetComponent').targetId === targetId) return eid;
    }
    return null;
}

describe('3D shooting range (ShootingRangeSystem)', () => {
    it('spawns a row of live (green) sphere targets and a fresh scoreboard', async () => {
        const engine = await bootRange();
        const st = engine.shootingState();
        expect(st.targetCount).toBe(5);
        expect(st.targets.length).toBe(5);
        expect(st.targets.every((t: any) => t.state === 'up')).toBe(true);
        expect(st.phase).toBe('running');
        expect([st.score, st.shots, st.hits]).toEqual([0, 0, 0]);

        // the targets are real a7 sphere adjunct entities on the felt
        const w = engine.getWorld();
        const spheres = w.getEntitiesWith(['ShootingTargetComponent', 'TransformComponent']);
        expect(spheres.length).toBe(5);
    });

    it('is zone-gated: no targets until the player enters Game mode here', async () => {
        const engine = await makeHeadlessEngine(); // player in block [2048,2048]
        engine.injectBlock({ x: 2048, y: 2048, world: 'main', adjuncts: [], elevation: 0 } as any);
        stepN(engine, 3);
        engine.setupShooting(CFG);  // ARM only — still in Normal mode
        stepN(engine, 2);
        const w = engine.getWorld();
        expect(engine.shootingState(), 'armed but no session in Normal mode').toBeNull();
        expect(w.getEntitiesWith(['ShootingTargetComponent']).length).toBe(0);

        engine.setMode(SystemMode.Game, { force: true }); // explicit entry → session spawns
        stepN(engine, 2);
        expect(engine.shootingState()?.targetCount).toBe(5);
        expect(w.getEntitiesWith(['ShootingTargetComponent']).length).toBe(5);
    });

    it('leaving Game (zone exit) tears the session + targets down; re-entry is fresh', async () => {
        const engine = await bootRange();
        const w = engine.getWorld();
        engine.shootingFire(0); // score a point in this round
        expect(engine.shootingState().score).toBe(1);
        expect(w.getEntitiesWith(['ShootingTargetComponent']).length).toBe(5);

        engine.setMode(SystemMode.Normal); // GameZoneSystem does this on leaving the zone
        stepN(engine, 1);
        expect(engine.shootingState(), 'session gone on exit').toBeNull();
        expect(w.getEntitiesWith(['ShootingTargetComponent']).length, 'targets torn down').toBe(0);

        // Re-enter the zone → a FRESH round (score reset), config persisted on the System.
        engine.setMode(SystemMode.Game, { force: true });
        stepN(engine, 2);
        expect(engine.shootingState()?.targetCount).toBe(5);
        expect(engine.shootingState().score, 'fresh round').toBe(0);
    });

    it('a hit scores, flips the target red in place (runtime recolour), and rearms', async () => {
        const engine = await bootRange();
        const w = engine.getWorld();

        // Fire at target 2 → a hit.
        expect(engine.shootingFire(2)).toBe('hit');
        stepN(engine, 1);

        const st = engine.shootingState();
        expect([st.score, st.shots, st.hits]).toEqual([1, 1, 1]);
        expect(st.targets.find((t: any) => t.targetId === 2).state).toBe('hit');

        // RUNTIME RECOLOUR: the appearance channel pushed the hit colour onto the
        // SAME entity's mesh (no destroy/respawn) — the gap pool/mahjong dodged.
        const eid = targetEid(engine, 2);
        expect(w.getComponent(eid, 'MeshComponent').colorOverride).toBe(CFG.hitColor);

        // After the lit flash it rearms: state back to up, colour back to green.
        stepN(engine, 70); // > litTime at 60fps dt
        const st2 = engine.shootingState();
        expect(st2.targets.find((t: any) => t.targetId === 2).state).toBe('up');
        expect(w.getComponent(eid, 'MeshComponent').colorOverride).toBe(CFG.upColor);
    });

    it('a hit on an already-hit (rearming) target does not double-score', async () => {
        const engine = await bootRange();
        expect(engine.shootingFire(1)).toBe('hit');
        expect(engine.shootingFire(1)).toBe('miss'); // still red/rearming → not live
        const st = engine.shootingState();
        expect(st.hits).toBe(1);
        expect(st.shots).toBe(2); // both pulls counted as shots (accuracy)
    });

    it('a miss counts a shot but no score', async () => {
        const engine = await bootRange();
        expect(engine.shootingFire(null)).toBe('miss');
        const st = engine.shootingState();
        expect([st.score, st.shots, st.hits]).toEqual([0, 1, 0]);
    });

    it('the round ends when the timer runs out; shots are then refused', async () => {
        const engine = await bootRange({ duration: 0.2 });
        stepN(engine, 30); // 0.5s > duration → over
        expect(engine.shootingState().phase).toBe('over');
        expect(engine.shootingFire(0)).toBe('miss'); // range over → no scoring
        expect(engine.shootingState().score).toBe(0);
    });

    it('targets are derived state — they never serialize into the block draft', async () => {
        const engine = await bootRange();
        const w = engine.getWorld();
        const blockEid = w.getEntitiesWith(['BlockComponent'])[0];
        const raw = serializeBlockToRaw(w, blockEid)!;
        const adjunctsRaw = raw[2] as any[];
        expect(adjunctsRaw.find((g) => g[0] === AdjunctType.Ball)).toBeUndefined();
    });

    it('reconfiguring tears the old targets down (no entity leak)', async () => {
        const engine = await bootRange();
        const w = engine.getWorld();
        engine.setupShooting(CFG); // configure again
        stepN(engine, 1);
        const spheres = w.getEntitiesWith(['ShootingTargetComponent']);
        expect(spheres.length).toBe(5); // still exactly 5, not 10
    });

    it('lifts the interact reach gate while the round is live, and restores it after', async () => {
        // A gallery is played at RANGE. The world's 3.5 m hand-reach gate (the
        // "don't open a book across the map" rule) turned every shot into
        // interact.miss{too_far} once it landed — so a ranged session raises
        // World.interactReach for its duration and must put it back.
        const engine = await bootRange();
        const w = engine.getWorld()!;
        expect(w.interactReach, 'raised while shooting').toBe(Infinity);

        engine.setMode(SystemMode.Normal, { force: true });
        stepN(engine, 2);
        expect(w.getEntitiesWith(['ShootingTargetComponent']).length, 'round torn down').toBe(0);
        expect(w.interactReach, 'back to the world default').toBeNull();
    });

    it('is fully deterministic for a fixed firing script', async () => {
        const play = async () => {
            const engine = await bootRange();
            const script = [0, 2, 4, null, 1, 1, 3];
            for (const t of script) { engine.shootingFire(t as number | null); stepN(engine, 1); }
            return JSON.stringify(engine.shootingState());
        };
        expect(await play()).toEqual(await play());
    });
});
