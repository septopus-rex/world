import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { levelSceneProvider, AuthoredLevel } from '../../src/core/services/AuthoredLevel';
import { Coords } from '../../src/core/utils/Coords';
import parkourLevel from '../fixtures/levels/parkour.level.json';

// The multi-block parkour gameplay loop, headlessly + deterministically: a
// checkpoint (block 2048) moves the respawn point, a lethal fall returns there,
// and the finish (block 2053) sets the level-complete flag.
//
// The level is pure DATA (AuthoredLevel JSON, fixture frozen from the retired
// core/levels generator; the live copy ships with the client) — this scenario
// proves the ENGINE PRIMITIVES (levelSceneProvider + trigger/actuator/flag/
// respawn chain) run an authored level document end to end.

const level = parkourLevel as unknown as AuthoredLevel;
const provider = levelSceneProvider(level);
const FINISH_BLOCK: [number, number] = [2048, 2053];

function api() {
    return {
        async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); },
        async view() { return null; },
        async module() { return {}; },
        async texture() { return {}; },
    };
}

function player(world: any) {
    return world.queryEntities('TransformComponent', 'InputStateComponent')[0];
}

/** Teleport the player to SPP (e,n,alt) in block (bx,by). */
function tp(world: any, bx: number, by: number, e: number, n: number, alt: number) {
    const t = world.getComponent(player(world), 'TransformComponent');
    const [x, y, z] = Coords.septopusToEngine([e, n, alt], [bx, by]);
    t.position[0] = x; t.position[1] = y; t.position[2] = z; t.dirty = true;
}

describe('parkour level (authored-data document, multi-block)', () => {
    it('off-course coords are empty; authored blocks carry platforms + triggers', () => {
        expect(provider.block(2048, 2047)[2]).toEqual([]); // south of the course → empty
        expect(provider.block(2049, 2048)[2]).toEqual([]); // east of the course → empty
        const start = provider.block(2048, 2048)[2];
        expect(start.find((g: any[]) => g[0] === 0x00a2)[1].length).toBeGreaterThan(0); // platforms
        expect(start.find((g: any[]) => g[0] === 0x00b8)[1].length).toBeGreaterThan(0); // triggers
    });

    it('checkpoint sets respawn, a fall returns there, finish sets the complete flag', async () => {
        const { engine } = await makeHeadlessEngineWith({ api: api(), playerStart: level.start });
        const world = engine.getWorld()!;
        for (const [bx, by] of [[2048, 2048], FINISH_BLOCK]) {
            engine.injectBlock({ x: bx, y: by, world: 'main', elevation: 0, adjuncts: provider.block(bx, by) });
        }
        stepN(engine, 20);

        // 1. Reach the checkpoint in the start block (SPP 8,9) → respawn set.
        expect(world.respawnPoint).toBeNull();
        tp(world, 2048, 2048, 8, 9, 16);
        stepN(engine, 8);
        expect(world.respawnPoint, 'checkpoint set a respawn point').not.toBeNull();
        const cp = [...world.respawnPoint!];

        // 2. Fall into the void → lethal → respawn at the checkpoint.
        tp(world, 2048, 2048, 4, 4, 14);
        stepN(engine, 150);
        const t = world.getComponent(player(world), 'TransformComponent');
        expect(t.position[0]).toBeCloseTo(cp[0], 0);
        expect(t.position[2]).toBeCloseTo(cp[2], 0);

        // 3. Reach the finish (SPP 8,6) → level-complete flag from the document.
        expect(world.globalFlags[level.completeFlag!]).toBeUndefined();
        tp(world, FINISH_BLOCK[0], FINISH_BLOCK[1], 8, 6, 16);
        stepN(engine, 8);
        expect(world.globalFlags[level.completeFlag!]).toBe(true);
    });
});
