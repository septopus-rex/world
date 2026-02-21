import * as THREE from 'three';
import { World, ISystem, EntityId } from '../World';
import { TransformComponent, CameraComponent, InputStateComponent } from '../components/PlayerComponents';
import { RaycastTargetComponent } from '../components/InteractionComponents';

/**
 * ECS System for Raycast Selection
 * Replaces the legacy `detect.js` & `control_fpv.js` selecting functionality.
 * Shoots a ray from the active Camera Component center frame every tick.
 */
export class RaycastInteractionSystem implements ISystem {
    private raycaster = new THREE.Raycaster();
    private centerPointer = new THREE.Vector2(0, 0); // Always center for FPV

    public update(world: World, dt: number): void {
        // Find the active camera entity
        const viewEntities = world.getEntitiesWith(["CameraComponent", "TransformComponent", "InputStateComponent"]);
        if (viewEntities.length === 0) return;

        // For now, assume single player viewpoint
        const playerId = viewEntities[0];
        const cameraComp = world.getComponent<CameraComponent>(playerId, "CameraComponent");
        const inputComp = world.getComponent<InputStateComponent>(playerId, "InputStateComponent");

        if (!cameraComp || !cameraComp.active || !inputComp) return;

        // The World's actual THREE.PerspectiveCamera is maintained by the orchestrator, 
        // but we need it to cast from. Assuming `world.camera` exists, or we recreate the math.
        // We will query the scene meshes.

        // Update raycaster using the Three.js active camera
        if (!world.camera) return;
        this.raycaster.setFromCamera(this.centerPointer, world.camera);

        // 1. Raycast against all interactive meshes in the scene
        // We query the physics group or the entire scene.
        const intersects = this.raycaster.intersectObjects(world.scene.children, true);

        // 2. Filter to the nearest valid target
        let nearestValidTarget = null;
        for (const hit of intersects) {
            // Must have UserData to be considered an interactable ECS target
            if (hit.object && hit.object.userData && hit.object.userData.entityId !== undefined) {
                nearestValidTarget = hit;
                break; // Because intersects are sorted by distance natively
            }
        }

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
        if (nearestValidTarget) {
            const hitEntityId = nearestValidTarget.object.userData.entityId as EntityId;
            const hitTargetComp = world.getComponent<RaycastTargetComponent>(hitEntityId, "RaycastTargetComponent");

            if (hitTargetComp) {
                hitTargetComp.isHovered = true;
                hitTargetComp.distanceToCamera = nearestValidTarget.distance;

                // 5. Fire interaction events based on player input 
                // Since `inputComp.interactPrimary` is a single-frame flag from PlayerControlSystem
                if (inputComp.interactPrimary) {
                    // Fire global event via World ECS EventBus (to be dispatched or handled elsewhere)
                    // Currently World uses legacy `listeners` map for events.
                    console.log(`[Raycast ECS] Interacted with Entity ${hitEntityId}`, hitTargetComp.metadata);
                    world.emitSimple("interact", {
                        entityId: hitEntityId,
                        metadata: hitTargetComp.metadata,
                        distance: nearestValidTarget.distance,
                        point: nearestValidTarget.point
                    });
                }
            }
        }
    }
}
