import { World, ISystem, EntityId } from '../World';
import { TransformComponent, RigidBodyComponent, SolidComponent } from '../components/PlayerComponents';
import { Vector3, Box3 } from '../utils/Math';
import { ENGINE_CONSTANTS, PHYSICS_CONSTANTS } from '../Constants';

/** Pre-computed solid data for cache-efficient collision checks. */
interface SolidEntry {
    px: number; py: number; pz: number;       // world centre (pos + offset)
    hx: number; hy: number; hz: number;       // half-sizes
    sx: number; sy: number; sz: number;       // full sizes (for AABB helpers)
}

/**
 * Basic Physics Collision System.
 * Operates purely on AABB intersections and Euler Integration for Gravity.
 * Extremely fast, capable of handling thousands of static walls per frame via simple checks.
 *
 * OPTIMIZATION: Solid component data is pre-computed into a flat SolidEntry cache.
 * The cache is rebuilt only when the number of solid entities changes.
 */
export class PhysicsSystem implements ISystem {
    // Math cache to prevent GC
    private _playerPos = new Vector3();
    private _playerHalfSize = new Vector3();
    private _wallPos = new Vector3();
    private _wallHalfSize = new Vector3();
    private _playerBox = new Box3();
    private _wallBox = new Box3();

    // Solid cache
    private _solidCache: SolidEntry[] = [];
    private _lastSolidCount: number = -1;

    // Constant parameters
    public globalGravity = ENGINE_CONSTANTS.GRAVITY;

    public update(world: World, dt: number): void {
        const bodies = world.queryEntities("RigidBodyComponent");
        const solids = world.queryEntities("SolidComponent");

        // Rebuild solid cache only when the solid count changes
        if (solids.length !== this._lastSolidCount) {
            this._lastSolidCount = solids.length;
            this._solidCache = solids.map(sid => {
                const solid = world.getComponent<SolidComponent>(sid, "SolidComponent")!;
                const trans = world.getComponent<TransformComponent>(sid, "TransformComponent");
                const pos = trans?.position ?? [0, 0, 0];
                return {
                    px: pos[0] + solid.offset[0],
                    py: pos[1] + solid.offset[1],
                    pz: pos[2] + solid.offset[2],
                    hx: solid.size[0] / 2,
                    hy: solid.size[1] / 2,
                    hz: solid.size[2] / 2,
                    sx: solid.size[0],
                    sy: solid.size[1],
                    sz: solid.size[2],
                };
            });
        }

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

            for (let si = 0; si < this._solidCache.length; si++) {
                if (solids[si] === bid) continue;
                const w = this._solidCache[si];
                this._wallPos.set(w.px, w.py, w.pz);
                this._wallHalfSize.set(w.hx, w.hy, w.hz);
                this._wallBox.setFromCenterAndSize(this._wallPos, { x: w.sx, y: w.sy, z: w.sz });

                if (this._playerBox.intersectsBox(this._wallBox)) {
                    if (dy < 0) { // Falling onto surface
                        nextY = (w.py + w.hy) + (body.size[1] / 2) - body.offset[1];
                        body.velocity[1] = 0;
                        body.isGrounded = true;
                    } else if (dy > 0) { // Hitting ceiling
                        nextY = (w.py - w.hy) - (body.size[1] / 2) - body.offset[1];
                        body.velocity[1] = 0;
                    }
                    break;
                }
            }

            // --- X-Axis pass ---
            const epsilon = PHYSICS_CONSTANTS.EPSILON;
            const margin = PHYSICS_CONSTANTS.MARGIN;
            this._playerPos.set(nextX + body.offset[0], nextY + body.offset[1], trans.position[2] + body.offset[2]);
            this._playerBox.setFromCenterAndSize(this._playerPos, {
                x: body.size[0] - margin * 2,
                y: body.size[1] - epsilon * 2,
                z: body.size[2] - margin * 2
            });

            for (let si = 0; si < this._solidCache.length; si++) {
                if (solids[si] === bid) continue;
                const w = this._solidCache[si];
                this._wallPos.set(w.px, w.py, w.pz);
                this._wallHalfSize.set(w.hx, w.hy, w.hz);
                this._wallBox.setFromCenterAndSize(this._wallPos, { x: w.sx, y: w.sy, z: w.sz });

                if (this._playerBox.intersectsBox(this._wallBox)) {
                    if (dx > 0) { // Moving right
                        nextX = (w.px - w.hx) - (body.size[0] / 2) - body.offset[0];
                    } else if (dx < 0) { // Moving left
                        nextX = (w.px + w.hx) + (body.size[0] / 2) - body.offset[0];
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

            for (let si = 0; si < this._solidCache.length; si++) {
                if (solids[si] === bid) continue;
                const w = this._solidCache[si];
                this._wallPos.set(w.px, w.py, w.pz);
                this._wallHalfSize.set(w.hx, w.hy, w.hz);
                this._wallBox.setFromCenterAndSize(this._wallPos, { x: w.sx, y: w.sy, z: w.sz });

                if (this._playerBox.intersectsBox(this._wallBox)) {
                    if (dz > 0) { // Moving forward (Protocol Y is Forward -> Engine -Z)
                        nextZ = (w.pz - w.hz) - (body.size[2] / 2) - body.offset[2];
                    } else if (dz < 0) { // Moving backward
                        nextZ = (w.pz + w.hz) + (body.size[2] / 2) - body.offset[2];
                    }
                    body.velocity[2] = 0;
                    break;
                }
            }

            // 3. Finalize
            trans.position[0] = nextX;
            trans.position[1] = nextY;
            trans.position[2] = nextZ;
            trans.dirty = true;

            // Friction (Deaccelerate XZ velocity smoothly if no input is holding it up)
            body.velocity[0] *= body.friction;
            body.velocity[2] *= body.friction;
        }
    }

    /**
     * Forces a rebuild of the solid cache on the next update tick.
     * Call this if a solid object has moved (e.g. an editor-placed adjunct).
     */
    public invalidateSolidCache(): void {
        this._lastSolidCount = -1;
    }
}
