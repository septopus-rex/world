import { World, ISystem, EntityId } from '../World';
import { TriggerComponent, TriggerAction } from '../components/TriggerComponent';
import { TransformComponent } from '../components/PlayerComponents';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { Vector3 } from '../utils/Math';

/**
 * TriggerSystem handles logic for spatial triggers.
 */
export class TriggerSystem implements ISystem {

    public update(world: World, deltaTime: number): void {
        const triggerEntities = world.queryEntities("TriggerComponent");
        const playerEntities = world.queryEntities("TransformComponent");

        if (playerEntities.length === 0) return;

        const playerId = playerEntities[0];
        const playerTransform = world.getComponent<TransformComponent>(playerId, "TransformComponent");
        if (!playerTransform) return;

        const playerPos = new Vector3(
            playerTransform.position[0],
            playerTransform.position[1],
            playerTransform.position[2]
        );

        for (const entityId of triggerEntities) {
            const trigger = world.getComponent<TriggerComponent>(entityId, "TriggerComponent");
            const transform = world.getComponent<TransformComponent>(entityId, "TransformComponent");

            if (!trigger || !transform) continue;

            const triggerPos = new Vector3(
                transform.position[0] + trigger.offset[0],
                transform.position[1] + trigger.offset[1],
                transform.position[2] + trigger.offset[2]
            );

            let isInside = false;
            if (trigger.shape === 'sphere') {
                const dx = playerPos.x - triggerPos.x;
                const dy = playerPos.y - triggerPos.y;
                const dz = playerPos.z - triggerPos.z;
                const distSq = dx * dx + dy * dy + dz * dz;
                isInside = distSq < trigger.size[0] * trigger.size[0];
            } else {
                const half = new Vector3(trigger.size[0] / 2, trigger.size[1] / 2, trigger.size[2] / 2);
                isInside = (
                    Math.abs(playerPos.x - triggerPos.x) < half.x &&
                    Math.abs(playerPos.y - triggerPos.y) < half.y &&
                    Math.abs(playerPos.z - triggerPos.z) < half.z
                );
            }

            const wasInside = trigger.entitiesInside.has(playerId);

            if (isInside && !wasInside) {
                this.handleEvent(world, trigger, 'in');
                trigger.entitiesInside.add(playerId);
            } else if (!isInside && wasInside) {
                this.handleEvent(world, trigger, 'out');
                trigger.entitiesInside.delete(playerId);
            } else if (isInside) {
                this.handleEvent(world, trigger, 'hold');
            }
        }
    }

    private handleEvent(world: World, trigger: TriggerComponent, type: string) {
        const event = trigger.events.find(e => e.type === type);
        if (!event) return;
        if (event.oneTime && (trigger.triggeredCount[type] || 0) > 0) return;

        for (const action of event.actions) {
            this.executeAction(world, action);
        }

        trigger.triggeredCount[type] = (trigger.triggeredCount[type] || 0) + 1;
    }

    private executeAction(world: World, action: TriggerAction) {
        if (action.type === 'adjunct') {
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
            if (action.method === 'log') {
                console.log(`[TriggerSystem Action Log]:`, ...action.params);
            }
        }
    }

    private applyAdjunctModification(adjunct: AdjunctComponent, method: string, params: any[]) {
        if (method === 'rotateY') {
            adjunct.stdData.ry += params[0] || 0.1;
            adjunct.isInitialized = false;
        } else if (method === 'moveZ') {
            adjunct.stdData.oz += params[0] || 0.1;
            adjunct.isInitialized = false;
        }
    }
}
