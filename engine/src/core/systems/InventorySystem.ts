import { World, ISystem, EntityId, GameEvent } from '../World';
import { InventoryComponent } from '../components/InventoryComponent';

export class InventorySystem implements ISystem {
    private world!: World;

    public attach(world: World): void {
        this.world = world;
        this.world.on("pickup_item", this.onItemPickup.bind(this));
        this.world.on("consume_item", this.onItemConsume.bind(this));
    }

    public update(world: World, dt: number): void {
        if (!this.world) this.attach(world);
    }

    private onItemPickup(event: GameEvent): void {
        if (event.source === undefined) return;

        const inventory = this.world.getComponent<InventoryComponent>(event.source, "InventoryComponent");
        if (!inventory) return;

        const { itemId, amount = 1, metadata } = event.payload;
        const existingItem = inventory.items.find(i => i.id === itemId);

        if (!existingItem && inventory.items.length >= inventory.maxCapacity) {
            this.world.emitSimple("inventory_full", { entity: event.source, itemId });
            return;
        }

        if (existingItem) {
            existingItem.quantity += amount;
        } else {
            inventory.items.push({ id: itemId, quantity: amount, metadata });
        }

        this.world.emitSimple("inventory_updated", { entity: event.source, inventory });
    }

    private onItemConsume(event: GameEvent): void {
        if (event.source === undefined) return;

        const inventory = this.world.getComponent<InventoryComponent>(event.source, "InventoryComponent");
        if (!inventory) return;

        const { itemId, amount = 1 } = event.payload;
        const existingItemIndex = inventory.items.findIndex(i => i.id === itemId);

        if (existingItemIndex === -1) return;

        const item = inventory.items[existingItemIndex];
        if (item.quantity < amount) return;

        item.quantity -= amount;
        if (item.quantity <= 0) {
            inventory.items.splice(existingItemIndex, 1);
        }

        this.world.emitSimple("inventory_updated", { entity: event.source, inventory });
    }
}
