import { World, ISystem, EntityId } from '../World';
import { CameraComponent, InputStateComponent } from '../components/PlayerComponents';
import { RaycastTargetComponent } from '../components/InteractionComponents';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { SystemMode } from '../types/SystemMode';

/**
 * ECS System for Raycast Selection
 * Replaces the legacy `detect.js` & `control_fpv.js` selecting functionality.
 * Shoots a ray from the active Camera Component center frame every tick.
 *
 * OPTIMIZATION: In Edit Mode, the raycast is skipped when mouseNDC hasn't changed
 * since the last frame (cursor is stationary). This eliminates dozens of unnecessary
 * raycasts per second during idle edit-mode interaction.
 */
export class RaycastInteractionSystem implements ISystem {
    // NDC throttle: skip Edit Mode raycast when cursor hasn't moved
    private _lastNDC: [number, number] = [Infinity, Infinity];

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
        const isPrimary = inputComp.interactPrimary;
        const isSecondary = inputComp.interactSecondary;
        const shouldRaycast = isEdit || isPrimary || isSecondary;

        if (!shouldRaycast) {
            // Reset throttle so the first frame entering Edit Mode always raycasts
            this._lastNDC[0] = Infinity;
            this._lastNDC[1] = Infinity;
            return;
        }

        // In Edit Mode, skip the expensive raycast if the cursor hasn't moved
        // (but always raycast on click frames — primary or secondary)
        const ndcX = inputComp.mouseNDC[0];
        const ndcY = inputComp.mouseNDC[1];
        const ndcUnchanged = isEdit && !isPrimary && !isSecondary &&
            ndcX === this._lastNDC[0] && ndcY === this._lastNDC[1];

        if (ndcUnchanged) return;

        this._lastNDC[0] = ndcX;
        this._lastNDC[1] = ndcY;

        // Perform Raycast via RenderEngine (reuses shared Raycaster instance)
        const hit = world.renderEngine.castRayFromCamera(ndcX, ndcY);

        // Clear Hover states globally
        const targets = world.getEntitiesWith(["RaycastTargetComponent"]);
        targets.forEach((tId: EntityId) => {
            const tComp = world.getComponent<RaycastTargetComponent>(tId, "RaycastTargetComponent");
            if (tComp) {
                tComp.isHovered = false;
                tComp.distanceToCamera = Infinity;
            }
        });

        // Update Hover State of the hitting object
        if (hit) {
            const hitEntityId = hit.entityId as EntityId;
            const hitTargetComp = world.getComponent<RaycastTargetComponent>(hitEntityId, "RaycastTargetComponent");

            if (hitTargetComp) {
                // Restriction: During Edit Mode, only allow focus on the active block or its adjuncts
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

                // Right-click → emit context-interact event (for context menus)
                if (isSecondary && isEdit) {
                    world.emitSimple("context-interact", {
                        entityId: hitEntityId,
                        metadata: hitTargetComp.metadata,
                        distance: hit.distance,
                        point: hit.point,
                        screenPos: [ndcX, ndcY]
                    });
                    return; // Don't also fire primary interact
                }

                if (isPrimary) {
                    console.log(`[Interaction] Selected Entity: ${hitEntityId}`, hitTargetComp.metadata);
                    world.emitSimple("interact", {
                        entityId: hitEntityId,
                        metadata: hitTargetComp.metadata,
                        distance: hit.distance,
                        point: hit.point
                    });
                }
            }
        } else if (isPrimary) {
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
