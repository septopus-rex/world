import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { SystemMode } from '../../src/core/types/SystemMode';
import { TransformComponent } from '../../src/core/components/PlayerComponents';
import { TriggerComponent } from '../../src/core/components/TriggerComponent';

// L3 — trigger FULL pipeline: raw b8 rows → TriggerAttribute.deserialize →
// BlockSystem → AdjunctFactory (stdToRenderData → triggerVolume) →
// AdjunctSystem.registerTriggers → TriggerSystem evaluation.
//
// This intentionally does NOT hand-build TriggerComponents (the unit suite does
// that); the point is that authored JSONLogic events survive the real data path.

/** Raw b8 row: [size, offset, rotation, shape, gameOnly, events] */
function triggerRow(events: any[], opts: { gameOnly?: number; size?: number[]; offset?: number[] } = {}) {
    return [
        opts.size ?? [4, 4, 4],
        opts.offset ?? [8, 11, 1],
        [0, 0, 0],
        1,                       // box
        opts.gameOnly ?? 0,
        events,
    ];
}

async function bootWithTriggers(rows: any[]) {
    const engine = await makeHeadlessEngine();
    engine.injectBlock({
        x: 2048, y: 2048, world: 'main', elevation: 0,
        adjuncts: [0, 1, [[0x00b8, rows]], []],
    });
    stepN(engine, 5); // materialize block + adjuncts (frame-split budgets)
    const world = engine.getWorld()!;
    return { engine, world };
}

function triggerEntities(world: any): number[] {
    return world.queryEntities('TriggerComponent');
}

function playerEid(world: any): number {
    return world.queryEntities('TransformComponent', 'InputStateComponent')[0];
}

/** Teleport the player to (or away from) a trigger's center. */
function placePlayer(world: any, triggerEid: number, inside: boolean) {
    const trig = world.getComponent(triggerEid, 'TransformComponent') as TransformComponent;
    const player = world.getComponent(playerEid(world), 'TransformComponent') as TransformComponent;
    player.position[0] = trig.position[0] + (inside ? 0 : 100);
    player.position[1] = trig.position[1];
    player.position[2] = trig.position[2];
}

