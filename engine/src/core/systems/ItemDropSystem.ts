import { World, ISystem } from '../World';
import { TransformComponent } from '../components/PlayerComponents';
import { ItemDropComponent } from '../components/ItemDropComponent';
import type { EventReader } from '../events/EventReader';

/**
 * ItemDropSystem — transient floating drops (NOT world content; b5 item
 * adjuncts are the persistent kind). Consumes interact.primary to pick them
 * up and item.spawn_drop to mint them (event-bus PR-2).
 *
 * Entity destruction happens inside our own update (pull model) — never in a
 * dispatch stack.
 */
export class ItemDropSystem implements ISystem {
    private world!: World;
    private interactReader: EventReader<'interact.primary'> | null = null;
    private spawnReader: EventReader<'item.spawn_drop'> | null = null;

    public update(world: World, dt: number): void {
        this.world = world;
        if (!this.interactReader && (world as any).events?.reader) {
            this.interactReader = world.events.reader('interact.primary');
            this.spawnReader = world.events.reader('item.spawn_drop');
        }

        if (this.spawnReader) {
            for (const ev of this.spawnReader.read()) this.onSpawnDrop(ev);
        }
        if (this.interactReader) {
            for (const ev of this.interactReader.read()) this.onPlayerInteract(ev);
        }

        const dropEntities = world.getEntitiesWith(["ItemDropComponent", "TransformComponent"]);
        for (const id of dropEntities) {
            const drop = world.getComponent<ItemDropComponent>(id, "ItemDropComponent")!;
            const transform = world.getComponent<TransformComponent>(id, "TransformComponent")!;
            drop.bobTimer += dt;
            transform.rotation[1] += dt * 2; // Spin on Y axis
        }
    }

    private onPlayerInteract(ev: any): void {
        const entityId = ev?.target;
        if (entityId === null || entityId === undefined) return;
        // Stale-target defense: the entity may be gone by read time (contract).
        const dropComp = this.world.getComponent<ItemDropComponent>(entityId, "ItemDropComponent");

        if (dropComp && (ev.payload?.distance ?? Infinity) < 10) {
            console.log(`[ItemDrop ECS] Player picked up ${dropComp.quantity}x ${dropComp.itemId}`);
            this.world.events.emit("item.pickup", {
                itemId: dropComp.itemId,
                amount: dropComp.quantity,
                metadata: dropComp.metadata
            }, { actor: ev.actor });
            this.world.destroyEntity(entityId);
        }
    }

    private onSpawnDrop(ev: any): void {
        const { itemId, amount, position } = ev?.payload ?? {};
        if (!itemId || !position) return;
        const dropEntity = this.world.createEntity();

        this.world.addComponent(dropEntity, "ItemDropComponent", {
            itemId: itemId,
            quantity: amount,
            bobTimer: 0
        });

        this.world.addComponent(dropEntity, "TransformComponent", {
            position: position,
            rotation: [0, 0, 0],
            scale: [0.5, 0.5, 0.5]
        });

        this.world.addComponent(dropEntity, "RaycastTargetComponent", {
            type: "entity",
            metadata: { name: itemId },
            isHovered: false,
            distanceToCamera: Infinity
        });

        console.log(`[ItemDrop ECS] Spawned drop ${amount}x ${itemId} at Entity ${dropEntity}`);
    }
}
