import { World, ISystem, EntityId } from '../World';
import { CameraComponent, InputStateComponent } from '../components/PlayerComponents';
import { RaycastTargetComponent } from '../components/InteractionComponents';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { SystemMode } from '../types/SystemMode';

/**
 * ECS System for Raycast Selection
 * Replaces the legacy `detect.js` & `control_fpv.js` selecting functionality.
 * Shoots a ray from the active Camera Component center frame every tick.
 */
export class RaycastInteractionSystem implements ISystem {
    public update(world: World, dt: number): void {
        // Find the active camera entity
        const viewEntities = world.getEntitiesWith(["CameraComponent", "TransformComponent", "InputStateComponent"]);
        if (viewEntities.length === 0) return;

        // For now, assume single player viewpoint
        const playerId = viewEntities[0];
        const cameraComp = world.getComponent<CameraComponent>(playerId, "CameraComponent");
        const inputComp = world.getComponent<InputStateComponent>(playerId, "InputStateComponent");

        if (!cameraComp || !cameraComp.active || !inputComp) return;

        const isEdit = world.mode === SystemMode.Edit;
        const shouldRaycast = isEdit || inputComp.interactPrimary;

        if (!shouldRaycast) return;

        // Perform Raycast via RenderEngine
        // Use mouseNDC (mapping mouse clicks to world objects)
        const hit = world.renderEngine.castRayFromCamera(inputComp.mouseNDC[0], inputComp.mouseNDC[1]);

        // 3. Clear Hover states globally
        const targets = world.getEntitiesWith(["RaycastTargetComponent"]);
        targets.forEach((tId: EntityId) => {
            const tComp = world.getComponent<RaycastTargetComponent>(tId, "RaycastTargetComponent");
            if (tComp) {
                tComp.isHovered = false;
                tComp.distanceToCamera = Infinity;
            }
        });

        // 4. Update Hover State of the hitting object
        if (hit) {
            const hitEntityId = hit.entityId as EntityId;
            const hitTargetComp = world.getComponent<RaycastTargetComponent>(hitEntityId, "RaycastTargetComponent");

            if (hitTargetComp) {
                // Restriction: During Edit Mode, only allow focus on the active block or its adjuncts
                const isEdit = world.mode === SystemMode.Edit;
                const activeBlockId = world.activeEditBlockId;

                if (isEdit && activeBlockId !== null) {
                    let isAllowed = hitEntityId === activeBlockId;
                    if (!isAllowed) {
                        const adj = world.getComponent<AdjunctComponent>(hitEntityId, "AdjunctComponent");
                        if (adj && adj.parentBlockEntityId === activeBlockId) {
                            isAllowed = true;
                        }
                    }
                    if (!isAllowed) return; // Discard hit
                }

                hitTargetComp.isHovered = true;
                hitTargetComp.distanceToCamera = hit.distance;

                if (inputComp.interactPrimary) {
                    console.log(`[Interaction] Selected Entity: ${hitEntityId}`, hitTargetComp.metadata);
                    world.emitSimple("interact", {
                        entityId: hitEntityId,
                        metadata: hitTargetComp.metadata,
                        distance: hit.distance,
                        point: hit.point
                    });
                }
            }
        } else if (inputComp.interactPrimary) {
            // Hit nothing - emit null event for deselection
            world.emitSimple("interact", {
                entityId: null,
                metadata: null,
                distance: Infinity,
                point: [0, 0, 0]
            });
        }
    }
}
