import { describe, it, expect, beforeEach } from 'vitest';
import jsonLogic from 'json-logic-js';
import { TriggerSystem } from '../../src/core/systems/TriggerSystem';
import { TriggerComponent } from '../../src/core/components/TriggerComponent';
import { TransformComponent } from '../../src/core/components/PlayerComponents';
import { WorldContext } from '../../src/core/types/Trigger';

// ---------------------------------------------------------------------------
// Minimal fake World
// ---------------------------------------------------------------------------
function makeWorld(flags: Record<string, any> = {}, time = 0.5, weather = 'clear') {
    const components = new Map<string, Map<number, any>>();
    const entities: Record<string, number[]> = {};

    const addEntity = (id: number, comps: Record<string, any>) => {
        for (const [type, data] of Object.entries(comps)) {
            if (!components.has(type)) components.set(type, new Map());
            components.get(type)!.set(id, data);
            if (!entities[type]) entities[type] = [];
            entities[type].push(id);
        }
    };

    return {
        globalFlags: flags,
        time,
        weather,
        queryEntities: (type: string) => entities[type] ?? [],
        getComponent: <T>(id: number, type: string): T | undefined =>
            components.get(type)?.get(id) as T | undefined,
        _add: addEntity,
    };
}

function makeTriggerBox(events: TriggerComponent['events']): TriggerComponent {
    return {
        shape: 'box',
        size: [4, 4, 4],
        offset: [0, 0, 0],
        events,
        entitiesInside: new Set(),
        triggeredCount: {},
        showHelper: false,
    };
}

function makeTransform(x: number, y: number, z: number): TransformComponent {
    return { position: [x, y, z], rotation: [0, 0, 0], scale: [1, 1, 1] };
}

