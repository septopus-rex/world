import { World, ISystem, EntityId } from '../World';
import { CameraComponent, InputStateComponent } from '../components/PlayerComponents';
import { RaycastTargetComponent } from '../components/InteractionComponents';

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

        // Perform Raycast via RenderEngine (0,0 is center of screen)
        const hit = world.renderEngine.castRayFromCamera(0, 0);

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
                hitTargetComp.isHovered = true;
                hitTargetComp.distanceToCamera = hit.distance;

                // 5. Fire interaction events based on player input 
                if (inputComp.interactPrimary) {
                    console.log(`[Raycast ECS] Interacted with Entity ${hitEntityId}`, hitTargetComp.metadata);
                    world.emitSimple("interact", {
                        entityId: hitEntityId,
                        metadata: hitTargetComp.metadata,
                        distance: hit.distance,
                        point: hit.point
                    });
                }
            }
        }
    }
}
