import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { registerDemoItems } from '../helpers/demo-items';
import { SystemMode } from '../../src/core/types/SystemMode';
import type { TransformComponent } from '../../src/core/components/TransformComponent';
import type { TriggerComponent } from '../../src/core/components/TriggerComponent';
import type { InventoryComponent } from '../../src/core/components/InventoryComponent';
import type { AdjunctComponent } from '../../src/core/components/AdjunctComponent';
import puzzleBlock from '../../../client/core/src/blocks/puzzle.block.json';

// Register item catalog (key, gem, potion) from demo.items.json
registerDemoItems();

const PUZZLE_BLOCK: [number, number] = [2048, 2048];
const PLAYER_START = {
    block: PUZZLE_BLOCK,
    position: [8, 2.5, 0.5] as [number, number, number],
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

describe('puzzle block (Escape Room / 密室逃脱 in-world block playthrough)', () => {
    it('block raw structure and adjunct groups', () => {
        const raw = puzzleBlock as any[];
        expect(raw).toBeDefined();
        const adjuncts = raw[2];
        expect(adjuncts.find((g: any[]) => g[0] === 0x00a1)[1].length).toBeGreaterThan(0); // walls / pillars
        expect(adjuncts.find((g: any[]) => g[0] === 0x00a2)[1].length).toBeGreaterThan(0); // floor / plate
        expect(adjuncts.find((g: any[]) => g[0] === 0x00b8)[1].length).toBe(4);             // 4 triggers
        expect(adjuncts.find((g: any[]) => g[0] === 0x00b5)[1].length).toBe(1);             // 1 key item
        expect(adjuncts.find((g: any[]) => g[0] === 0x00e4)[1].length).toBe(1);             // 1 clue book
    });

    it('plays through the complete puzzle in-world: clues -> pressure plate -> rune pillar -> key -> gate -> victory', async () => {
        const { engine } = await makeHeadlessEngineWith({ api: api(), playerStart: PLAYER_START });
        const world = engine.getWorld()!;

        // Inject authored block into the continuous world
        engine.injectBlock({
            x: PUZZLE_BLOCK[0],
            y: PUZZLE_BLOCK[1],
            world: 'main',
            elevation: 0,
            adjuncts: puzzleBlock as any,
        });
        stepN(engine, 10);

        // Switch to Game mode for inventory bag actions and trigger evaluation
        world.setMode(SystemMode.Game, { force: true });
        stepN(engine, 5);

        const pEid = player(world);
        expect(pEid).toBeDefined();

        // Query trigger entities and adjuncts
        const triggerEids = world.queryEntities('TriggerComponent');
        expect(triggerEids.length).toBe(4);

        // Find specific triggers by adjunctId
        let plateTrigEid: number = -1;
        let runePillarTrigEid: number = -1;
        let gateTrigEid: number = -1;
        let finishTrigEid: number = -1;
        let gateWallEid: number = -1;
        let cachePillarEid: number = -1;

        for (const eid of world.queryEntities('AdjunctComponent')) {
            const adj = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent')!;
            if (adj.adjunctId === 'adj_2048_2048_184_0') plateTrigEid = eid;
            if (adj.adjunctId === 'adj_2048_2048_184_1') runePillarTrigEid = eid;
            if (adj.adjunctId === 'adj_2048_2048_184_2') gateTrigEid = eid;
            if (adj.adjunctId === 'adj_2048_2048_184_3') finishTrigEid = eid;
            if (adj.adjunctId === 'adj_2048_2048_161_0') gateWallEid = eid;
            if (adj.adjunctId === 'adj_2048_2048_161_1') cachePillarEid = eid;
        }

        expect(plateTrigEid, 'East plate trigger materialized').toBeGreaterThanOrEqual(0);
        expect(runePillarTrigEid, 'West rune pillar trigger materialized').toBeGreaterThanOrEqual(0);
        expect(gateTrigEid, 'North gate trigger materialized').toBeGreaterThanOrEqual(0);
        expect(finishTrigEid, 'Sanctuary finish trigger materialized').toBeGreaterThanOrEqual(0);
        expect(gateWallEid, 'Gate wall materialized').toBeGreaterThanOrEqual(0);
        expect(cachePillarEid, 'Cache pillar materialized').toBeGreaterThanOrEqual(0);

        const initialGateY = (world.getComponent(gateWallEid, 'TransformComponent') as TransformComponent).position[1];

        // ── STEP 1: Attempt to open gate prematurely ──
        world.events.emit('interact.primary',
            { metadata: {}, distance: 2, point: [0, 0, 0] },
            { target: gateTrigEid, actor: pEid });
        stepN(engine, 5);

        // Gate should still be closed, no flags set
        expect(world.globalFlags['gate_unlocked']).toBeUndefined();
        const gateYAfterFail = (world.getComponent(gateWallEid, 'TransformComponent') as TransformComponent).position[1];
        expect(gateYAfterFail).toBeCloseTo(initialGateY, 0.01);

        // ── STEP 2: Step onto East Pressure Plate and hold ──
        tp(world, 2048, 2048, 13, 6, 1.0);
        // Step for > 800ms (60 frames = 1000ms at 60fps)
        stepN(engine, 60);

        expect(world.globalFlags['pressure_activated'], 'Pressure plate flag must be set').toBe(true);

        // ── STEP 3: Click West Rune Pillar to align phase ──
        world.events.emit('interact.primary',
            { metadata: {}, distance: 2, point: [0, 0, 0] },
            { target: runePillarTrigEid, actor: pEid });
        stepN(engine, 5);

        expect(world.globalFlags['pillar_aligned'], 'Pillar aligned flag must be set').toBe(true);

        // ── STEP 4: Pickup the Key item ──
        const itemEids = world.queryEntities('ItemComponent');
        expect(itemEids.length).toBe(1);
        const keyEid = itemEids[0];

        // Click key to pick up
        world.events.emit('interact.primary',
            { metadata: {}, distance: 2, point: [0, 0, 0] },
            { target: keyEid, actor: pEid });
        stepN(engine, 5);

        // Verify key is in inventory
        const inv = world.getComponent<InventoryComponent>(pEid, 'InventoryComponent')!;
        expect(inv).toBeDefined();
        const keyItem = inv.items.find(i => i.id === 'tpl_2');
        expect(keyItem, 'Key should be in player inventory').toBeDefined();
        expect(keyItem?.quantity).toBe(1);

        // ── STEP 5: Unlock the North Gate with all conditions met ──
        world.events.emit('interact.primary',
            { metadata: {}, distance: 2, point: [0, 0, 0] },
            { target: gateTrigEid, actor: pEid });
        stepN(engine, 10);

        expect(world.globalFlags['gate_unlocked'], 'Gate unlocked flag must be set').toBe(true);

        // Gate wall should have moved up (in engine coordinates Y is height)
        const gateYAfterOpen = (world.getComponent(gateWallEid, 'TransformComponent') as TransformComponent).position[1];
        expect(gateYAfterOpen).toBeGreaterThan(initialGateY + 3.0);

        // Key should have been consumed
        const keyItemAfter = inv.items.find(i => i.id === 'tpl_2');
        expect(keyItemAfter?.quantity ?? 0).toBe(0);

        // ── STEP 6: Walk through gate into Sanctuary -> Level Complete! ──
        expect(world.globalFlags['puzzle_complete']).toBeUndefined();

        // Move player to Sanctuary finish area [8, 13, 1.5]
        tp(world, 2048, 2048, 8, 13, 1.5);
        stepN(engine, 10);

        expect(world.globalFlags['puzzle_complete'], 'Puzzle complete flag must be true').toBe(true);
    });
});