describe('trigger full pipeline (raw → TriggerSystem)', () => {
    it('authored events survive deserialization and component registration', async () => {
        const events = [
            { type: 'in', actions: [{ type: 'flag', method: '', target: 'gate', params: [true] }] },
            { type: 'hold', holdDuration: 1000, actions: [{ type: 'flag', method: '', target: 'held', params: [true] }] },
        ];
        const { world } = await bootWithTriggers([triggerRow(events)]);

        const eids = triggerEntities(world);
        expect(eids.length).toBe(1);
        const comp = world.getComponent<TriggerComponent>(eids[0], 'TriggerComponent')!;
        // The regression this guards: registerTriggers used to re-derive events
        // from a stale format, silently replacing them with [{type:'hold',actions:[]}].
        expect(comp.events).toHaveLength(2);
        expect(comp.events[0].type).toBe('in');
        expect(comp.events[0].actions[0].target).toBe('gate');
        expect(comp.events[1].holdDuration).toBe(1000);
        expect(comp.gameOnly).toBe(false);
    });

    it('in / out fire on volume edges through the real pipeline', async () => {
        const events = [
            { type: 'in', actions: [{ type: 'flag', method: '', target: 'inside', params: [true] }] },
            { type: 'out', actions: [{ type: 'flag', method: '', target: 'inside', params: [false] }] },
        ];
        const { engine, world } = await bootWithTriggers([triggerRow(events)]);
        const eid = triggerEntities(world)[0];

        placePlayer(world, eid, true);
        stepN(engine, 2);
        expect(world.globalFlags['inside']).toBe(true);

        placePlayer(world, eid, false);
        stepN(engine, 2);
        expect(world.globalFlags['inside']).toBe(false);
    });

    it('hold fires once after holdDuration ms of stepped time, re-arms on exit', async () => {
        const events = [
            { type: 'hold', holdDuration: 500, actions: [{ type: 'flag', method: '', target: 'held', params: [true] }] },
        ];
        const { engine, world } = await bootWithTriggers([triggerRow(events)]);
        const eid = triggerEntities(world)[0];
        const comp = world.getComponent<TriggerComponent>(eid, 'TriggerComponent')!;

        placePlayer(world, eid, true);
        stepN(engine, 10); // ~150ms inside — below threshold
        expect(world.globalFlags['held']).toBeUndefined();

        stepN(engine, 30); // ~650ms total — crossed 500ms
        expect(world.globalFlags['held']).toBe(true);
        expect(comp.triggeredCount['hold#0']).toBe(1);

        stepN(engine, 60); // stays inside — must NOT refire (once per stay)
        expect(comp.triggeredCount['hold#0']).toBe(1);

        // Exit + re-enter re-arms the hold
        placePlayer(world, eid, false);
        stepN(engine, 2);
        placePlayer(world, eid, true);
        stepN(engine, 40); // > 500ms again
        expect(comp.triggeredCount['hold#0']).toBe(2);
    });

    it('touch routes a raycast interact hit to the trigger', async () => {
        const events = [
            { type: 'touch', actions: [{ type: 'flag', method: '', target: 'touched', params: [true] }] },
        ];
        const { engine, world } = await bootWithTriggers([triggerRow(events)]);
        const eid = triggerEntities(world)[0];

        stepN(engine, 1); // let TriggerSystem build its interact reader
        // What RaycastInteractionSystem emits on a primary-click hit (PR-2):
        world.events.emit('interact.primary',
            { metadata: {}, distance: 3, point: [0, 0, 0] },
            { target: eid, actor: playerEid(world) });
        stepN(engine, 1);
        expect(world.globalFlags['touched']).toBe(true);
    });

    it('oneTime consumes only on a passing run; fallback stays re-tryable', async () => {
        const events = [{
            type: 'in',
            oneTime: true,
            conditions: { '==': [{ var: 'flags.unlocked' }, true] },
            actions: [{ type: 'flag', method: '', target: 'opened', params: [true] }],
            fallbackActions: [{ type: 'flag', method: '', target: 'denied', params: [true] }],
        }];
        const { engine, world } = await bootWithTriggers([triggerRow(events)]);
        const eid = triggerEntities(world)[0];
        const comp = world.getComponent<TriggerComponent>(eid, 'TriggerComponent')!;

        // Locked: enter → fallback fires, oneTime NOT consumed
        placePlayer(world, eid, true);
        stepN(engine, 2);
        expect(world.globalFlags['denied']).toBe(true);
        expect(world.globalFlags['opened']).toBeUndefined();
        expect(comp.triggeredCount['in#0'] ?? 0).toBe(0);

        // Unlock, re-enter → passes and consumes
        world.globalFlags['unlocked'] = true;
        placePlayer(world, eid, false); stepN(engine, 2);
        placePlayer(world, eid, true); stepN(engine, 2);
        expect(world.globalFlags['opened']).toBe(true);
        expect(comp.triggeredCount['in#0']).toBe(1);

        // Third entry: consumed — actions must not run again
        world.globalFlags['opened'] = 'stale';
        placePlayer(world, eid, false); stepN(engine, 2);
        placePlayer(world, eid, true); stepN(engine, 2);
        expect(world.globalFlags['opened']).toBe('stale');
    });

    it('gameOnly volumes are inert outside Game mode', async () => {
        const events = [
            { type: 'in', actions: [{ type: 'flag', method: '', target: 'game_gate', params: [true] }] },
        ];
        const { engine, world } = await bootWithTriggers([triggerRow(events, { gameOnly: 1 })]);
        const eid = triggerEntities(world)[0];

        placePlayer(world, eid, true);
        stepN(engine, 3);
        expect(world.globalFlags['game_gate']).toBeUndefined(); // Normal mode: inert

        world.setMode(SystemMode.Game, { force: true }); // testing trigger gating, not zone entry
        stepN(engine, 3);
        expect(world.globalFlags['game_gate']).toBe(true);
    });

    it('Edit mode disables all triggers; leaving Edit re-enables them', async () => {
        const events = [
            { type: 'in', actions: [{ type: 'flag', method: '', target: 'fired', params: [true] }] },
        ];
        const { engine, world } = await bootWithTriggers([triggerRow(events)]);
        const eid = triggerEntities(world)[0];

        world.setEditMode(true);
        placePlayer(world, eid, true);
        stepN(engine, 3);
        expect(world.globalFlags['fired']).toBeUndefined();

        world.setEditMode(false);
        stepN(engine, 2); // entry edge detected once the system resumes
        expect(world.globalFlags['fired']).toBe(true);
    });

    it('legacy flat-array slot 5 still deserializes to a basic in event', async () => {
        // Old serialized form: slot 5 is a plain action array (no {type} nodes)
        const legacyRow = [
            [4, 4, 4], [8, 11, 1], [0, 0, 0], 1, 0,
            [{ type: 'flag', method: '', target: 'legacy', params: [true] }],
        ];
        const { engine, world } = await bootWithTriggers([legacyRow]);
        const eid = triggerEntities(world)[0];
        const comp = world.getComponent<TriggerComponent>(eid, 'TriggerComponent')!;
        expect(comp.events).toHaveLength(1);
        expect(comp.events[0].type).toBe('in');

        placePlayer(world, eid, true);
        stepN(engine, 2);
        expect(world.globalFlags['legacy']).toBe(true);
    });
});
