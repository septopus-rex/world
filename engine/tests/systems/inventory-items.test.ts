import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, makeHeadlessEngineWith, stepN } from '../helpers/make-world';
import { InMemoryDraftBackend } from '../../src/core/services/DraftStore';
import { MockWorldNormal } from '../../src/core/mocks/WorldConfigs';
import {
    deriveItemAttributes, getItemTemplate, itemIdFor, mulberry32,
} from '../../src/core/services/ItemRegistry';
import { ItemAttribute } from '../../src/plugins/adjunct/adjunct_item';
import { SystemMode } from '../../src/core/types/SystemMode';

// L3 — local-first inventory (P0–P2): bag.max wiring, b5 item pipeline,
// atomic pickup/drop (world ⇄ bag with draft persistence), JSONLogic
// inventory.* conditions, bag actions via LocalActuator, IDB-style meta
// persistence. Spec: docs/plan/specs/inventory-local-first.md.

/** Raw b5 row: [pos, templateId, seed, count, rot] */
function itemRow(pos: number[], templateId: number, seed = 0, count = 1) {
    return [pos, templateId, seed, count, [0, 0, 0]];
}

async function bootWith(adjunctsRaw: any[], extra: { draftBackend?: any } = {}) {
    const api = new (class {
        async world() { return JSON.parse(JSON.stringify(MockWorldNormal)); }
        async view() { return null; }
        async module() { return {}; }
        async texture() { return {}; }
    })();
    const { engine } = await makeHeadlessEngineWith({
        api, draftBackend: extra.draftBackend ?? new InMemoryDraftBackend(),
    });
    engine.injectBlock({
        x: 2048, y: 2048, world: 'main', elevation: 0,
        adjuncts: [0, 1, adjunctsRaw, []],
    });
    stepN(engine, 5); // materialize block + adjuncts + lazy subscriptions
    const world = engine.getWorld()!;
    return { engine, world };
}

function playerOf(world: any): number {
    return world.queryEntities('TransformComponent', 'InputStateComponent')[0];
}

function bagOf(world: any) {
    return world.getComponent(playerOf(world), 'InventoryComponent') as any;
}

function itemEntities(world: any): number[] {
    return world.queryEntities('ItemComponent');
}

/** Click an item entity the way RaycastInteractionSystem reports it. */
function clickItem(world: any, entityId: number) {
    world.emitSimple('interact', { entityId, distance: 2 }, playerOf(world));
}

// ─── ItemRegistry: templates + deterministic derivation ──────────────────────

