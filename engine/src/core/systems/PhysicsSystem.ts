import * as THREE from 'three';
import { World, ISystem, EntityId } from '../World';
import { TransformComponent, RigidBodyComponent, SolidComponent } from '../components/PlayerComponents';

/**
 * Basic Physics Collision System.
 * Operates purely on AABB intersections and Euler Integration for Gravity.
 * Extremely fast, capable of handling thousands of static walls per frame via simple checks.
 */
export class PhysicsSystem implements ISystem {
    // Math cache to prevent GC
    private _playerBox = new THREE.Box3();
    private _wallBox = new THREE.Box3();
    private _vecA = new THREE.Vector3();
    private _vecB = new THREE.Vector3();

    // Constant parameters
    public globalGravity = -9.81 * 2; // Doubled for game feel

    public update(world: World, dt: number): void {
        const bodies = world.queryEntities("RigidBodyComponent");
        const solids = world.queryEntities("SolidComponent");

        for (const bid of bodies) {
            const body = world.getComponent<RigidBodyComponent>(bid, "RigidBodyComponent");
            const trans = world.getComponent<TransformComponent>(bid, "TransformComponent");
            if (!body || !trans) continue;

            // 1. Integration (Apply Gravity over time)
            if (!body.isGrounded) {
                body.velocity[1] += this.globalGravity * dt;
            }

            // 2. Predict the new desired position (Velocity integration)
            const dx = body.velocity[0] * dt;
            const dy = body.velocity[1] * dt;
            const dz = body.velocity[2] * dt;

            let nextX = trans.position[0] + dx;
            let nextY = trans.position[1] + dy;
            let nextZ = trans.position[2] + dz;

            // Define the player's predicted AABB for collision sweep
            this._vecB.set(body.size[0] / 2, body.size[1] / 2, body.size[2] / 2);

            // Assume we hit nothing
            body.isGrounded = false;

            // Extremely basic collision resolution loop
            // Professional engines would sweep each axis independently.
            // For now, we do a basic X, Y, Z discrete test.

            // Y-Axis pass (Gravity / Jumping against ceilings/floors)
            this._vecA.set(trans.position[0] + body.offset[0], nextY + body.offset[1], trans.position[2] + body.offset[2]);
            this._playerBox.setFromCenterAndSize(this._vecA, this._vecB.clone().multiplyScalar(2));

            for (const sid of solids) {
                if (sid === bid) continue;
                this.updateWallBox(world, sid);
                if (this._playerBox.intersectsBox(this._wallBox)) {
                    if (dy < 0) body.isGrounded = true; // Hit floor!
                    body.velocity[1] = 0; // Stop Y movement
                    nextY = trans.position[1]; // Revert to safe position
                    break;
                }
            }

            // X-Axis pass
            this._vecA.set(nextX + body.offset[0], nextY + body.offset[1], trans.position[2] + body.offset[2]);
            this._playerBox.setFromCenterAndSize(this._vecA, this._vecB.clone().multiplyScalar(2));
            for (const sid of solids) {
                if (sid === bid) continue;
                this.updateWallBox(world, sid);
                if (this._playerBox.intersectsBox(this._wallBox)) {
                    body.velocity[0] = 0; // Stop X movement (Slide)
                    nextX = trans.position[0];
                    break;
                }
            }

            // Z-Axis pass
            this._vecA.set(nextX + body.offset[0], nextY + body.offset[1], nextZ + body.offset[2]);
            this._playerBox.setFromCenterAndSize(this._vecA, this._vecB.clone().multiplyScalar(2));
            for (const sid of solids) {
                if (sid === bid) continue;
                this.updateWallBox(world, sid);
                if (this._playerBox.intersectsBox(this._wallBox)) {
                    body.velocity[2] = 0; // Stop Z movement (Slide)
                    nextZ = trans.position[2];
                    break;
                }
            }

            // 3. Finalize
            trans.position[0] = nextX;
            trans.position[1] = nextY;
            trans.position[2] = nextZ;

            // Friction (Deaccelerate XZ velocity smoothly if no input is holding it up)
            body.velocity[0] *= body.friction;
            body.velocity[2] *= body.friction;
        }
    }

    private updateWallBox(world: World, entityId: EntityId): void {
        const solid = world.getComponent<SolidComponent>(entityId, "SolidComponent")!;
        const trans = world.getComponent<TransformComponent>(entityId, "TransformComponent");

        const pos = trans?.position || [0, 0, 0];

        this._vecB.set(solid.size[0] / 2, solid.size[1] / 2, solid.size[2] / 2);
        this._vecA.set(
            pos[0] + solid.offset[0],
            pos[1] + solid.offset[1],
            pos[2] + solid.offset[2]
        );
        this._wallBox.setFromCenterAndSize(this._vecA, this._vecB.clone().multiplyScalar(2));
    }
}
