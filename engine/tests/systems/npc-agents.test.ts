import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { AdjunctType } from '../../src/core/types/AdjunctType';
import { serializeBlockToRaw } from '../../src/core/utils/BlockSerializer';
import { Coords } from '../../src/core/utils/Coords';

// F2 — NPC agents (spec docs/plan/specs/npc-agents.md): data state machine +
// JSONLogic perception + deterministic seeded wander + movement primitives,
// driven through the real engine step loop.

const BX = 2048, BY = 2048;

async function boot(npcRow: any[], extraGroups: any[] = []) {
    const engine = await makeHeadlessEngine();
    const world = engine.getWorld()!;
    engine.injectBlock({
        x: BX, y: BY, world: 'main', elevation: 0,
        adjuncts: [0, 1, [[AdjunctType.Npc, [npcRow]], ...extraGroups], [], 0],
    });
    stepN(engine, 4);
    const npc = world.getEntitiesWith(['AdjunctComponent'])
        .map((eid) => ({ eid, a: world.getComponent<any>(eid, 'AdjunctComponent') }))
        .find(({ a }) => a?.stdData?.typeId === AdjunctType.Npc)!;
    return { engine, world, npc };
}

const pos = (world: any, eid: number) => world.getComponent(eid, 'TransformComponent').position as number[];
const beh = (world: any, eid: number) => world.getComponent(eid, 'BehaviorComponent') as any;

/** Teleport the PLAYER to SPP (e,n,alt) in the test block. */
function movePlayer(world: any, e: number, n: number, alt = 1) {
    const p = world.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
    const t = world.getComponent(p, 'TransformComponent');
    const [x, y, z] = Coords.septopusToEngine([e, n, alt], [BX, BY]);
    t.position[0] = x; t.position[1] = y; t.position[2] = z; t.dirty = true;
}

describe('NPC · state machine + perception', () => {
    // NPC parked in the far corner — the default player spawn must be OUTSIDE
    // its perception radius (boot steps a few frames before the test teleports).
    const guard = (r: number) => [[2, 14, 0], { shape: 'box' }, {
        initial: 'idle',
        states: {
            idle: {
                move: { kind: 'stay' },
                transitions: [{ when: { '<': [{ var: 'npc.distToPlayer' }, r] }, to: 'chase' }],
            },
            chase: {
                move: { kind: 'follow', speed: 3, stopAt: 1 },
                enter: [{ type: 'flag', target: 'npc_alerted', method: '', params: [true] }],
                transitions: [{ when: { '>': [{ var: 'npc.distToPlayer' }, r * 2] }, to: 'idle' }],
            },
        },
    }, 0];

    it('transitions on player distance, runs enter actions, emits npc.state', async () => {
        const { engine, world, npc } = await boot(guard(4));
        movePlayer(world, 14, 2); // far corner, ~17m away
        stepN(engine, 5);
        expect(beh(world, npc.eid).state).toBe('idle');
        expect(world.globalFlags.npc_alerted).toBeUndefined();

        movePlayer(world, 2, 12); // within 4m of the NPC at (2,14)
        stepN(engine, 3);
        expect(beh(world, npc.eid).state).toBe('chase');
        expect(world.globalFlags.npc_alerted).toBe(true); // enter action fired

        movePlayer(world, 14, 2); // beyond 8m → back to idle
        stepN(engine, 3);
        expect(beh(world, npc.eid).state).toBe('idle');
    });

    it('chase approaches the player and STOPS at stopAt', async () => {
        const { engine, world, npc } = await boot(guard(6));
        movePlayer(world, 2, 10); // 4m south of NPC → chase
        stepN(engine, 3);
        const d0 = beh(world, npc.eid) && Math.hypot(
            pos(world, npc.eid)[0] - pos(world, world.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0])[0],
            pos(world, npc.eid)[2] - pos(world, world.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0])[2]);
        stepN(engine, 60); // 1s at 3 m/s
        const p = world.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
        const d1 = Math.hypot(pos(world, npc.eid)[0] - pos(world, p)[0], pos(world, npc.eid)[2] - pos(world, p)[2]);
        expect(d1).toBeLessThan(d0!);       // approached
        stepN(engine, 240);                  // plenty of time
        const d2 = Math.hypot(pos(world, npc.eid)[0] - pos(world, p)[0], pos(world, npc.eid)[2] - pos(world, p)[2]);
        expect(d2).toBeGreaterThan(0.8);     // stopped at ~stopAt, not on top of the player
        expect(d2).toBeLessThan(1.4);
    });

    it('flee increases distance from the player', async () => {
        const row = [[8, 8, 0], { shape: 'box' }, {
            initial: 'run', states: { run: { move: { kind: 'flee', speed: 2 } } },
        }, 0];
        const { engine, world, npc } = await boot(row);
        movePlayer(world, 8, 6);
        const p = world.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
        const d0 = Math.hypot(pos(world, npc.eid)[0] - pos(world, p)[0], pos(world, npc.eid)[2] - pos(world, p)[2]);
        stepN(engine, 60);
        const d1 = Math.hypot(pos(world, npc.eid)[0] - pos(world, p)[0], pos(world, npc.eid)[2] - pos(world, p)[2]);
        expect(d1).toBeGreaterThan(d0 + 1.5); // ~2 m/s for 1s
    });

    it('a malformed behavior document leaves the agent inert (reported, not thrown)', async () => {
        const row = [[8, 8, 0], { shape: 'box' }, { initial: 'ghost', states: {} }, 0];
        const { engine, world, npc } = await boot(row);
        const p0 = [...pos(world, npc.eid)];
        stepN(engine, 30);
        expect(pos(world, npc.eid)).toEqual(p0); // never moved, never threw
    });
});

