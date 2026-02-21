import * as THREE from 'three';
import { World, ISystem, EntityId, GameEvent } from '../World';
import { TransformComponent } from '../components/PlayerComponents';
import { ItemDropComponent } from '../components/ItemDropComponent';

export class ItemDropSystem implements ISystem {
    private world!: World;

    public attach(world: World): void {
        this.world = world;

        // Listen for interactions to potentially pick up this drop
        this.world.subscribe("interact", this.onPlayerInteract.bind(this));

        // Listen for requests to spawn a new item drop
        this.world.subscribe("spawn_drop", this.onSpawnDrop.bind(this));
    }

    public update(world: World, dt: number): void {
        if (!this.world) this.attach(world);

        // Animate all active drops
        const dropEntities = world.getEntitiesWith(["ItemDropComponent", "TransformComponent"]);

        for (const id of dropEntities) {
            const drop = world.getComponent<ItemDropComponent>(id, "ItemDropComponent")!;
            const transform = world.getComponent<TransformComponent>(id, "TransformComponent")!;

            // Simple bobbing and rotating animation
            drop.bobTimer += dt;
            transform.rotation[1] += dt * 2; // Spin on Y axis

            // Note: In a fully complete engine, a RenderSystem would sync the generic `TransformComponent` 
            // back to the Three.js mesh. For now, since we haven't written the generic Mesh sync, 
            // the physics or logic is isolated.
        }
    }

    private onPlayerInteract(event: GameEvent): void {
        const { entityId, distance } = event.payload;

        // Check if the entity the raycaster hit has an ItemDropComponent
        const dropComp = this.world.getComponent<ItemDropComponent>(entityId, "ItemDropComponent");

        if (dropComp && distance < 10) { // Interaction range
            console.log(`[ItemDrop ECS] Player picked up ${dropComp.quantity}x ${dropComp.itemId}`);

            // 1. Fire pickup event to Inventory System
            // (Assuming the player is entity 1, or passes their own source ID)
            this.world.emitSimple("pickup_item", {
                itemId: dropComp.itemId,
                amount: dropComp.quantity,
                metadata: dropComp.metadata
            }, 1);

            // 2. Destroy the drop entity from the world
            // If there's an associated mesh in Three.js, it should be cleaned up natively by World's destroy hook
            this.world.destroyEntity(entityId);
        }
    }

    private onSpawnDrop(event: GameEvent): void {
        const { itemId, amount, position } = event.payload;

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

        // Make it interactable by the Raycaster
        this.world.addComponent(dropEntity, "RaycastTargetComponent", {
            type: "entity",
            metadata: { name: itemId },
            isHovered: false,
            distanceToCamera: Infinity
        });

        console.log(`[ItemDrop ECS] Spawned drop ${amount}x ${itemId} at Entity ${dropEntity}`);
    }
}
