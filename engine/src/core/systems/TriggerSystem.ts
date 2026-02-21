import { World, ISystem, EntityId } from '../World';
import { TriggerComponent, TriggerAction } from '../components/TriggerComponent';
import { TransformComponent } from '../components/PlayerComponents';
import { AdjunctComponent } from '../components/AdjunctComponents';
import * as THREE from 'three';

/**
 * TriggerSystem
 * 
 * Handles the logic for spatial triggers. It detects when entities (primarily the player)
 * enter, stay, or exit defined trigger volumes and executes the associated actions.
 */
export class TriggerSystem implements ISystem {

    public update(world: World, deltaTime: number): void {
        const triggerEntities = world.queryEntities("TriggerComponent");
        const playerEntities = world.queryEntities("TransformComponent"); // Player is currently identified by Transform

        if (playerEntities.length === 0) return;

        // For now, we only care about the primary player entity
        const playerId = playerEntities[0];
        const playerTransform = world.getComponent<TransformComponent>(playerId, "TransformComponent");
        if (!playerTransform) return;

        const playerPos = new THREE.Vector3(
            playerTransform.position[0],
            playerTransform.position[1],
            playerTransform.position[2]
        );

        for (const entityId of triggerEntities) {
            const trigger = world.getComponent<TriggerComponent>(entityId, "TriggerComponent");
            const transform = world.getComponent<TransformComponent>(entityId, "TransformComponent");

            if (!trigger || !transform) continue;

            const triggerPos = new THREE.Vector3(
                transform.position[0] + trigger.offset[0],
                transform.position[1] + trigger.offset[1],
                transform.position[2] + trigger.offset[2]
            );

            // Simple Box/Sphere collision check
            let isInside = false;
            if (trigger.shape === 'sphere') {
                const distance = playerPos.distanceTo(triggerPos);
                isInside = distance < trigger.size[0]; // radius
            } else {
                // AABB Check
                const half = new THREE.Vector3(trigger.size[0] / 2, trigger.size[1] / 2, trigger.size[2] / 2);
                isInside = (
                    Math.abs(playerPos.x - triggerPos.x) < half.x &&
                    Math.abs(playerPos.y - triggerPos.y) < half.y &&
                    Math.abs(playerPos.z - triggerPos.z) < half.z
                );
            }

            const wasInside = trigger.entitiesInside.has(playerId);

            if (isInside && !wasInside) {
                // ENTER (in)
                this.handleEvent(world, trigger, 'in');
                trigger.entitiesInside.add(playerId);
            } else if (!isInside && wasInside) {
                // EXIT (out)
                this.handleEvent(world, trigger, 'out');
                trigger.entitiesInside.delete(playerId);
            } else if (isInside) {
                // STAY (hold)
                this.handleEvent(world, trigger, 'hold');
            }
        }
    }

    /**
     * Executes actions associated with a trigger event.
     */
    private handleEvent(world: World, trigger: TriggerComponent, type: string) {
        const event = trigger.events.find(e => e.type === type);
        if (!event) return;

        // Check one-time constraint
        if (event.oneTime && (trigger.triggeredCount[type] || 0) > 0) return;

        console.log(`[TriggerSystem] Firing event: ${type}`);

        for (const action of event.actions) {
            this.executeAction(world, action);
        }

        trigger.triggeredCount[type] = (trigger.triggeredCount[type] || 0) + 1;
    }

    /**
     * Interprets and executes a single TriggerAction.
     * This is an ECS-friendly port of the legacy builder.js execution logic.
     */
    private executeAction(world: World, action: TriggerAction) {
        console.log(`[TriggerSystem] Executing action:`, action);

        if (action.type === 'adjunct') {
            // Find target adjunct entity. 
            // In a real scenario, we might use a UUID or Tag.
            // For the sandbox, we'll look by adjunctId if provided, or first match.
            const adjuncts = world.queryEntities("AdjunctComponent");
            const targetId = adjuncts.find(id => {
                const comp = world.getComponent<AdjunctComponent>(id, "AdjunctComponent");
                return comp?.adjunctId === action.target;
            });

            if (targetId !== undefined) {
                const comp = world.getComponent<AdjunctComponent>(targetId, "AdjunctComponent");
                if (comp) {
                    this.applyAdjunctModification(comp, action.method, action.params);
                }
            }
        } else if (action.type === 'system') {
            // Global system actions (e.g., log to console, change weather)
            if (action.method === 'log') {
                console.log(`[WORLD LOG]:`, ...action.params);
            }
        }
    }

    private applyAdjunctModification(adjunct: AdjunctComponent, method: string, params: any[]) {
        // High-level property modification (SET/ADD delta)
        // Legacy system did this via raw array mutation. We'll do it via stdData updates.
        if (method === 'rotateY') {
            // Params[0] is delta
            adjunct.stdData.params.rotation[1] += params[0] || 0.1;
            adjunct.isInitialized = false; // Force re-render
        } else if (method === 'moveZ') {
            adjunct.stdData.params.position[2] += params[0] || 0.1;
            adjunct.isInitialized = false;
        }
    }
}
