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
 * since the last frame (cursor is stationary). Only the previously hovered entity
 * is cleared instead of iterating all targets.
 */
export class RaycastInteractionSystem implements ISystem {
    // NDC throttle: skip Edit Mode raycast when cursor hasn't moved
    private _lastNDC: [number, number] = [Infinity, Infinity];
    // Cache last hovered entity to avoid O(n) clearing
    private _lastHoveredId: EntityId | null = null;

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

        // Clear only the previously hovered entity instead of all targets
        if (this._lastHoveredId !== null) {
            const prevComp = world.getComponent<RaycastTargetComponent>(this._lastHoveredId, "RaycastTargetComponent");
            if (prevComp) {
                prevComp.isHovered = false;
                prevComp.distanceToCamera = Infinity;
            }
            this._lastHoveredId = null;
        }

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
                this._lastHoveredId = hitEntityId;

                // Stable content-address key rides along: adjuncts use their
                // adjunctId, blocks use blk:x_y (survives reload re-minting).
                const adj = world.getComponent<AdjunctComponent>(hitEntityId, "AdjunctComponent");
                const blk = world.getComponent<any>(hitEntityId, "BlockComponent");
                const targetKey = adj?.adjunctId
                    ?? (blk ? `blk:${blk.x}_${blk.y}` : undefined);

                // Right-click → interact.context (context menus, Edit mode)
                if (isSecondary && isEdit) {
                    world.events.emit('interact.context', {
                        metadata: hitTargetComp.metadata,
                        distance: hit.distance,
                        point: [hit.point[0], hit.point[1], hit.point[2]],
                        screenPos: [ndcX, ndcY],
                    }, { target: hitEntityId, targetKey, actor: playerId });
                    return; // Don't also fire primary interact
                }

                if (isPrimary) {
                    // Reach gate: gameplay interactions (book/npc/item/attack) only
                    // fire within arm's reach — you shouldn't open a book from across
                    // the map. Edit mode is exempt (place/select at any range).
                    // Measured PLAYER→hit, not camera→hit: the third-person camera
                    // sits metres behind the avatar, so hit.distance overstates reach.
                    // reach = player.capacity.reach (data), default 3.5 m (player.md),
                    // unless a live session raised it (world.interactReach — a ranged
                    // game like the shooting gallery, which the 3.5 m hand-reach gate
                    // would otherwise turn into an unbroken stream of misses).
                    const reach = world.interactReach
                        ?? (Number((world.config.player as any)?.capacity?.reach) || 3.5);
                    const pt = world.getComponent<any>(playerId, "TransformComponent");
                    const playerDist = pt ? Math.hypot(
                        hit.point[0] - pt.position[0],
                        hit.point[1] - pt.position[1],
                        hit.point[2] - pt.position[2],
                    ) : hit.distance;
                    if (!isEdit && playerDist > reach) {
                        // hit something, but out of reach → the client can hint "walk
                        // closer". Carry the target so the client hints ONLY for
                        // genuinely interactable adjuncts (not plain scenery — every
                        // adjunct is a raycast target, so a far wall would misfire).
                        world.events.emit('interact.miss', { reason: 'too_far', distance: playerDist, reach },
                            { target: hitEntityId, targetKey, actor: playerId });
                    } else {
                        console.log(`[Interaction] Selected Entity: ${hitEntityId}`, hitTargetComp.metadata);
                        world.events.emit('interact.primary', {
                            metadata: hitTargetComp.metadata,
                            // PLAYER→hit distance — what consumers mean by "distance"
                            // (DialogueSystem TALK_RANGE, npc.distToPlayer context).
                            // camera→hit would overstate it by the third-person boom
                            // and silently fail every range check downstream.
                            distance: playerDist,
                            point: [hit.point[0], hit.point[1], hit.point[2]],
                        }, { target: hitEntityId, targetKey, actor: playerId });
                    }
                }
            }
        } else if (isPrimary) {
            // Hit nothing → explicit miss event (replaces the entityId:null sentinel)
            world.events.emit('interact.miss', { reason: 'no_target' }, { actor: playerId });
        }
    }
}
