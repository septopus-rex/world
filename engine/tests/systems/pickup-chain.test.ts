import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { InventoryComponent } from '../../src/core/components/InventoryComponent';

// L3 — the item pickup chain end-to-end over the TYPED event queue (PR-2):
//   item.spawn_drop → ItemDropComponent entity → interact.primary (as
//   RaycastInteractionSystem emits it: target + actor) → item.pickup(actor)
//   → InventorySystem. Pull model: each hop lands within one step because the
//   registration order puts every consumer after its producer.

async function bootChain() {
    const engine = await makeHeadlessEngine();
    const world = engine.getWorld()!;
    stepN(engine, 1); // systems lazily build their readers on first update
    const playerId = world.getEntitiesWith(['InventoryComponent', 'InputStateComponent'])[0];
    return { engine, world, playerId };
}

function inventoryOf(world: any, playerId: number): InventoryComponent {
    return world.getComponent(playerId, 'InventoryComponent');
}

/** Emit exactly what RaycastInteractionSystem emits on a primary-click hit. */
function click(world: any, target: number, actor: number) {
    world.events.emit('interact.primary',
        { metadata: {}, distance: 3, point: [0, 0, 0] }, { target, actor });
}

describe('item pickup chain (item.spawn_drop → interact.primary → inventory)', () => {
    it('player is created with an InventoryComponent', async () => {
        const { playerId } = await bootChain();
        expect(playerId).toBeDefined();
    });

    it('item.spawn_drop creates a drop entity', async () => {
        const { engine, world } = await bootChain();
        world.events.emit('item.spawn_drop', { itemId: 'gold_coin', amount: 3, position: [1, 1, 1] });
        stepN(engine, 1);
        expect(world.getEntitiesWith(['ItemDropComponent']).length).toBe(1);
    });

    it('interacting with a drop credits the player inventory and destroys the drop', async () => {
        const { engine, world, playerId } = await bootChain();
        const updates: any[] = [];
        world.events.on('inventory.updated', (ev: any) => updates.push(ev.payload));

        world.events.emit('item.spawn_drop', { itemId: 'gold_coin', amount: 3, position: [1, 1, 1] });
        stepN(engine, 1);
        const dropEid = world.getEntitiesWith(['ItemDropComponent'])[0];

        click(world, dropEid, playerId);
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
            world.events.emit('item.spawn_drop', { itemId: 'wood', amount: 2, position: [1, 1, 1] });
            stepN(engine, 1);
            const dropEid = world.getEntitiesWith(['ItemDropComponent'])[0];
            click(world, dropEid, playerId);
            stepN(engine, 1);
        }
        expect(inventoryOf(world, playerId).items).toEqual([{ id: 'wood', quantity: 4, metadata: undefined }]);
    });

    it('emits inventory.full instead of exceeding maxCapacity', async () => {
        const { engine, world, playerId } = await bootChain();
        const inv = inventoryOf(world, playerId);
        for (let i = 0; i < inv.maxCapacity; i++) inv.items.push({ id: `junk_${i}`, quantity: 1 });

        let full: any = null;
        world.events.on('inventory.full', (ev: any) => { full = ev.payload; });

        world.events.emit('item.spawn_drop', { itemId: 'overflow', amount: 1, position: [1, 1, 1] });
        stepN(engine, 1);
        const dropEid = world.getEntitiesWith(['ItemDropComponent'])[0];
        click(world, dropEid, playerId);
        stepN(engine, 1);

        expect(full).toEqual({ entity: playerId, itemId: 'overflow' });
        expect(inv.items.find(i => i.id === 'overflow')).toBeUndefined();
    });

    it('interact.miss is ignored by the pickup chain', async () => {
        const { engine, world, playerId } = await bootChain();
        world.events.emit('interact.miss', {}, { actor: playerId });
        expect(() => stepN(engine, 1)).not.toThrow();
        expect(inventoryOf(world, playerId).items).toEqual([]);
    });

    it('item.consume decrements and removes emptied stacks', async () => {
        const { engine, world, playerId } = await bootChain();
        const inv = inventoryOf(world, playerId);
        inv.items.push({ id: 'apple', quantity: 2 });

        world.events.emit('item.consume', { itemId: 'apple', amount: 1 }, { actor: playerId });
        stepN(engine, 1);
        expect(inv.items).toEqual([{ id: 'apple', quantity: 1 }]);

        world.events.emit('item.consume', { itemId: 'apple', amount: 1 }, { actor: playerId });
        stepN(engine, 1);
        expect(inv.items).toEqual([]);
    });
});
