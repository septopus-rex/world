import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { SystemMode } from '../../src/core/types/SystemMode';

// full-data-migration.md P2 — data-driven native-game arming. A block's b8 game
// trigger carries the RICH declaration (enterGame params[0].game = {kind:'shooting',…});
// BlockSystem emits game.declare at block init and ShootingRangeSystem arms itself
// from the DATA — no host setupShooting() mirror call.

const A2 = 0x00a2, B8 = 0x00b8;

function shootingBlockRaw(): any[] {
    const enterRange = {
        type: 'player', method: 'enterGame', params: [{
            exitPolicy: 'ephemeral',
            game: { kind: 'shooting', origin: [8, 8], dist: 2.5, z: 1.6, targetCount: 5, targetR: 0.3, spacing: 1.3, duration: 60, litTime: 1.2 },
        }],
    };
    return [0, 1, [
        [A2, [[[8, 0.4, 3], [8, 11.5, 1.5], [0, 0, 0], 1, [1, 1], 0, 1]]],
        // Trigger volume kept clear of the [8,8] spawn (this headless test enters
        // Game explicitly via engine.setMode; the walk-in path is the e2e's job).
        [B8, [[[5, 2, 3], [8, 13, 1.5], [0, 0, 0], 1, 0, [{ type: 'in', oneTime: false, actions: [enterRange] }]]]],
    ], [], 1]; // raw[4]=1 → playable zone
}

describe('game.declare — native game armed from block DATA (P2)', () => {
    it('block data arms ShootingRangeSystem; entering Game spawns the round', async () => {
        const engine = await makeHeadlessEngine();
        const world = engine.getWorld()!;
        const seen: any[] = [];
        world.events.on('game.declare', (p: any) => seen.push(p));
        engine.injectBlock({ x: 2048, y: 2048, world: 'main', adjuncts: shootingBlockRaw(), elevation: 0 });
        stepN(engine, 10); // block inits → game.declare → System arms

        expect(seen.length, 'game.declare emitted from block data').toBe(1);
        const sys: any = world.systems.findSystemByName('ShootingRangeSystem');
        expect(sys?.config, 'System ARMED from the event (config set)').toBeTruthy();
        expect(sys.config.block).toEqual([2048, 2048]);
        expect(sys.config.targetCount).toBe(5);

        // Enter Game in the declared block (zone from raw[4]=1) → session spawns.
        expect(world.gameZoneActive, 'zone active from raw[4]').toBe(true);
        engine.setMode(SystemMode.Game);
        stepN(engine, 3); // session starts + meshes build

        const st = engine.shootingState();
        expect(st, 'shooting session armed FROM DATA (no setupShooting call)').not.toBeNull();
        expect(st!.targetCount).toBe(5);
        expect(st!.phase).toBe('running');
    });
});
