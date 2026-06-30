import { describe, it, expect, beforeAll } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { SystemMode } from '../../src/core/types/SystemMode';
import { initTumblePhysics, quatToEulerXYZ } from '../../src/core/systems/TumbleSystem';

// TumbleSystem — the first native game with a REAL rigid-body topple (rapier).
// Headless (NullRenderEngine) is the perfect place to prove the PHYSICS, GPU-free:
// the tower must STAND when built (a stable stack, not a spontaneous collapse),
// and FALL when the player pulls its support — emergent, not scripted.

function api() {
    return {
        async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); },
        async view() { return null; },
        async module() { return {}; },
        async texture() { return {}; },
    };
}

const BLOCK: [number, number] = [2048, 2048]; // default headless spawn block

async function bootTumble() {
    const { engine } = await makeHeadlessEngineWith({ api: api() });
    // game=1 → the block is a playable zone, so Game mode may be entered here.
    engine.injectBlock({ x: BLOCK[0], y: BLOCK[1], world: 'main', elevation: 0, adjuncts: [0, 1, [], [], 1] });
    stepN(engine, 6); // build the block + register the game zone
    const world = engine.getWorld()!;
    engine.setupTumble({ block: BLOCK, origin: [8, 8] }); // arm a default 15×3 tower
    expect(engine.setMode(SystemMode.Game)).toBe(true);    // zone active → entry permitted
    return { engine, world };
}

describe('TumbleSystem — rigid-body tower (rapier)', () => {
    // rapier's WASM must be initialised before any tower can spawn.
    beforeAll(async () => { await initTumblePhysics(); });

    it('quatToEulerXYZ matches THREE Euler order on known rotations', () => {
        // identity → no rotation
        expect(quatToEulerXYZ(0, 0, 0, 1).map((v) => +v.toFixed(5))).toEqual([0, 0, 0]);
        // 90° about Y (the odd-layer yaw) → ey = +π/2, ex = ez = 0
        const e = quatToEulerXYZ(0, Math.SQRT1_2, 0, Math.SQRT1_2);
        expect(+e[0].toFixed(5)).toBe(0);
        expect(+e[1].toFixed(5)).toBe(+(Math.PI / 2).toFixed(5));
        expect(+e[2].toFixed(5)).toBe(0);
    });

    it('builds a tower that STANDS (45 pieces, full height, at rest — not a spontaneous collapse)', async () => {
        const { engine } = await bootTumble();
        stepN(engine, 150); // spawn + let the stack settle

        const s = engine.tumbleState();
        expect(s.block).toEqual(BLOCK);
        expect(s.standing).toBe(45);        // 15 layers × 3
        expect(s.pulled).toBe(0);
        expect(s.toppled).toBe(false);      // it held — a STABLE stack
        expect(s.settled).toBe(true);       // and came to rest
        // Tallest piece is up near the authored top (~15 × 0.14 = 2.1m), i.e. the
        // tower did NOT slump on spawn.
        expect(s.maxY).toBeGreaterThan(1.8);
    });

    it('TOPPLES when the player pulls the bottom supports (emergent, not scripted)', async () => {
        const { engine } = await bootTumble();
        stepN(engine, 150);
        const before = engine.tumbleState();
        expect(before.toppled).toBe(false);
        const topBefore = before.maxY;

        // Pull the bottom layer down to a single EDGE block (build order is
        // layer-major: layer0 = blockId 0,1,2 at z = −,0,+). Removing 0 and 1
        // leaves only the +Z edge block, so the tower's centre of mass sits well
        // outside its lone support → it must tip over (not balance symmetrically).
        expect(engine.tumblePull(0)).toBe(true);
        expect(engine.tumblePull(1)).toBe(true);

        stepN(engine, 240); // ~4s — let it go over and settle on the ground

        const after = engine.tumbleState();
        expect(after.pulled).toBe(2);
        expect(after.standing).toBe(43);            // the pieces fell, they didn't vanish
        expect(after.toppled).toBe(true);           // the tower came down
        expect(after.maxY).toBeLessThan(topBefore - 0.5); // top dropped a long way
    });

    it('tears the session down on leaving Game mode (no orphaned pieces)', async () => {
        const { engine, world } = await bootTumble();
        stepN(engine, 60);
        expect(engine.tumbleState().standing).toBe(45);

        // Walking out of the zone reverts to Normal → the session ends.
        engine.setMode(SystemMode.Normal, { force: true });
        stepN(engine, 4);
        expect(world.getEntitiesWith(['TumbleTowerComponent']).length).toBe(0);
        expect(world.getEntitiesWith(['TumbleBlockComponent']).length).toBe(0);
        expect(engine.tumbleState().block).toBeNull();
    });
});
