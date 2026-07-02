import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { AdjunctType } from '../../src/core/types/AdjunctType';
import { SystemMode } from '../../src/core/types/SystemMode';
import { serializeBlockToRaw } from '../../src/core/utils/BlockSerializer';

// F1 — scheduler & spawn (spec docs/plan/specs/scheduler-and-spawn.md §4):
// actuator delay/spawn/despawn + b9 spawner lifecycle, all on SIMULATION time
// through the real engine step loop.

const BX = 2048, BY = 2048;

/** Boot + inject one block whose raw carries the given adjunct groups. */
async function boot(groups: any[]) {
    const engine = await makeHeadlessEngine();
    const world = engine.getWorld()!;
    engine.injectBlock({ x: BX, y: BY, world: 'main', adjuncts: [0, 1, groups, [], 0], elevation: 0 });
    stepN(engine, 4);
    const blockEid = world.getEntitiesWith(['BlockComponent'])
        .find((eid) => { const b: any = world.getComponent(eid, 'BlockComponent'); return b?.x === BX && b?.y === BY; })!;
    return { engine, world, blockEid };
}

function adjuncts(world: any, pred: (a: any) => boolean) {
    return world.getEntitiesWith(['AdjunctComponent'])
        .map((eid: number) => ({ eid, a: world.getComponent(eid, 'AdjunctComponent') }))
        .filter(({ a }: any) => a && pred(a));
}
function findByIdIncludes(world: any, frag: string) {
    return adjuncts(world, (a) => String(a.adjunctId).includes(frag))[0] ?? null;
}

const triggerRow = [[2, 2, 2], [8, 8, 1], [0, 0, 0], 1, 0, []];
const boxTemplateRel = [[0.5, 0.5, 0.5], [1, 0, 1], [0, 0, 0], 2, [1, 1], 0, 0]; // +1E +1Alt of anchor

describe('actuator · delay', () => {
    it('nested actions fire params[0] sim-seconds later, deterministically', async () => {
        const { engine, world } = await boot([[AdjunctType.Trigger, [triggerRow]]]);
        world.actuator.execute(
            { type: 'delay', target: '', method: '', params: [0.5], actions: [
                { type: 'flag', target: 'delayed_flag', method: '', params: [true] },
            ] },
            { world, playerId: null, mode: world.mode },
        );
        stepN(engine, 20); // ~0.33s — not yet
        expect(world.globalFlags.delayed_flag).toBeUndefined();
        stepN(engine, 15); // past 0.5s
        expect(world.globalFlags.delayed_flag).toBe(true);
    });

    it('a delayed Game-only action re-checks mode AT FIRE TIME (no smuggling)', async () => {
        const { engine, world } = await boot([[AdjunctType.Trigger, [triggerRow]]]);
        const player = world.getEntitiesWith(['InventoryComponent', 'InputStateComponent'])[0];
        // Scheduled while in Game mode…
        world.setMode(SystemMode.Game, true);
        world.actuator.execute(
            { type: 'delay', target: '', method: '', params: [0.2], actions: [
                { type: 'bag', target: 'tpl_2', method: 'give', params: [1] },
            ] },
            { world, playerId: player, mode: world.mode },
        );
        // …but the mode exits before it fires.
        world.setMode(SystemMode.Normal, true);
        stepN(engine, 30);
        const inv: any = world.getComponent(player, 'InventoryComponent');
        expect(inv.items.find((i: any) => i.id === 'tpl_2')).toBeUndefined(); // refused at fire time
    });
});

