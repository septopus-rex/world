import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { SystemMode } from '../../src/core/types/SystemMode';
import { CoasterSystem } from '../../src/core/systems/CoasterSystem';

// C2: a coaster COLLAPSED FROM SPP, ridden in Game mode. A b6 'coaster' source
// expands to c1 track pieces (visible rail); entering Game mode mounts the
// player and carries them along the path built from the same cells; reaching
// the end sets coaster_complete.

function api() {
    return {
        async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); },
        async view() { return null; },
        async module() { return {}; },
        async texture() { return {}; },
    };
}

// faces [Top,Bottom,Front,Back,Left,Right]; Open=0 Closed=1. Front+Back open = straight N.
const straightNS: Array<[number, number]> = [[1, 0], [1, 0], [0, 0], [0, 0], [1, 0], [1, 0]];

describe('coaster ride from SPP (C2)', () => {
    it('b6 coaster collapses to c1 track and is ridden in Game mode to the end', async () => {
        const { engine } = await makeHeadlessEngineWith({ api: api() });
        const world = engine.getWorld()!;

        // A 5-cell straight rail north, floating at alt ~14.
        const cells = [0, 1, 2, 3, 4].map(n => ({ position: [0, n, 0], level: 0, faces: straightNS }));
        const coaster = [[2, 2, 14], cells, 'coaster'];
        engine.injectBlock({ x: 2048, y: 2048, world: 'main', elevation: 0, adjuncts: [0, 1, [[0x00b6, [coaster]]], []] });
        stepN(engine, 6); // build + collapse

        // The SPP source collapsed into c1 track pieces (the visible rail).
        let c1 = 0, source = 0;
        for (const eid of world.getEntitiesWith(['AdjunctComponent'])) {
            const a = world.getComponent<any>(eid, 'AdjunctComponent');
            if (a?.stdData?.typeId === 0x00c1) c1++;
            if (a?.stdData?.typeId === 0x00b6 && a.stdData.theme === 'coaster') source++;
        }
        expect(source).toBe(1);
        expect(c1).toBeGreaterThanOrEqual(5); // one track piece per cell

        const cc = world.systems.findSystem(CoasterSystem)!;
        const player = world.queryEntities('TransformComponent', 'InputStateComponent')[0];
        const trans = world.getComponent<any>(player, 'TransformComponent');

        // Not riding outside Game mode.
        expect(cc.getRideState().mounted).toBe(false);

        // Enter Game mode → mount (snap to start) + build path.
        engine.setMode(SystemMode.Game);
        stepN(engine, 2);
        expect(cc.getRideState().mounted).toBe(true);
        expect(cc.getRideState().total).toBeGreaterThan(10); // ~4 segments * 4m
        const startZ = trans.position[2];

        // Ride to the end.
        stepN(engine, 200);
        expect((world.globalFlags as any).coaster_complete).toBe(true);
        expect(cc.getRideState().cartS).toBeCloseTo(cc.getRideState().total, 1);
        // The player was carried far north along the rail (engine Z = -North).
        expect(Math.abs(trans.position[2] - startZ)).toBeGreaterThan(10);

        // Leaving Game mode dismounts.
        engine.setMode(SystemMode.Normal);
        stepN(engine, 1);
        expect(cc.getRideState().mounted).toBe(false);
    });
});
