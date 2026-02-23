import { World, ISystem, EntityId } from '../World';
import { TransformComponent } from '../components/PlayerComponents';
import { ItemDropComponent } from '../components/ItemDropComponent';

export class ItemDropSystem implements ISystem {
    private world!: World;

    public attach(world: World): void {
        this.world = world;
        this.world.on("interact", this.onPlayerInteract.bind(this));
        this.world.on("spawn_drop", this.onSpawnDrop.bind(this));
    }

    public update(world: World, dt: number): void {
        if (!this.world) this.attach(world);

        const dropEntities = world.getEntitiesWith(["ItemDropComponent", "TransformComponent"]);

        for (const id of dropEntities) {
            const drop = world.getComponent<ItemDropComponent>(id, "ItemDropComponent")!;
            const transform = world.getComponent<TransformComponent>(id, "TransformComponent")!;

            drop.bobTimer += dt;
            transform.rotation[1] += dt * 2; // Spin on Y axis
        }
    }

    private onPlayerInteract(event: any): void {
        const { entityId, distance } = event;
        const dropComp = this.world.getComponent<ItemDropComponent>(entityId, "ItemDropComponent");

        if (dropComp && distance < 10) {
            console.log(`[ItemDrop ECS] Player picked up ${dropComp.quantity}x ${dropComp.itemId}`);

            this.world.emitSimple("pickup_item", {
                itemId: dropComp.itemId,
                amount: dropComp.quantity,
                metadata: dropComp.metadata
            });

            this.world.destroyEntity(entityId);
        }
    }

    private onSpawnDrop(event: any): void {
        const { itemId, amount, position } = event;
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
