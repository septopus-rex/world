import * as THREE from 'three';
import { World, ISystem } from '../World';
import { TransformComponent, InputStateComponent } from '../components/PlayerComponents';

/**
 * ECS System for Minimap
 * Responsible for syncing the Orthographic Camera and the Player Marker UI
 * to the currently possessed player entity.
 */
export class MinimapSystem implements ISystem {

    private markerMesh: THREE.Mesh;
    private world: World;

    // Interactive State
    public zoom: number = 1.0;
    public isFollowingPlayer: boolean = true;
    public panOffset: THREE.Vector2 = new THREE.Vector2(0, 0);

    constructor(world: World) {
        this.world = world;

        // Create the Player Marker (e.g., a bright red arrow or triangle)
        // Make it substantially larger to be visible from high altitude
        const geometry = new THREE.ConeGeometry(3, 8, 3);

        // By default, Cone origin is at its center of mass.
        // We MUST translate it up by half its height so the origin (pivot point) rests exactly at its flat base.
        geometry.translate(0, 4, 0);

        // Then rotate it to point FORWARD (-Z).
        geometry.rotateX(-Math.PI / 2);

        // Use a neon, highly contrasting color and disable depth test so it never hides behind blocks
        const material = new THREE.MeshBasicMaterial({ color: 0x00ffff, depthTest: false });
        this.markerMesh = new THREE.Mesh(geometry, material);
        this.markerMesh.renderOrder = 999; // Ensure it draws on top of all terrain

        // Elevate it safely above the ground
        this.markerMesh.position.y = 100;

        // Only add to scene, will be updated in loop
        this.world.scene.add(this.markerMesh);
    }

    public update(world: World, dt: number): void {
        // If minimap isn't active, no need to waste CPU syncing camera
        if (!world.pipeline.isMinimapActive) {
            this.markerMesh.visible = false;
            return;
        }

        this.markerMesh.visible = true;

        // Find the controlled player
        const players = world.getEntitiesWith(["TransformComponent", "InputStateComponent"]);
        if (players.length === 0) return;

        const pTrans = world.getComponent<TransformComponent>(players[0], "TransformComponent");
        if (!pTrans) return;

        // 1. Update Zoom on Camera
        const camera = world.pipeline.minimapCamera;
        if (camera.zoom !== this.zoom) {
            camera.zoom = this.zoom;
            camera.updateProjectionMatrix();
        }

        // 2. Calculate Camera Goal Position
        if (this.isFollowingPlayer) {
            // Smoothly or instantly lock to player, plus any temporary pan offset
            camera.position.x = pTrans.position[0] + this.panOffset.x;
            camera.position.z = pTrans.position[2] + this.panOffset.y;
        } else {
            // Keep current position (modified by external Pan calls)
        }

        // 3. Sync Marker to player XZ and Y-rotation
        this.markerMesh.position.x = pTrans.position[0];
        this.markerMesh.position.z = pTrans.position[2];

        // The player rotates on Y. The arrow should point in the direction they are facing.
        this.markerMesh.rotation.y = pTrans.rotation[1];
    }

    /**
     * External API to apply panning deltas
     * @param dx Delta in world units
     * @param dz Delta in world units
     */
    public applyPan(dx: number, dz: number): void {
        const camera = this.world.pipeline.minimapCamera;

        if (this.isFollowingPlayer) {
            // If we are currently following, panning introduces an offset relative to the player
            this.panOffset.x += dx;
            this.panOffset.y += dz;

            // If offset becomes significant, we could optionally detach, 
            // but for now let's keep it relative or let the UI handle detachment.
        } else {
            camera.position.x += dx;
            camera.position.z += dz;
        }
    }

    public setFollow(follow: boolean): void {
        this.isFollowingPlayer = follow;
        if (follow) {
            this.panOffset.set(0, 0);
        }
    }

    /**
     * Performs a Raycast from a screen position using the Minimap Camera
     * @param ndcX Normalized Device Coordinate X (-1 to 1)
     * @param ndcY Normalized Device Coordinate Y (-1 to 1)
     */
    public pickBlockFromMinimap(ndcX: number, ndcY: number): any {
        const raycaster = new THREE.Raycaster();
        const camera = this.world.pipeline.minimapCamera;

        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

        // Intersect with blocks in the scene
        const intersects = raycaster.intersectObjects(this.world.scene.children, true);

        // Filter for meshes that have RaycastTargetComponent metadata
        for (const intersection of intersects) {
            const object = intersection.object;
            // Check if this mesh or its parent belongs to an entity with metadata
            // For now, we search the object hierarchy for any assigned metadata
            let target = object;
            while (target) {
                if (target.userData && target.userData.entityId) {
                    const eid = target.userData.entityId;
                    const meta = this.world.getComponent<any>(eid, "RaycastTargetComponent");
                    if (meta) {
                        return {
                            entityId: eid,
                            type: meta.type,
                            metadata: meta.metadata,
                            point: intersection.point
                        };
                    }
                }
                target = target.parent as THREE.Object3D;
            }
        }

        return null;
    }
}