describe('ItemRegistry', () => {
    it('derives identical attributes for identical seeds (pure)', () => {
        const gem = getItemTemplate(1)!;
        const a = deriveItemAttributes(gem, 9347);
        const b = deriveItemAttributes(gem, 9347);
        expect(a).toEqual(b);
        expect(a.attributes.magic).toBeGreaterThanOrEqual(10);
        expect(Object.keys(a.attributes)).toEqual(['magic', 'luster']);
    });

    it('different seeds roll different attributes', () => {
        const gem = getItemTemplate(1)!;
        const a = deriveItemAttributes(gem, 9347);
        const b = deriveItemAttributes(gem, 777);
        expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    });

    it('mulberry32 is deterministic and in [0,1)', () => {
        const r1 = mulberry32(42), r2 = mulberry32(42);
        for (let i = 0; i < 5; i++) {
            const v = r1();
            expect(v).toBe(r2());
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('itemIdFor: stackables merge by template, uniques carry their seed', () => {
        expect(itemIdFor(getItemTemplate(2)!, 123)).toBe('tpl_2');     // key stacks
        expect(itemIdFor(getItemTemplate(1)!, 123)).toBe('itm_1_123'); // gem is unique
    });
});

// ─── b5 codec ─────────────────────────────────────────────────────────────────

describe('item adjunct (b5) codec', () => {
    it('raw → std → raw round-trips', () => {
        const raw = [[5, 8, 0.6], 1, 9347, 2, [0, 0.5, 0]];
        const std = ItemAttribute.deserialize!(raw);
        expect(std.templateId).toBe(1);
        expect(std.seed).toBe(9347);
        expect(std.count).toBe(2);
        expect(ItemAttribute.serialize!(std)).toEqual(raw);
    });

    it('std size mirrors the template visual (derived, not stored)', () => {
        const std = ItemAttribute.deserialize!([[1, 1, 1], 2, 0, 1, [0, 0, 0]]);
        expect([std.x, std.y, std.z]).toEqual(getItemTemplate(2)!.visual.size);
    });
});

// ─── P0: bag.max wiring ───────────────────────────────────────────────────────

describe('bag.max wiring (P0)', () => {
    it("player's maxCapacity comes from WorldConfig.player.bag.max", async () => {
        const engine = await makeHeadlessEngine();
        const world = engine.getWorld()!;
        expect(bagOf(world).maxCapacity).toBe(MockWorldNormal.player.bag.max);
    });
});

// ─── P1: pipeline + atomic pickup/drop ───────────────────────────────────────

describe('item pipeline + atomic pickup (P1)', () => {
    it('a b5 raw row becomes a pickable ItemComponent entity', async () => {
        const { world } = await bootWith([[0x00b5, [itemRow([5, 8, 0.6], 1, 9347)]]]);
        const eids = itemEntities(world);
        expect(eids).toHaveLength(1);
        const item = world.getComponent(eids[0], 'ItemComponent') as any;
        expect(item.templateId).toBe(1);
        expect(item.seed).toBe(9347);
    });

    it('pickup: bag credited, entity gone, draft has no b5 row (atomic)', async () => {
        const { world } = await bootWith([[0x00b5, [itemRow([5, 8, 0.6], 1, 9347)]]]);
        const eid = itemEntities(world)[0];

        clickItem(world, eid);

        expect(bagOf(world).items).toEqual([
            { id: 'itm_1_9347', quantity: 1, metadata: { templateId: 1, seed: 9347 } },
        ]);
        expect(itemEntities(world)).toHaveLength(0);

        const draft = world.draftStore.load(0, 2048, 2048);
        expect(draft, 'pickup must persist the block as a draft').not.toBeNull();
        expect(draft!.raw[2].some((g: any[]) => g[0] === 0x00b5)).toBe(false);
    });

    it('a full bag aborts the pickup with zero side effects', async () => {
        const { world } = await bootWith([[0x00b5, [itemRow([5, 8, 0.6], 1, 1)]]]);
        const bag = bagOf(world);
        bag.maxCapacity = 1;
        bag.items.push({ id: 'tpl_3', quantity: 1 });

        let full = false;
        world.on('inventory_full', () => { full = true; });
        clickItem(world, itemEntities(world)[0]);

        expect(full).toBe(true);
        expect(itemEntities(world)).toHaveLength(1);          // still in the world
        expect(world.draftStore.load(0, 2048, 2048)).toBeNull(); // nothing persisted
    });

    it('stackable items merge into one slot', async () => {
        const { world } = await bootWith([[0x00b5, [
            itemRow([5, 8, 0.6], 2, 0, 1),
            itemRow([6, 8, 0.6], 2, 0, 1),
        ]]]);
        for (const eid of [...itemEntities(world)]) clickItem(world, eid);
        expect(bagOf(world).items).toEqual([
            { id: 'tpl_2', quantity: 2, metadata: { templateId: 2, seed: 0 } },
        ]);
    });

    it('drop: bag debited, entity respawned, draft contains the b5 row', async () => {
        const { engine, world } = await bootWith([[0x00b5, [itemRow([5, 8, 0.6], 1, 9347)]]]);
        clickItem(world, itemEntities(world)[0]);
        expect(itemEntities(world)).toHaveLength(0);

        expect(engine.dropItem('itm_1_9347')).toBe(true);
        stepN(engine, 2); // AdjunctSystem initializes the spawned entity next frame

        expect(bagOf(world).items).toHaveLength(0);
        expect(itemEntities(world)).toHaveLength(1);
        const dropped = world.getComponent(itemEntities(world)[0], 'ItemComponent') as any;
        expect(dropped.seed).toBe(9347);                       // same gem, attributes intact

        const draft = world.draftStore.load(0, 2048, 2048)!;
        const b5 = draft.raw[2].find((g: any[]) => g[0] === 0x00b5);
        expect(b5[1]).toHaveLength(1);
        expect(b5[1][0][1]).toBe(1);                           // templateId survived
        expect(b5[1][0][2]).toBe(9347);                        // seed survived
    });

    it('dropping more than you carry is rejected with no side effects', async () => {
        const { engine, world } = await bootWith([]);
        expect(engine.dropItem('tpl_2', 1)).toBe(false);
        expect(itemEntities(world)).toHaveLength(0);
    });
});

// ─── P0+P2: JSONLogic inventory conditions through the real pipeline ─────────

describe('inventory.* trigger conditions', () => {
    const keyDoorTrigger = [
        [4, 4, 4], [8, 8, 1], [0, 0, 0], 1, 0, [
            {
                type: 'in',
                conditions: { '>=': [{ var: 'inventory.tpl_2' }, 1] },
                actions: [{ type: 'flag', method: '', target: 'door_open', params: [true] }],
                fallbackActions: [{ type: 'flag', method: '', target: 'door_denied', params: [true] }],
            },
        ],
    ];

    it('without the key the fallback fires; carrying it passes', async () => {
        const { world } = await bootWith([
            [0x00b5, [itemRow([5, 8, 0.6], 2, 0, 1)]],
            [0x00b8, [keyDoorTrigger]],
        ]);
        const player = world.getComponent(playerOf(world), 'TransformComponent') as any;

        // Walk in WITHOUT the key → denied.
        player.position = [...(world.getComponent(world.queryEntities('TriggerComponent')[0], 'TransformComponent') as any).position];
        stepN({ step: (dt: number) => world.step(dt) } as any, 0); // no-op, position set directly
        world.step(1 / 60);
        expect(world.globalFlags.door_open).toBeUndefined();
        expect(world.globalFlags.door_denied).toBe(true);

        // Leave, grab the key, re-enter → opens.
        player.position[0] += 100;
        world.step(1 / 60);
        clickItem(world, itemEntities(world)[0]);
        player.position[0] -= 100;
        world.step(1 / 60);
        expect(world.globalFlags.door_open).toBe(true);
    });
});

// ─── P2: bag actions via LocalActuator (Game-mode gated) ─────────────────────

describe('bag actions (P2)', () => {
    it('give/take work in Game mode and are ignored elsewhere', async () => {
        const { world } = await bootWith([]);
        const playerId = playerOf(world);
        const give = { type: 'bag', target: 'tpl_2', method: 'give', params: [1] } as any;

        // Normal mode: refused (game.md permission matrix).
        world.actuator.execute(give, { world, playerId, mode: SystemMode.Normal });
        expect(bagOf(world).items).toHaveLength(0);

        // Game mode: credited / debited.
        world.actuator.execute(give, { world, playerId, mode: SystemMode.Game });
        expect(bagOf(world).items).toEqual([{ id: 'tpl_2', quantity: 1, metadata: undefined }]);

        world.actuator.execute(
            { type: 'bag', target: 'tpl_2', method: 'take', params: [1] } as any,
            { world, playerId, mode: SystemMode.Game });
        expect(bagOf(world).items).toHaveLength(0);
    });

    it('a gameOnly trigger gives the key only in Game mode (full pipeline)', async () => {
        const giveTrigger = [
            [4, 4, 4], [8, 8, 1], [0, 0, 0], 1, 1 /* gameOnly */, [
                { type: 'in', actions: [{ type: 'bag', target: 'tpl_2', method: 'give', params: [1] }] },
            ],
        ];
        const { world } = await bootWith([[0x00b8, [giveTrigger]]]);
        const player = world.getComponent(playerOf(world), 'TransformComponent') as any;
        const trigPos = (world.getComponent(world.queryEntities('TriggerComponent')[0], 'TransformComponent') as any).position;

        // Normal mode: gameOnly volume doesn't even evaluate.
        player.position = [...trigPos];
        world.step(1 / 60);
        expect(bagOf(world).items).toHaveLength(0);

        // Game mode, re-enter: key granted.
        player.position[0] += 100;
        world.step(1 / 60);
        world.setMode(SystemMode.Game);
        player.position[0] -= 100;
        world.step(1 / 60);
        expect(bagOf(world).items).toEqual([{ id: 'tpl_2', quantity: 1, metadata: undefined }]);
    });
});

// ─── P0: inventory persistence (meta round-trip across "sessions") ───────────

describe('inventory persistence (P0)', () => {
    it('bag contents survive an engine restart on the same backend', async () => {
        const backend = new InMemoryDraftBackend();

        // Session 1: pick up a gem; write-behind lands on a microtask.
        const s1 = await bootWith([[0x00b5, [itemRow([5, 8, 0.6], 1, 9347)]]], { draftBackend: backend });
        clickItem(s1.world, itemEntities(s1.world)[0]);
        await new Promise(r => setTimeout(r, 0));

        // Session 2: same backend (= same browser storage), fresh engine.
        const s2 = await bootWith([], { draftBackend: backend });
        await s2.engine.hydrateDrafts(0);
        expect(bagOf(s2.world).items).toEqual([
            { id: 'itm_1_9347', quantity: 1, metadata: { templateId: 1, seed: 9347 } },
        ]);
    });
});
