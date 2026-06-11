import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { InventoryComponent } from '../../src/core/components/InventoryComponent';

// L3 — the item pickup chain end-to-end over the real event bus:
//   spawn_drop → ItemDropComponent entity → 'interact' (as RaycastInteractionSystem
//   emits it: payload + source=player) → pickup_item(source) → InventorySystem.
// This chain was dead on THREE counts before the fix: handlers destructured the
// GameEvent envelope instead of payload, pickup_item carried no source, and the
// player had no InventoryComponent at all.

async function bootChain() {
    const engine = await makeHeadlessEngine();
    const world = engine.getWorld()!;
    stepN(engine, 1); // systems lazy-attach their event subscriptions on first update
    const playerId = world.getEntitiesWith(['InventoryComponent', 'InputStateComponent'])[0];
    return { engine, world, playerId };
}

function inventoryOf(world: any, playerId: number): InventoryComponent {
    return world.getComponent(playerId, 'InventoryComponent');
}

describe('item pickup chain (spawn_drop → interact → inventory)', () => {
    it('player is created with an InventoryComponent', async () => {
        const { playerId } = await bootChain();
        expect(playerId).toBeDefined();
    });

    it('spawn_drop payload creates a drop entity', async () => {
        const { engine, world } = await bootChain();
        world.emitSimple('spawn_drop', { itemId: 'gold_coin', amount: 3, position: [1, 1, 1] });
        stepN(engine, 1);
        expect(world.getEntitiesWith(['ItemDropComponent']).length).toBe(1);
    });

    it('interacting with a drop credits the player inventory and destroys the drop', async () => {
        const { engine, world, playerId } = await bootChain();
        const updates: any[] = [];
        world.on('inventory_updated', (ev: any) => updates.push(ev.payload));

        world.emitSimple('spawn_drop', { itemId: 'gold_coin', amount: 3, position: [1, 1, 1] });
        stepN(engine, 1);
        const dropEid = world.getEntitiesWith(['ItemDropComponent'])[0];

        // Exactly what RaycastInteractionSystem emits on a primary-click hit:
        world.emitSimple('interact', { entityId: dropEid, metadata: {}, distance: 3, point: [0, 0, 0] }, playerId);
        stepN(engine, 1);

        const inv = inventoryOf(world, playerId);
        expect(inv.items).toEqual([{ id: 'gold_coin', quantity: 3, metadata: undefined }]);
        expect(world.getEntitiesWith(['ItemDropComponent']).length).toBe(0);
        expect(updates.length).toBe(1);
        expect(updates[0].entity).toBe(playerId);
    });

    it('stacks repeated pickups of the same item id', async () => {
        const { engine, world, playerId } = await bootChain();
        for (let i = 0; i < 2; i++) {
            world.emitSimple('spawn_drop', { itemId: 'wood', amount: 2, position: [1, 1, 1] });
            stepN(engine, 1);
            const dropEid = world.getEntitiesWith(['ItemDropComponent'])[0];
            world.emitSimple('interact', { entityId: dropEid, metadata: {}, distance: 3, point: [0, 0, 0] }, playerId);
            stepN(engine, 1);
        }
        expect(inventoryOf(world, playerId).items).toEqual([{ id: 'wood', quantity: 4, metadata: undefined }]);
    });

    it('emits inventory_full instead of exceeding maxCapacity', async () => {
        const { engine, world, playerId } = await bootChain();
        const inv = inventoryOf(world, playerId);
        for (let i = 0; i < inv.maxCapacity; i++) inv.items.push({ id: `junk_${i}`, quantity: 1 });

        let full: any = null;
        world.on('inventory_full', (ev: any) => { full = ev.payload; });

        world.emitSimple('spawn_drop', { itemId: 'overflow', amount: 1, position: [1, 1, 1] });
        stepN(engine, 1);
        const dropEid = world.getEntitiesWith(['ItemDropComponent'])[0];
        world.emitSimple('interact', { entityId: dropEid, metadata: {}, distance: 3, point: [0, 0, 0] }, playerId);
        stepN(engine, 1);

        expect(full).toEqual({ entity: playerId, itemId: 'overflow' });
        expect(inv.items.find(i => i.id === 'overflow')).toBeUndefined();
    });

    it('interact miss (entityId null) is ignored', async () => {
        const { engine, world, playerId } = await bootChain();
        world.emitSimple('interact', { entityId: null, metadata: null, distance: Infinity, point: [0, 0, 0] }, playerId);
        expect(() => stepN(engine, 1)).not.toThrow();
        expect(inventoryOf(world, playerId).items).toEqual([]);
    });

    it('consume_item decrements and removes emptied stacks', async () => {
        const { engine, world, playerId } = await bootChain();
        const inv = inventoryOf(world, playerId);
        inv.items.push({ id: 'apple', quantity: 2 });

        world.emitSimple('consume_item', { itemId: 'apple', amount: 1 }, playerId);
        stepN(engine, 1);
        expect(inv.items).toEqual([{ id: 'apple', quantity: 1 }]);

        world.emitSimple('consume_item', { itemId: 'apple', amount: 1 }, playerId);
        stepN(engine, 1);
        expect(inv.items).toEqual([]);
    });
});
