import { World, ISystem, EntityId } from '../World';
import { TransformComponent, RigidBodyComponent, SolidComponent } from '../components/PlayerComponents';
import { Vector3, Box3 } from '../utils/Math';

/**
 * Basic Physics Collision System.
 * Operates purely on AABB intersections and Euler Integration for Gravity.
 * Extremely fast, capable of handling thousands of static walls per frame via simple checks.
 */
export class PhysicsSystem implements ISystem {
    // Math cache to prevent GC
    private _playerPos = new Vector3();
    private _playerHalfSize = new Vector3();
    private _wallPos = new Vector3();
    private _wallHalfSize = new Vector3();
    private _playerBox = new Box3();
    private _wallBox = new Box3();

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

            // Assume we hit nothing
            body.isGrounded = false;

            // --- Y-Axis pass ---
            this._playerPos.set(trans.position[0] + body.offset[0], nextY + body.offset[1], trans.position[2] + body.offset[2]);
            this._playerBox.setFromCenterAndSize(this._playerPos, { x: body.size[0], y: body.size[1], z: body.size[2] });

            for (const sid of solids) {
                if (sid === bid) continue;
                this.updateWallBox(world, sid);

                if (this._playerBox.intersectsBox(this._wallBox)) {
                    if (dy < 0) { // Falling onto surface
                        nextY = (this._wallPos.y + this._wallHalfSize.y) + (body.size[1] / 2) - body.offset[1];
                        body.velocity[1] = 0;
                        body.isGrounded = true;
                    } else if (dy > 0) { // Hitting ceiling
                        nextY = (this._wallPos.y - this._wallHalfSize.y) - (body.size[1] / 2) - body.offset[1];
                        body.velocity[1] = 0;
                    }
                    break;
                }
            }

            // --- X-Axis pass ---
            const epsilon = 0.05;
            const margin = 0.01;
            this._playerPos.set(nextX + body.offset[0], nextY + body.offset[1], trans.position[2] + body.offset[2]);
            this._playerBox.setFromCenterAndSize(this._playerPos, {
                x: body.size[0] - margin * 2,
                y: body.size[1] - epsilon * 2,
                z: body.size[2] - margin * 2
            });

            for (const sid of solids) {
                if (sid === bid) continue;
                this.updateWallBox(world, sid);

                if (this._playerBox.intersectsBox(this._wallBox)) {
                    if (dx > 0) { // Moving right
                        nextX = (this._wallPos.x - this._wallHalfSize.x) - (body.size[0] / 2) - body.offset[0];
                    } else if (dx < 0) { // Moving left
                        nextX = (this._wallPos.x + this._wallHalfSize.x) + (body.size[0] / 2) - body.offset[0];
                    }
                    body.velocity[0] = 0;
                    break;
                }
            }

            // --- Z-Axis pass ---
            this._playerPos.set(nextX + body.offset[0], nextY + body.offset[1], nextZ + body.offset[2]);
            this._playerBox.setFromCenterAndSize(this._playerPos, {
                x: body.size[0] - margin * 2,
                y: body.size[1] - epsilon * 2,
                z: body.size[2] - margin * 2
            });

            for (const sid of solids) {
                if (sid === bid) continue;
                this.updateWallBox(world, sid);

                if (this._playerBox.intersectsBox(this._wallBox)) {
                    if (dz > 0) { // Moving forward (Wait, Protocol Y is Forward -> Engine -Z)
                        // Actually, purely based on Engine Z
                        nextZ = (this._wallPos.z - this._wallHalfSize.z) - (body.size[2] / 2) - body.offset[2];
                    } else if (dz < 0) { // Moving backward
                        nextZ = (this._wallPos.z + this._wallHalfSize.z) + (body.size[2] / 2) - body.offset[2];
                    }
                    body.velocity[2] = 0;
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

        this._wallHalfSize.set(solid.size[0] / 2, solid.size[1] / 2, solid.size[2] / 2);
        this._wallPos.set(
            pos[0] + solid.offset[0],
            pos[1] + solid.offset[1],
            pos[2] + solid.offset[2]
        );
        this._wallBox.setFromCenterAndSize(this._wallPos, { x: solid.size[0], y: solid.size[1], z: solid.size[2] });
    }
}
