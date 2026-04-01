import { World, EntityId, ISystem } from '../World';
import { TransformComponent, InputStateComponent } from '../components/PlayerComponents';
import { RenderHandle } from '../types/Adjunct';

/**
 * Minimap System
 * Manages the top-down PiP (Picture-in-Picture) camera and player indicator.
 */
export class MinimapSystem implements ISystem {
    private markerMesh: RenderHandle | null = null;
    private world: World | null = null;

    // Interactive State
    public zoom: number = 1.0;
    public isFollowingPlayer: boolean = true;
    public panOffset = { x: 0, y: 0 };

    public update(world: World, dt: number): void {
        this.world = world;

        // 0. Initialization (Marker)
        if (!this.markerMesh) {
            this.markerMesh = world.renderEngine.createMinimapMarker();
        }

        // 1. Update Zoom on Camera
        world.renderEngine.setMinimapZoom(this.zoom);

        // 2. Tracking logic
        const playerEntities = world.getEntitiesWith(["TransformComponent", "InputStateComponent"]);
        if (playerEntities.length > 0) {
            const playerId = playerEntities[0];
            const trans = world.getComponent<TransformComponent>(playerId, "TransformComponent");

            if (trans) {
                // Update Marker Position (In local space or relative to camera)
                if (this.markerMesh) {
                    world.renderEngine.setObjectPosition(this.markerMesh, trans.position[0], 100, trans.position[2]);
                    world.renderEngine.setObjectRotation(this.markerMesh, 0, trans.rotation[1], 0);
                }

                // If following, keep camera above player
                if (this.isFollowingPlayer) {
                    world.renderEngine.setMinimapPosition(
                        trans.position[0] + this.panOffset.x,
                        500,
                        trans.position[2] + this.panOffset.y
                    );
                    world.renderEngine.setMinimapLookAt(
                        trans.position[0] + this.panOffset.x,
                        0,
                        trans.position[2] + this.panOffset.y
                    );
                }
            }
        }
    }

    public setZoom(z: number): void {
        this.zoom = Math.max(0.1, Math.min(10.0, z));
    }

    public toggleFollow(): void {
        this.isFollowingPlayer = !this.isFollowingPlayer;
        if (this.isFollowingPlayer) {
            this.panOffset.x = 0;
            this.panOffset.y = 0;
        }
    }

    public applyPan(dx: number, dz: number): void {
        if (!this.world) return;
        if (this.isFollowingPlayer) {
            this.panOffset.x += dx;
            this.panOffset.y += dz;
        } else {
            const pos = this.world.renderEngine.getMinimapPosition();
            this.world.renderEngine.setMinimapPosition(pos[0] + dx, 500, pos[2] + dz);
        }
    }

    public pickBlockFromMinimap(ndcX: number, ndcY: number): any {
        if (!this.world) return null;
        return this.world.renderEngine.castRayFromMinimap(ndcX, ndcY);
    }
}
