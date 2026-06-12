import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { TransformComponent } from '../../src/core/components/PlayerComponents';

// Housekeeping regressions:
//  - player:state must have exactly ONE emitter (CharacterController, thresholded,
//    SPP-converted). GridSystem used to ALSO spam it at 10Hz with raw engine-axis
//    rotation, dirty-writing the persisted state.
//  - World.dispose must actually unhook event subscribers (the listeners Map used
//    to pin them forever).

describe('player.state emission', () => {
    it('emits once per threshold crossing, not on a 10Hz timer', async () => {
        const engine = await makeHeadlessEngine();
        const world = engine.getWorld()!;
        stepN(engine, 30); // flush the initial boot-position emit + settle

        const events: any[] = [];
        world.events.on('player.state', (ev: any) => events.push(ev.payload));

        // Stationary player: half a second of stepping must emit NOTHING
        // (the old GridSystem emitter would have fired ~5 times here).
        stepN(engine, 30);
        expect(events.length).toBe(0);

        // Teleport past the 0.5m threshold → exactly one emit.
        const playerId = world.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
        const t = world.getComponent<TransformComponent>(playerId, 'TransformComponent')!;
        t.position[0] += 2;
        stepN(engine, 30);
        expect(events.length).toBe(1);
        expect(events[0].block).toBeDefined();
        expect(events[0].rotation).toHaveLength(3);
    });
});

describe('World.dispose', () => {
    it('clears event subscriptions', async () => {
        const engine = await makeHeadlessEngine();
        const world = engine.getWorld()!;

        let called = 0;
        world.on('post-dispose-probe', () => called++);
        world.emitSimple('post-dispose-probe', {});
        expect(called).toBe(1);

        world.dispose();
        world.emitSimple('post-dispose-probe', {});
        expect(called).toBe(1); // subscriber is gone, not pinned by the Map
    });
});
