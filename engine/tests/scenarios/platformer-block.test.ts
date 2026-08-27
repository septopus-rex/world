import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { registerDemoItems } from '../helpers/demo-items';
import { SystemMode } from '../../src/core/types/SystemMode';
import type { TransformComponent } from '../../src/core/components/TransformComponent';
import platformerBlock from '../../../client/core/src/blocks/platformer.block.json';

// Register item catalog
registerDemoItems();

const PLATFORMER_BLOCK: [number, number] = [2048, 2048];
const PLAYER_START = {
    block: PLATFORMER_BLOCK,
    position: [8, 2, 1.0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
};

function api() {
    return {
        async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); },
        async view() { return null; },
        async module() { return {}; },
        async texture() { return {}; },
    };
}

function player(world: any): number {
    return world.queryEntities('TransformComponent', 'InputStateComponent')[0];
}

function tp(world: any, bx: number, by: number, e: number, n: number, alt: number) {
    const t = world.getComponent(player(world), 'TransformComponent') as TransformComponent;
    const [x, y, z] = world.metrics.septopusToEngine([e, n, alt], [bx, by]);
    t.position[0] = x;
    t.position[1] = y;
    t.position[2] = z;
    t.dirty = true;
}

describe('platformer block (Type 2: 3D Platformer / 跑酷障碍赛 in-world block playthrough)', () => {
    it('block raw structure and adjunct groups', () => {
        const raw = platformerBlock as any[];
        expect(raw).toBeDefined();
        const adjuncts = raw[2];
        expect(adjuncts.find((g: any[]) => g[0] === 0x00a1)[1].length).toBeGreaterThan(0); // walls / columns
        expect(adjuncts.find((g: any[]) => g[0] === 0x00a2)[1].length).toBeGreaterThan(0); // jump platforms
        expect(adjuncts.find((g: any[]) => g[0] === 0x00b4)[1].length).toBe(1);             // 1 wedge slope stop
        expect(adjuncts.find((g: any[]) => g[0] === 0x00b8)[1].length).toBe(3);             // 3 triggers
        expect(adjuncts.find((g: any[]) => g[0] === 0x00e4)[1].length).toBe(1);             // 1 guide book
    });

    it('plays through the platformer obstacle course: jump pads -> checkpoint -> hazard fallback -> ramp -> summit', async () => {
        const { engine } = await makeHeadlessEngineWith({ api: api(), playerStart: PLAYER_START });
        const world = engine.getWorld()!;

        // Inject authored block into the world
        engine.injectBlock({
            x: PLATFORMER_BLOCK[0],
            y: PLATFORMER_BLOCK[1],
            world: 'main',
            elevation: 0,
            adjuncts: platformerBlock as any,
        });
        stepN(engine, 10);

        // Switch to Game mode for hazard damage / health system / checkpoint respawn
        world.setMode(SystemMode.Game, { force: true });
        stepN(engine, 5);

        const pEid = player(world);
        expect(pEid).toBeDefined();

        // ── Initial State ──
        expect(world.globalFlags['checkpoint_reached']).toBeUndefined();
        expect(world.globalFlags['platformer_complete']).toBeUndefined();
        expect(world.respawnPoint).toBeNull();

        // ── STEP 1: Traverse floating jump platforms ──
        // Hop to Platform 1 [8, 5.5, 1.5]
        tp(world, 2048, 2048, 8, 5.5, 2.0);
        stepN(engine, 5);

        // Hop to Platform 2 [5, 7.5, 2.5]
        tp(world, 2048, 2048, 5, 7.5, 3.0);
        stepN(engine, 5);

        // Hop to Platform 3 [3, 10, 3.5]
        tp(world, 2048, 2048, 3, 10, 4.0);
        stepN(engine, 5);

        // ── STEP 2: Reach Midway Checkpoint Platform [3, 13.5, 4.5] ──
        tp(world, 2048, 2048, 3, 13.5, 5.5);
        stepN(engine, 10);

        expect(world.globalFlags['checkpoint_reached'], 'Checkpoint flag must be set').toBe(true);
        expect(world.respawnPoint, 'Checkpoint must record a respawn point').not.toBeNull();
        const cp = [...world.respawnPoint!];

        // ── STEP 3: Fall from high platform into void -> lethal fall respawns at checkpoint ──
        tp(world, 2048, 2048, 3, 10, -15);
        stepN(engine, 50);

        const tAfterRespawn = world.getComponent(pEid, 'TransformComponent') as TransformComponent;
        expect(tAfterRespawn.position[0]).toBeCloseTo(cp[0], 0);
        expect(tAfterRespawn.position[2]).toBeCloseTo(cp[2], 0);

        // ── STEP 4: Ascend Wedge Slope Ramp to High Platform [13, 13.5, 7.5] ──
        tp(world, 2048, 2048, 8, 13.5, 6.0); // on wedge slope
        stepN(engine, 5);

        tp(world, 2048, 2048, 13, 13.5, 8.0); // landed on gold platform
        stepN(engine, 5);

        // ── STEP 5: Cross Steel Bridge [13, 8.5, 8.5] ──
        tp(world, 2048, 2048, 13, 8.5, 9.0);
        stepN(engine, 5);

        // ── STEP 6: Reach Summit Victory Platform [8, 8.5, 9.5] -> Victory! ──
        tp(world, 2048, 2048, 8, 8.5, 10.5);
        stepN(engine, 10);

        expect(world.globalFlags['platformer_complete'], 'Platformer complete flag must be true').toBe(true);
    });
});
