import { describe, it, expect } from 'vitest';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import { registerDemoItems } from '../helpers/demo-items';
import { SystemMode } from '../../src/core/types/SystemMode';
import type { TransformComponent } from '../../src/core/components/TransformComponent';
import type { TriggerComponent } from '../../src/core/components/TriggerComponent';
import type { InventoryComponent } from '../../src/core/components/InventoryComponent';
import type { AdjunctComponent } from '../../src/core/components/AdjunctComponent';
import type { HealthComponent } from '../../src/core/components/HealthComponent';
import dungeonBlock from '../../../client/core/src/blocks/dungeon.block.json';

// Register item catalog
registerDemoItems();

const DUNGEON_BLOCK: [number, number] = [2048, 2048];
const PLAYER_START = {
    block: DUNGEON_BLOCK,
    position: [8, 2, 0.5] as [number, number, number],
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

describe('dungeon block (Type 3: Roguelite Dungeon Crawler / 地牢探险 in-world block playthrough)', () => {
    it('block raw structure and adjunct groups', () => {
        const raw = dungeonBlock as any[];
        expect(raw).toBeDefined();
        const adjuncts = raw[2];
        expect(adjuncts.find((g: any[]) => g[0] === 0x00a1)[1].length).toBeGreaterThan(0); // walls / doors
        expect(adjuncts.find((g: any[]) => g[0] === 0x00a2)[1].length).toBeGreaterThan(0); // floor / altar / chest
        expect(adjuncts.find((g: any[]) => g[0] === 0x00ba)[1].length).toBe(2);             // 2 NPCs (Scout + Guard)
        expect(adjuncts.find((g: any[]) => g[0] === 0x00b8)[1].length).toBe(3);             // 3 triggers
        expect(adjuncts.find((g: any[]) => g[0] === 0x00e4)[1].length).toBe(1);             // 1 guide book
    });

    it('plays through the complete dungeon quest loop: scout quest -> trap hazard -> guard battle -> key loot -> unlock gate -> boss chest -> turn-in', async () => {
        const { engine } = await makeHeadlessEngineWith({ api: api(), playerStart: PLAYER_START });
        const world = engine.getWorld()!;

        // Inject authored block into the continuous world
        engine.injectBlock({
            x: DUNGEON_BLOCK[0],
            y: DUNGEON_BLOCK[1],
            world: 'main',
            elevation: 0,
            adjuncts: dungeonBlock as any,
        });
        stepN(engine, 10);

        // Switch to Game mode
        world.setMode(SystemMode.Game, { force: true });
        stepN(engine, 5);

        const pEid = player(world);
        expect(pEid).toBeDefined();

        // Query entities
        let scoutEid: number = -1;
        let guardEid: number = -1;
        let gateTrigEid: number = -1;
        let chestTrigEid: number = -1;
        let gateWallEid: number = -1;

        for (const eid of world.queryEntities('AdjunctComponent')) {
            const adj = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent')!;
            if (adj.adjunctId === 'adj_2048_2048_186_0') scoutEid = eid;
            if (adj.adjunctId === 'adj_2048_2048_186_1') guardEid = eid;
            if (adj.adjunctId === 'adj_2048_2048_184_1') gateTrigEid = eid;
            if (adj.adjunctId === 'adj_2048_2048_184_2') chestTrigEid = eid;
            if (adj.adjunctId === 'adj_2048_2048_161_6') gateWallEid = eid;
        }

        expect(scoutEid, 'Scout NPC materialized').toBeGreaterThanOrEqual(0);
        expect(guardEid, 'Guard NPC materialized').toBeGreaterThanOrEqual(0);
        expect(gateTrigEid, 'Gate trigger materialized').toBeGreaterThanOrEqual(0);
        expect(chestTrigEid, 'Chest trigger materialized').toBeGreaterThanOrEqual(0);
        expect(gateWallEid, 'Gate wall materialized').toBeGreaterThanOrEqual(0);

        // ── STEP 1: Talk to Scout NPC & Accept Quest ──
        expect(world.globalFlags['dungeon_quest_accepted']).toBeUndefined();
        tp(world, 2048, 2048, 9, 3, 0.5);
        world.events.emit('interact.primary', { metadata: {}, distance: 1.5, point: [0, 0, 0] }, { target: scoutEid, actor: pEid });
        stepN(engine, 5);

        // Dialogue opened
        expect((world as any).activeDialogue, 'Dialogue active').toBeDefined();
        // Select option 0: "我这就去击败守卫，夺回暗影钥匙！"
        (world as any).chooseDialogue(0);
        stepN(engine, 5);

        expect(world.globalFlags['dungeon_quest_accepted'], 'Quest accepted flag set').toBe(true);

        // ── STEP 2: Walk into West Wing Spike Trap -> Health reduced by 20 ──
        const health = world.getComponent<HealthComponent>(pEid, 'HealthComponent')!;
        expect(health.hp).toBe(100);

        tp(world, 2048, 2048, 3.5, 7, 0.5);
        stepN(engine, 10);

        expect(health.hp, 'Player took spike damage').toBe(80);

        // ── STEP 3: Battle Skeletal Guard NPC ──
        expect(world.globalFlags['guard_defeated']).toBeUndefined();
        tp(world, 2048, 2048, 3.5, 10.5, 0.5);
        world.events.emit('interact.primary', { metadata: {}, distance: 1.5, point: [0, 0, 0] }, { target: guardEid, actor: pEid });
        stepN(engine, 5);

        expect((world as any).activeDialogue, 'Guard dialogue active').toBeDefined();
        // Choose option 0: "【拔剑斩击】休得猖狂，看剑！"
        (world as any).chooseDialogue(0);
        stepN(engine, 10);

        expect(world.globalFlags['guard_defeated'], 'Guard defeated flag set').toBe(true);

        // ── STEP 4: Pick up dropped Shadow Key item ──
        const itemEids = world.queryEntities('ItemComponent');
        expect(itemEids.length).toBe(1);
        const keyEid = itemEids[0];

        world.events.emit('interact.primary', { metadata: {}, distance: 1.5, point: [0, 0, 0] }, { target: keyEid, actor: pEid });
        stepN(engine, 5);

        const inv = world.getComponent<InventoryComponent>(pEid, 'InventoryComponent')!;
        const keyItem = inv.items.find(i => i.id === 'tpl_2');
        expect(keyItem?.quantity).toBe(1);

        // ── STEP 5: Unlock North Gate ──
        const initialGateY = (world.getComponent(gateWallEid, 'TransformComponent') as TransformComponent).position[1];
        tp(world, 2048, 2048, 8.5, 8.5, 0.5);
        world.events.emit('interact.primary', { metadata: {}, distance: 1.5, point: [0, 0, 0] }, { target: gateTrigEid, actor: pEid });
        stepN(engine, 10);

        expect(world.globalFlags['gate_unlocked'], 'Gate unlocked flag set').toBe(true);
        const gateYAfterOpen = (world.getComponent(gateWallEid, 'TransformComponent') as TransformComponent).position[1];
        expect(gateYAfterOpen).toBeGreaterThan(initialGateY + 3.0);

        // ── STEP 6: Open Treasure Chest in Sanctum ──
        expect(world.globalFlags['dungeon_complete']).toBeUndefined();
        tp(world, 2048, 2048, 8.5, 12.5, 0.5);
        world.events.emit('interact.primary', { metadata: {}, distance: 1.5, point: [0, 0, 0] }, { target: chestTrigEid, actor: pEid });
        stepN(engine, 10);

        expect(world.globalFlags['dungeon_complete'], 'Dungeon complete flag set').toBe(true);
        const dragonGem = inv.items.find(i => i.id === 'tpl_3');
        expect(dragonGem?.quantity, 'Received Dragon Crystal gem').toBe(1);

        // ── STEP 7: Turn in Quest to Scout NPC ──
        expect(world.globalFlags['dungeon_quest_reward']).toBeUndefined();
        tp(world, 2048, 2048, 9, 3, 0.5);
        world.events.emit('interact.primary', { metadata: {}, distance: 1.5, point: [0, 0, 0] }, { target: scoutEid, actor: pEid });
        stepN(engine, 5);

        // Select option 0 (visible because dungeon_complete is true): "我已战胜守卫并开启了宝箱！"
        (world as any).chooseDialogue(0);
        stepN(engine, 5);

        expect(world.globalFlags['dungeon_quest_reward'], 'Quest turned in and reward received').toBe(true);
    });
});