// ---------------------------------------------------------------------------
// JSONLogic standalone sanity checks
// ---------------------------------------------------------------------------
describe('json-logic-js basics', () => {
    it('evaluates simple equality', () => {
        expect(jsonLogic.apply({ '==': [{ var: 'flags.door' }, true] }, { flags: { door: true } })).toBe(true);
        expect(jsonLogic.apply({ '==': [{ var: 'flags.door' }, true] }, { flags: { door: false } })).toBe(false);
    });

    it('evaluates and/or', () => {
        const rule = { and: [{ '>=': [{ var: 'time' }, 0.25] }, { '<': [{ var: 'time' }, 0.75] }] };
        expect(jsonLogic.apply(rule, { time: 0.5 })).toBe(true);
        expect(jsonLogic.apply(rule, { time: 0.1 })).toBe(false);
    });

    it('handles missing var as null (falsy)', () => {
        const rule = { '==': [{ var: 'flags.nonexistent' }, true] };
        expect(jsonLogic.apply(rule, { flags: {} })).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// TriggerSystem integration
// ---------------------------------------------------------------------------
describe('TriggerSystem with JSONLogic conditions', () => {
    let sys: TriggerSystem;

    beforeEach(() => { sys = new TriggerSystem(); });

    it('fires actions when no conditions set', () => {
        const log: string[] = [];
        const world = makeWorld();
        const trigger = makeTriggerBox([{
            type: 'in',
            actions: [{ type: 'system', method: 'log', target: '', params: ['entered'] }],
        }]);
        // player at (0,0,0), trigger center (0,0,0) — inside
        world._add(1, { TransformComponent: makeTransform(0, 0, 0) });
        world._add(2, {
            TriggerComponent: trigger,
            TransformComponent: makeTransform(0, 0, 0),
        });

        const origLog = console.log;
        console.log = (...args: any[]) => log.push(args.join(' '));
        sys.update(world as any, 0.016);
        console.log = origLog;

        expect(log).toContain('[TriggerSystem] entered');
        expect(trigger.entitiesInside.has(1)).toBe(true);
    });

    it('respects JSONLogic conditions — passes when flag is set', () => {
        const log: string[] = [];
        const world = makeWorld({ unlocked: true });
        const trigger = makeTriggerBox([{
            type: 'in',
            conditions: { '==': [{ var: 'flags.unlocked' }, true] },
            actions: [{ type: 'system', method: 'log', target: '', params: ['unlocked-enter'] }],
            fallbackActions: [{ type: 'system', method: 'log', target: '', params: ['locked'] }],
        }]);
        world._add(1, { TransformComponent: makeTransform(0, 0, 0) });
        world._add(2, { TriggerComponent: trigger, TransformComponent: makeTransform(0, 0, 0) });

        const origLog = console.log;
        console.log = (...args: any[]) => log.push(args.join(' '));
        sys.update(world as any, 0.016);
        console.log = origLog;

        expect(log).toContain('[TriggerSystem] unlocked-enter');
        expect(log).not.toContain('[TriggerSystem] locked');
    });

    it('fires fallbackActions when conditions fail', () => {
        const log: string[] = [];
        const world = makeWorld({ unlocked: false });
        const trigger = makeTriggerBox([{
            type: 'in',
            conditions: { '==': [{ var: 'flags.unlocked' }, true] },
            actions: [{ type: 'system', method: 'log', target: '', params: ['unlocked-enter'] }],
            fallbackActions: [{ type: 'system', method: 'log', target: '', params: ['locked'] }],
        }]);
        world._add(1, { TransformComponent: makeTransform(0, 0, 0) });
        world._add(2, { TriggerComponent: trigger, TransformComponent: makeTransform(0, 0, 0) });

        const origLog = console.log;
        console.log = (...args: any[]) => log.push(args.join(' '));
        sys.update(world as any, 0.016);
        console.log = origLog;

        expect(log).toContain('[TriggerSystem] locked');
        expect(log).not.toContain('[TriggerSystem] unlocked-enter');
    });

    it('set_flag action writes to world.globalFlags', () => {
        const world = makeWorld();
        const trigger = makeTriggerBox([{
            type: 'in',
            actions: [{ type: 'flag', method: '', target: 'door_open', params: [true] }],
        }]);
        world._add(1, { TransformComponent: makeTransform(0, 0, 0) });
        world._add(2, { TriggerComponent: trigger, TransformComponent: makeTransform(0, 0, 0) });

        sys.update(world as any, 0.016);

        expect(world.globalFlags['door_open']).toBe(true);
    });

    it('chained flags: first trigger sets flag, second reads it', () => {
        const world = makeWorld();

        // Trigger 1: on enter sets door_open = true
        const t1 = makeTriggerBox([{
            type: 'in',
            actions: [{ type: 'flag', method: '', target: 'door_open', params: [true] }],
        }]);
        // Trigger 2: on enter fires log only if door_open is true
        const t2 = makeTriggerBox([{
            type: 'in',
            conditions: { '==': [{ var: 'flags.door_open' }, true] },
            actions: [{ type: 'system', method: 'log', target: '', params: ['door was open'] }],
            fallbackActions: [{ type: 'system', method: 'log', target: '', params: ['door closed'] }],
        }]);

        world._add(1, { TransformComponent: makeTransform(0, 0, 0) });
        world._add(2, { TriggerComponent: t1, TransformComponent: makeTransform(0, 0, 0) });
        world._add(3, { TriggerComponent: t2, TransformComponent: makeTransform(0, 0, 0) });

        const log: string[] = [];
        const origLog = console.log;
        console.log = (...args: any[]) => log.push(args.join(' '));

        // Tick 1: both triggers fire; t1 sets flag; t2 sees flag=undefined (false)
        sys.update(world as any, 0.016);
        // Tick 2: player moves out then back in (simulate by clearing inside state)
        t2.entitiesInside.clear();
        t2.triggeredCount = {};
        sys.update(world as any, 0.016);

        console.log = origLog;

        // First tick: t2 condition fails (flag not yet set when t2 evaluates)
        // Second tick: flag is set, t2 passes
        expect(log.filter(l => l.includes('door was open')).length).toBeGreaterThan(0);
    });

    it('oneTime flag prevents re-firing', () => {
        const world = makeWorld();
        const trigger = makeTriggerBox([{
            type: 'in',
            actions: [{ type: 'flag', method: '', target: 'count', params: [1] }],
            oneTime: true,
        }]);
        world._add(1, { TransformComponent: makeTransform(0, 0, 0) });
        world._add(2, { TriggerComponent: trigger, TransformComponent: makeTransform(0, 0, 0) });

        sys.update(world as any, 0.016);
        // Simulate exit + re-enter
        trigger.entitiesInside.clear();
        sys.update(world as any, 0.016); // 'out' fires (different type, not blocked)
        trigger.entitiesInside.clear();
        sys.update(world as any, 0.016); // 'in' should NOT fire again

        // The flag was set once; second 'in' is blocked by oneTime
        expect(world.globalFlags['count']).toBe(1);
        expect(trigger.triggeredCount['in']).toBe(1);
    });

    it('player outside the box does not trigger', () => {
        const world = makeWorld();
        const trigger = makeTriggerBox([{
            type: 'in',
            actions: [{ type: 'flag', method: '', target: 'hit', params: [true] }],
        }]);
        // player at (10,0,0), trigger box size 4 centered at (0,0,0) — no overlap
        world._add(1, { TransformComponent: makeTransform(10, 0, 0) });
        world._add(2, { TriggerComponent: trigger, TransformComponent: makeTransform(0, 0, 0) });

        sys.update(world as any, 0.016);

        expect(world.globalFlags['hit']).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// WorldContext variable path coverage
// ---------------------------------------------------------------------------
describe('WorldContext paths', () => {
    it('player.x/y/z are accessible via var', () => {
        const ctx: WorldContext = {
            player: { position: [5, 1, 3], x: 5, y: 1, z: 3 },
            flags: {},
            time: 0.3,
            weather: 'rain',
        };
        expect(jsonLogic.apply({ '>': [{ var: 'player.x' }, 4] }, ctx as any)).toBe(true);
        expect(jsonLogic.apply({ '==': [{ var: 'weather' }, 'rain'] }, ctx as any)).toBe(true);
        expect(jsonLogic.apply({ '<': [{ var: 'time' }, 0.5] }, ctx as any)).toBe(true);
    });
});