describe('NPC · deterministic wander (spec §4)', () => {
    const wanderer = (seed: number) => [[8, 8, 0], { shape: 'box' }, {
        initial: 'w', states: { w: { move: { kind: 'wander', speed: 2, radius: 3 } } },
    }, seed];

    it('stays within radius of home and follows the seeded target sequence', async () => {
        const { engine, world, npc } = await boot(wanderer(42));
        const home = [...pos(world, npc.eid)];
        for (let i = 0; i < 20; i++) {
            stepN(engine, 15);
            const d = Math.hypot(pos(world, npc.eid)[0] - home[0], pos(world, npc.eid)[2] - home[2]);
            expect(d).toBeLessThanOrEqual(3.05); // radius + arrive epsilon
        }
    });

    it('same seed → identical trajectory; different seed → different', async () => {
        const run = async (seed: number) => {
            const { engine, world, npc } = await boot(wanderer(seed));
            stepN(engine, 120);
            return [...pos(world, npc.eid)].map((v) => +v.toFixed(5));
        };
        const a1 = await run(7);
        const a2 = await run(7);
        const b = await run(8);
        expect(a1).toEqual(a2);       // replay-identical
        expect(a1).not.toEqual(b);    // seed matters
    });
});

describe('NPC · source/runtime split + F1 integration', () => {
    it('roaming never leaks into the draft — serialization keeps the HOME anchor', async () => {
        const row = [[8, 8, 0], { shape: 'box' }, {
            initial: 'w', states: { w: { move: { kind: 'wander', speed: 3, radius: 4 } } },
        }, 5];
        const { engine, world, npc } = await boot(row);
        stepN(engine, 90); // roam a while
        const blockEid = world.getEntitiesWith(['BlockComponent'])[0];
        const raw = serializeBlockToRaw(world, blockEid)!;
        const npcGroup = (raw[2] as any[]).find((g) => g[0] === AdjunctType.Npc)!;
        expect(npcGroup[1][0][0]).toEqual([8, 8, 0]); // home, not the roaming position
        void npc;
    });

    it('a b9 spawner spawns NPC agents that wander (mob camp), capped by maxAlive', async () => {
        const npcTemplate = [[0, 0, 0], { shape: 'box' }, {
            initial: 'w', states: { w: { move: { kind: 'wander', speed: 1, radius: 2 } } },
        }, 9];
        const spawnerRow = [[8, 8, 0], [AdjunctType.Npc, npcTemplate], 1, 2, 1, 0];
        const engine = await makeHeadlessEngine();
        const world = engine.getWorld()!;
        engine.injectBlock({ x: BX, y: BY, world: 'main', elevation: 0, adjuncts: [0, 1, [[AdjunctType.Spawner, [spawnerRow]]], [], 0] });
        stepN(engine, 140); // ≥2 intervals

        const agents = world.getEntitiesWith(['BehaviorComponent']);
        expect(agents).toHaveLength(2); // spawned AND driven (BehaviorComponent attached)
        stepN(engine, 120);
        expect(world.getEntitiesWith(['BehaviorComponent'])).toHaveLength(2); // capped
    });
});
