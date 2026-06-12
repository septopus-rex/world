import { World, ISystem } from '../World';
import { InventoryComponent } from '../components/InventoryComponent';
import type { EventReader } from '../events/EventReader';
import type { WorldEvent } from '../events/EventTypes';

/**
 * InventorySystem — credits/debits actor bags from the item channels
 * (event-bus PR-2b: pull model over item.pickup / item.consume).
 *
 * REGISTRATION ORDER MATTERS: this system runs AFTER every emitter
 * (TriggerSystem's bag actions, ItemSystem, ItemDropSystem) so a pickup is in
 * the bag the same frame it happened.
 */
export class InventorySystem implements ISystem {
    private world!: World;
    private pickupReader: EventReader<'item.pickup'> | null = null;
    private consumeReader: EventReader<'item.consume'> | null = null;

    public update(world: World, _dt: number): void {
        this.world = world;
        if (!this.pickupReader && (world as any).events?.reader) {
            this.pickupReader = world.events.reader('item.pickup');
            this.consumeReader = world.events.reader('item.consume');
        }
        if (this.pickupReader) {
            for (const ev of this.pickupReader.read()) this.onItemPickup(ev);
        }
        if (this.consumeReader) {
            for (const ev of this.consumeReader.read()) this.onItemConsume(ev);
        }
    }

    private onItemPickup(ev: WorldEvent<'item.pickup'>): void {
        if (ev.actor === undefined) return;

        const inventory = this.world.getComponent<InventoryComponent>(ev.actor, "InventoryComponent");
        if (!inventory) return;

        const { itemId, amount = 1, metadata } = ev.payload as any;
        const existingItem = inventory.items.find(i => i.id === itemId);

        if (!existingItem && inventory.items.length >= inventory.maxCapacity) {
            this.world.events.emit("inventory.full", { entity: ev.actor, itemId });
            return;
        }

        if (existingItem) {
            existingItem.quantity += amount;
        } else {
            inventory.items.push({ id: itemId, quantity: amount, metadata });
        }

        this.world.events.emit("inventory.updated", { entity: ev.actor, inventory });
        this.persist(inventory);
    }

    private onItemConsume(ev: WorldEvent<'item.consume'>): void {
        if (ev.actor === undefined) return;

        const inventory = this.world.getComponent<InventoryComponent>(ev.actor, "InventoryComponent");
        if (!inventory) return;

        const { itemId, amount = 1 } = ev.payload as any;
        const existingItemIndex = inventory.items.findIndex(i => i.id === itemId);

        if (existingItemIndex === -1) return;

        const item = inventory.items[existingItemIndex];
        if (item.quantity < amount) return;

        item.quantity -= amount;
        if (item.quantity <= 0) {
            inventory.items.splice(existingItemIndex, 1);
        }

        this.world.events.emit("inventory.updated", { entity: ev.actor, inventory });
        this.persist(inventory);
    }

    /** Write-behind the (single local) player's inventory to durable storage —
     *  restored at boot by Engine.hydrateDrafts(). */
    private persist(inventory: InventoryComponent): void {
        this.world.draftStore.saveMeta(0, "inventory", inventory.items);
    }
}
