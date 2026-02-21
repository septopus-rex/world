import * as THREE from 'three';
import { World, ISystem, EntityId } from '../World';
import { TriggerVolumeComponent } from '../types/Trigger';

// Represents the player or any entity that can activate triggers
export interface ColliderComponent {
    size: [number, number, number];
    offset: [number, number, number];
}

interface TriggerState {
    enteredEntities: Set<EntityId>;
}

/**
 * Handles purely mathematical spatial checks between colliders (players, NPCs)
 * and trigger volumes globally, emitting 'in', 'out', and 'hold' events.
 */
export class TriggerSystem implements ISystem {
    // Map to keep track of who is currently inside which trigger
    private activeTriggers = new Map<EntityId, TriggerState>();

    // Math helpers for performance (avoid object creation every frame)
    private _boxA = new THREE.Box3();
    private _boxB = new THREE.Box3();
    private _vecA = new THREE.Vector3();
    private _vecB = new THREE.Vector3();

    public update(world: World, dt: number): void {
        const triggerEntities = world.queryEntities("TriggerVolumeComponent");
        const colliderEntities = world.queryEntities("ColliderComponent");

        for (const tid of triggerEntities) {
            const trigger = world.getComponent<TriggerVolumeComponent>(tid, "TriggerVolumeComponent")!;
            const triggerPos = world.getComponent<{ position: [number, number, number] }>(tid, "Transform")?.position || [0, 0, 0];

            // Set up Trigger AABB
            this._vecA.set(
                triggerPos[0] + trigger.offset[0],
                triggerPos[1] + trigger.offset[1],
                triggerPos[2] + trigger.offset[2]
            );
            this._vecB.set(trigger.size[0] / 2, trigger.size[1] / 2, trigger.size[2] / 2);
            this._boxA.setFromCenterAndSize(this._vecA, this._vecB.clone().multiplyScalar(2));

            // Ensure state tracking exists
            if (!this.activeTriggers.has(tid)) {
                this.activeTriggers.set(tid, { enteredEntities: new Set() });
            }
            const state = this.activeTriggers.get(tid)!;
            const currentFrameActive = new Set<EntityId>();

            // Check every collider
            for (const cid of colliderEntities) {
                // Ensure trigger doesn't self-trigger
                if (tid === cid) continue;

                const collider = world.getComponent<ColliderComponent>(cid, "ColliderComponent")!;
                const colliderPos = world.getComponent<{ position: [number, number, number] }>(cid, "Transform")?.position || [0, 0, 0];

                this._vecA.set(
                    colliderPos[0] + collider.offset[0],
                    colliderPos[1] + collider.offset[1],
                    colliderPos[2] + collider.offset[2]
                );
                this._vecB.set(collider.size[0] / 2, collider.size[1] / 2, collider.size[2] / 2);
                this._boxB.setFromCenterAndSize(this._vecA, this._vecB.clone().multiplyScalar(2));

                const isIntersecting = this._boxA.intersectsBox(this._boxB);

                if (isIntersecting) {
                    currentFrameActive.add(cid);

                    if (!state.enteredEntities.has(cid)) {
                        // ON ENTER
                        state.enteredEntities.add(cid);
                        world.emitSimple("EVENT_TRIGGER_IN", { trigger: trigger.logic }, cid);
                    } else {
                        // ON HOLD
                        world.emitSimple("EVENT_TRIGGER_HOLD", { trigger: trigger.logic, dt }, cid);
                    }
                }
            }

            // Check for exits (was in previous frame, but not in current frame)
            for (const oldCid of state.enteredEntities) {
                if (!currentFrameActive.has(oldCid)) {
                    state.enteredEntities.delete(oldCid);
                    world.emitSimple("EVENT_TRIGGER_OUT", { trigger: trigger.logic }, oldCid);
                }
            }
        }
    }
}
