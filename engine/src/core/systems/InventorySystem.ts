import { World, ISystem, EntityId, GameEvent } from '../World';
import { InventoryComponent } from '../components/InventoryComponent';

export class InventorySystem implements ISystem {
    private world!: World;

    constructor() {
        // Will be initialized when attached or during the first update
    }

    public attach(world: World): void {
        this.world = world;

        // Listen for pickup events from other systems (like Raycaster or Trigger)
        this.world.subscribe("pickup_item", this.onItemPickup.bind(this));

        // Listen for drop/consume events
        this.world.subscribe("consume_item", this.onItemConsume.bind(this));
    }

    public update(world: World, dt: number): void {
        if (!this.world) this.attach(world);
        // The inventory system is mostly event-driven in this ECS,
        // so `update` doesn't need to do active per-frame polling.
    }

    private onItemPickup(event: GameEvent): void {
        if (event.targetEntity === undefined) return;

        const inventory = this.world.getComponent<InventoryComponent>(event.targetEntity, "InventoryComponent");
        if (!inventory) return;

        const { itemId, amount = 1, metadata } = event.payload;

        // Check if we already have this item
        const existingItem = inventory.items.find(i => i.id === itemId);

        // Check capacity limit if adding a new stack
        if (!existingItem && inventory.items.length >= inventory.maxCapacity) {
            console.warn(`[Inventory ECS] Cannot pickup ${itemId}. Bag is full!`);
            this.world.emitSimple("inventory_full", { entity: event.targetEntity, itemId });
            return;
        }

        if (existingItem) {
            existingItem.quantity += amount;
        } else {
            inventory.items.push({ id: itemId, quantity: amount, metadata });
        }

        console.log(`[Inventory ECS] Entity ${event.targetEntity} picked up ${amount}x ${itemId}. Total: ${existingItem ? existingItem.quantity : amount}`);

        // Emit success event for UI to update
        this.world.emitSimple("inventory_updated", { entity: event.targetEntity, inventory });
    }

    private onItemConsume(event: GameEvent): void {
        if (event.targetEntity === undefined) return;

        const inventory = this.world.getComponent<InventoryComponent>(event.targetEntity, "InventoryComponent");
        if (!inventory) return;

        const { itemId, amount = 1 } = event.payload;

        const existingItemIndex = inventory.items.findIndex(i => i.id === itemId);

        if (existingItemIndex === -1) {
            console.warn(`[Inventory ECS] Cannot consume ${itemId}. Item not found.`);
            return;
        }

        const item = inventory.items[existingItemIndex];

        if (item.quantity < amount) {
            console.warn(`[Inventory ECS] Cannot consume ${amount}x ${itemId}. Only have ${item.quantity}.`);
            return;
        }

        // Deduct quantity
        item.quantity -= amount;
        console.log(`[Inventory ECS] Entity ${event.targetEntity} consumed ${amount}x ${itemId}. Remaining: ${item.quantity}`);

        // Remove item from bag if empty
        if (item.quantity <= 0) {
            inventory.items.splice(existingItemIndex, 1);
        }

        // Emit success event for UI
        this.world.emitSimple("inventory_updated", { entity: event.targetEntity, inventory });
    }
}