describe('actuator · spawn / despawn', () => {
    it('spawn lands relative to the firing adjunct, derivedFrom-tagged, fully assembled', async () => {
        const { engine, world } = await boot([[AdjunctType.Trigger, [triggerRow]]]);
        const src = findByIdIncludes(world, '_184_0')!;
        world.actuator.execute(
            { type: 'spawn', target: '', method: '', params: [AdjunctType.Box, boxTemplateRel] },
            { world, playerId: null, mode: world.mode, sourceEntity: src.eid },
        );
        stepN(engine, 3);

        const spawned = adjuncts(world, (a) => a.stdData?.derivedFrom === src.a.adjunctId);
        expect(spawned).toHaveLength(1);
        const std = spawned[0].a.stdData;
        expect([std.ox, std.oy, std.oz]).toEqual([9, 8, 2]); // anchor(8,8,1) + rel(1,0,1)
        expect(world.getComponent(spawned[0].eid, 'TransformComponent')).toBeTruthy();
        expect(world.getComponent(spawned[0].eid, 'SolidComponent')).toBeTruthy(); // standard assembly
    });

    it('despawn removes a runtime entity; authored content is REFUSED', async () => {
        const { engine, world, blockEid } = await boot([[AdjunctType.Trigger, [triggerRow]]]);
        const src = findByIdIncludes(world, '_184_0')!;
        world.actuator.execute(
            { type: 'spawn', target: '', method: '', params: [AdjunctType.Box, boxTemplateRel] },
            { world, playerId: null, mode: world.mode, sourceEntity: src.eid },
        );
        stepN(engine, 2);
        const spawned = adjuncts(world, (a) => a.stdData?.derivedFrom === src.a.adjunctId)[0];

        // Despawn the runtime entity → gone.
        world.actuator.execute(
            { type: 'despawn', target: spawned.a.adjunctId, method: '', params: [] },
            { world, playerId: null, mode: world.mode },
        );
        expect(world.getComponent(spawned.eid, 'AdjunctComponent')).toBeFalsy();

        // Despawning AUTHORED content is refused (would drop it from the draft).
        world.actuator.execute(
            { type: 'despawn', target: src.a.adjunctId, method: '', params: [] },
            { world, playerId: null, mode: world.mode },
        );
        expect(world.getComponent(src.eid, 'AdjunctComponent')).toBeTruthy();
        void blockEid;
    });
});

describe('b9 spawner · lifecycle', () => {
    const spawnerRow = [[8, 8, 0], [AdjunctType.Box, boxTemplateRel], 1, 2, 1, 0]; // 1s interval, maxAlive 2

    it('spawns on interval, caps at maxAlive, never bakes into the draft', async () => {
        const { engine, world, blockEid } = await boot([[AdjunctType.Spawner, [spawnerRow]]]);
        const spawner = findByIdIncludes(world, '_185_0')!;
        const mine = () => adjuncts(world, (a) => a.stdData?.derivedFrom === spawner.a.adjunctId).length;

        expect(mine()).toBe(0);
        stepN(engine, 70);   // ~1.17s → 1 spawn
        expect(mine()).toBe(1);
        stepN(engine, 60);   // ~2.17s → 2 spawns (cap)
        expect(mine()).toBe(2);
        stepN(engine, 180);  // way past more intervals — capped
        expect(mine()).toBe(2);

        // Draft serialization keeps ONLY the authored spawner row (derived skipped).
        const raw = serializeBlockToRaw(world, blockEid)!;
        const groups: any[] = raw[2];
        expect(groups).toHaveLength(1);
        expect(groups[0][0]).toBe(AdjunctType.Spawner);
        expect(groups[0][1]).toHaveLength(1);
    });

    it('despawned spawnlings are refilled on the next interval', async () => {
        const { engine, world } = await boot([[AdjunctType.Spawner, [spawnerRow]]]);
        const spawner = findByIdIncludes(world, '_185_0')!;
        stepN(engine, 130); // 2 alive (cap)
        const first = adjuncts(world, (a) => a.stdData?.derivedFrom === spawner.a.adjunctId)[0];
        world.actuator.execute({ type: 'despawn', target: first.a.adjunctId, method: '', params: [] },
            { world, playerId: null, mode: world.mode });
        stepN(engine, 70);  // next interval refills
        expect(adjuncts(world, (a) => a.stdData?.derivedFrom === spawner.a.adjunctId)).toHaveLength(2);
    });

    it('block eviction kills spawnlings + disarms; re-injection re-arms fresh (nothing persisted)', async () => {
        const { engine, world } = await boot([[AdjunctType.Spawner, [spawnerRow]]]);
        stepN(engine, 70);
        expect(adjuncts(world, (a) => !!a.stdData?.derivedFrom)).toHaveLength(1);

        engine.removeBlock(BX, BY);
        stepN(engine, 2);
        expect(adjuncts(world, () => true)).toHaveLength(0);       // everything died with the block
        expect(world.scheduler.pending).toBe(0);                     // task disarmed

        // Re-entry: fresh arm, fresh timer, spawns again.
        engine.injectBlock({ x: BX, y: BY, world: 'main', adjuncts: [0, 1, [[AdjunctType.Spawner, [spawnerRow]]], [], 0], elevation: 0 });
        stepN(engine, 80);
        expect(adjuncts(world, (a) => !!a.stdData?.derivedFrom)).toHaveLength(1);
    });
});
