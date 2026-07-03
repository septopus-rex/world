import { World, EntityId } from '../World';
import { TransformComponent, RigidBodyComponent, SolidComponent } from '../components/PlayerComponents';
import { Vector3, Box3 } from '../utils/Math';
import { PHYSICS_CONSTANTS } from '../Constants';

/** Pre-computed solid AABB for fast, allocation-free collision.
 *  (ox/oy/oz = the SolidComponent offset, kept for in-place position refresh.) */
interface SolidEntry {
    px: number; py: number; pz: number;
    ox: number; oy: number; oz: number;
    hx: number; hy: number; hz: number;
}

/**
 * MovementCollider — the substepped AABB integration + collision core for the
 * controlled player, extracted from CharacterController. Owns the solid cache,
 * step-over, ground probing and the moving-platform carry, operating on the
 * body/transform the controller passes in (it has no ECS ownership of its own).
 * Collision always skips the controlled entity itself.
 *
 * SUBSTEPPED — each integration sub-step moves at most STEP_CLAMP metres, so a
 * fast fall or a large frame dt can never tunnel through the thin ground. Low
 * obstacles (<= stepHeight) are auto-stepped onto instead of hard-blocking.
 */
export class MovementCollider {
    private controlledEntity: EntityId | null = null;

    // scratch
    private _playerBox = new Box3();
    private _wallBox = new Box3();
    private _pPos = new Vector3();
    private _wPos = new Vector3();

    // solid cache (rebuilt when solid count changes)
    private _solids: SolidEntry[] = [];
    private _solidIds: EntityId[] = [];
    private _lastSolidCount = -1;

    // ── moving-platform carry ────────────────────────────────────────────────
    /** The solid entity under the player's feet; its frame-to-frame transform
     *  delta is applied to the player (ride lifts, doors, future movers). */
    private _supportEid: EntityId | null = null;
    private _supportLast: [number, number, number] | null = null;

    /** Max metres moved per collision substep (< thinnest ground -> no tunneling). */
    private static readonly STEP_CLAMP = 0.08;
    private static readonly MAX_SUBSTEPS = 48;
    /** Embed-rescue trigger margin: the test box is shrunk by this much per side,
     *  so face contact / step-over snapping (≤ STEP_CLAMP per substep) can never
     *  trip it — only a genuinely-inside placement does. */
    private static readonly EMBED_SHRINK = 0.1;

    /** The controlled player entity — excluded from its own collision tests. */
    public setControlledEntity(entity: EntityId | null): void { this.controlledEntity = entity; }

    /** Drop the moving-platform attachment (on jump, or a sustained airborne streak). */
    public clearSupport(): void { this._supportEid = null; this._supportLast = null; }

    /** Forces a solid-cache rebuild (e.g. after an editor moves an adjunct). */
    public invalidateSolidCache(): void { this._lastSolidCount = -1; }

    public ensureSolidCache(world: World): void {
        const solids = world.queryEntities('SolidComponent');
        if (solids.length === this._lastSolidCount) {
            // Same population: refresh POSITIONS in place. Adjuncts move at
            // runtime (trigger moveZ doors/lifts) and a stale cache would keep
            // colliding at the old pose — the bug that made "open" doors still
            // block until block streaming happened to rebuild the cache.
            for (let i = 0; i < this._solidIds.length; i++) {
                const t = world.getComponent<TransformComponent>(this._solidIds[i], 'TransformComponent');
                if (!t) { this._lastSolidCount = -1; this.ensureSolidCache(world); return; } // entity churn → rebuild
                const entry = this._solids[i];
                entry.px = t.position[0] + entry.ox;
                entry.py = t.position[1] + entry.oy;
                entry.pz = t.position[2] + entry.oz;
            }
            return;
        }
        this._lastSolidCount = solids.length;
        this._solidIds = solids;
        this._solids = solids.map((sid) => {
            const s = world.getComponent<SolidComponent>(sid, 'SolidComponent')!;
            const t = world.getComponent<TransformComponent>(sid, 'TransformComponent');
            const p = t?.position ?? [0, 0, 0];
            return {
                px: p[0] + s.offset[0], py: p[1] + s.offset[1], pz: p[2] + s.offset[2],
                ox: s.offset[0], oy: s.offset[1], oz: s.offset[2],
                hx: s.size[0] / 2, hy: s.size[1] / 2, hz: s.size[2] / 2,
            };
        });
    }

    /**
     * Moving-platform carry: apply the support solid's frame-to-frame transform
     * delta to the player BEFORE integration, so standing on a trigger-driven
     * lift/door rides it instead of having it slide out from underfoot.
     */
    public carrySupport(world: World, _body: RigidBodyComponent, trans: TransformComponent): void {
        const eid = this._supportEid;
        if (eid === null) return;
        const t = world.getComponent<TransformComponent>(eid, 'TransformComponent');
        if (!t) { this._supportEid = null; this._supportLast = null; return; } // support despawned
        if (this._supportLast) {
            const dx = t.position[0] - this._supportLast[0];
            const dy = t.position[1] - this._supportLast[1];
            const dz = t.position[2] - this._supportLast[2];
            if (dx !== 0 || dy !== 0 || dz !== 0) {
                trans.position[0] += dx;
                trans.position[1] += dy;
                trans.position[2] += dz;
                trans.dirty = true;
            }
        }
        this._supportLast = [t.position[0], t.position[1], t.position[2]];
    }

    /**
     * Deep-embed rescue: if the player's SHRUNKEN box is inside a solid, pop
     * them onto the highest overlapped top face. Legit motion can never get
     * here — substeps move ≤ STEP_CLAMP (0.08 m) and both resolvers block at
     * faces, so an embed deeper than EMBED_SHRINK only happens when a spawn,
     * teleport, respawn or authored/animated content PLACES the player inside
     * a solid (the demo spawn once sat inside a spinning showcase pillar: the
     * rotating depenetration axis wedged the player permanently). Returns true
     * if a rescue happened.
     */
    public popOutIfEmbedded(body: RigidBodyComponent, trans: TransformComponent): boolean {
        const shrink = MovementCollider.EMBED_SHRINK;
        const hx = Math.max(0.01, body.size[0] / 2 - shrink);
        const hy = Math.max(0.01, body.size[1] / 2 - shrink);
        const hz = Math.max(0.01, body.size[2] / 2 - shrink);
        let rescued = false;
        // A pop can land inside a HIGHER solid (stacked content) — iterate.
        for (let pass = 0; pass < 4; pass++) {
            const px = trans.position[0] + body.offset[0];
            const py = trans.position[1] + body.offset[1];
            const pz = trans.position[2] + body.offset[2];
            let topY: number | null = null;
            for (let si = 0; si < this._solids.length; si++) {
                if (this._solidIds[si] === this.controlledEntity) continue;
                const w = this._solids[si];
                if (Math.abs(px - w.px) < w.hx + hx &&
                    Math.abs(py - w.py) < w.hy + hy &&
                    Math.abs(pz - w.pz) < w.hz + hz) {
                    const top = w.py + w.hy;
                    if (topY === null || top > topY) topY = top;
                }
            }
            if (topY === null) break;
            trans.position[1] = topY + body.size[1] / 2 - body.offset[1] + PHYSICS_CONSTANTS.EPSILON;
            body.velocity[1] = 0;
            trans.dirty = true;
            rescued = true;
        }
        return rescued;
    }

    /**
     * True if any solid sits in the player's X/Z column at or below the feet —
     * i.e. there IS ground to fall onto. False over an unloaded/streaming block
     * or a genuine void (so the controller hovers instead of free-falling).
     */
    public hasGroundBelow(trans: TransformComponent, body: RigidBodyComponent): boolean {
        const px = trans.position[0] + body.offset[0];
        const pz = trans.position[2] + body.offset[2];
        const feet = trans.position[1] + body.offset[1] - body.size[1] / 2;
        const hx = body.size[0] / 2, hz = body.size[2] / 2;
        for (let si = 0; si < this._solids.length; si++) {
            if (this._solidIds[si] === this.controlledEntity) continue;
            const w = this._solids[si];
            if (Math.abs(px - w.px) <= w.hx + hx && Math.abs(pz - w.pz) <= w.hz + hz) {
                if (w.py + w.hy <= feet + 0.2) return true; // a surface at/below the feet
            }
        }
        return false;
    }

    // ── integrate + collide (SUBSTEPPED, with step-over) ────────────────────
    public integrateAndCollide(world: World, body: RigidBodyComponent, trans: TransformComponent, dt: number, stepHeight: number): void {
        this.ensureSolidCache(world);

        const dxTotal = body.velocity[0] * dt;
        const dyTotal = body.velocity[1] * dt;
        const dzTotal = body.velocity[2] * dt;

        const maxComp = Math.max(Math.abs(dxTotal), Math.abs(dyTotal), Math.abs(dzTotal));
        const n = Math.min(MovementCollider.MAX_SUBSTEPS, Math.max(1, Math.ceil(maxComp / MovementCollider.STEP_CLAMP)));
        const sx = dxTotal / n, sy = dyTotal / n, sz = dzTotal / n;

        body.isGrounded = false;
        for (let i = 0; i < n; i++) {
            this.resolveY(body, trans, sy);
            this.resolveHorizontal(body, trans, sx, 0, stepHeight); // X
            this.resolveHorizontal(body, trans, 0, sz, stepHeight); // Z
        }
        trans.dirty = true;

        // friction on horizontal velocity
        body.velocity[0] *= body.friction;
        body.velocity[2] *= body.friction;
    }

    private resolveY(body: RigidBodyComponent, trans: TransformComponent, sy: number): void {
        if (sy === 0) return;
        const nextY = trans.position[1] + sy;
        this._pPos.set(trans.position[0] + body.offset[0], nextY + body.offset[1], trans.position[2] + body.offset[2]);
        this._playerBox.setFromCenterAndSize(this._pPos, { x: body.size[0], y: body.size[1], z: body.size[2] });

        // Feet/head BEFORE this sub-step's vertical move. The contact must be a real
        // TOP/BOTTOM face hit, not a side clip: resolveHorizontal pushes the player
        // out using a box shrunk by MARGIN, but resolveY tests the FULL box, so a
        // player flush against a wall always overlaps it here by ~MARGIN. Without the
        // face check below, the descending sub-step then read that side overlap as
        // "landed on the wall top" and snapped the player up — the jittery climb up a
        // 2 m wall. Require the feet to have been at/above the top (genuinely coming
        // down onto it); a head/bottom check guards the ceiling case symmetrically.
        const halfH = body.size[1] / 2;
        const prevFeetY = trans.position[1] + body.offset[1] - halfH;
        const prevHeadY = trans.position[1] + body.offset[1] + halfH;
        const tol = PHYSICS_CONSTANTS.MARGIN;

        for (let si = 0; si < this._solids.length; si++) {
            if (this._solidIds[si] === this.controlledEntity) continue;
            const w = this._solids[si];
            this._wPos.set(w.px, w.py, w.pz);
            this._wallBox.setFromCenterAndSize(this._wPos, { x: w.hx * 2, y: w.hy * 2, z: w.hz * 2 });
            if (this._playerBox.intersectsBox(this._wallBox)) {
                if (sy < 0) { // landing — only if the feet came down ONTO the top
                    if (prevFeetY < (w.py + w.hy) - tol) continue; // side clip → ignore here
                    trans.position[1] = (w.py + w.hy) + body.size[1] / 2 - body.offset[1];
                    body.velocity[1] = 0;
                    body.isGrounded = true;
                    this.setSupport(this._solidIds[si]);
                } else { // ceiling — only if the head came up UNDER the bottom
                    if (prevHeadY > (w.py - w.hy) + tol) continue; // side clip → ignore here
                    trans.position[1] = (w.py - w.hy) - body.size[1] / 2 - body.offset[1];
                    body.velocity[1] = 0;
                }
                return;
            }
        }
        trans.position[1] = nextY;
    }

    private resolveHorizontal(body: RigidBodyComponent, trans: TransformComponent, sx: number, sz: number, stepHeight: number): void {
        const move = sx !== 0 ? sx : sz;
        if (move === 0) return;
        const axis = sx !== 0 ? 0 : 2;
        const nextX = trans.position[0] + sx;
        const nextZ = trans.position[2] + sz;
        const margin = PHYSICS_CONSTANTS.MARGIN, eps = PHYSICS_CONSTANTS.EPSILON;

        this._pPos.set(nextX + body.offset[0], trans.position[1] + body.offset[1], nextZ + body.offset[2]);
        this._playerBox.setFromCenterAndSize(this._pPos, {
            x: body.size[0] - margin * 2, y: body.size[1] - eps * 2, z: body.size[2] - margin * 2,
        });

        const feetY = trans.position[1] + body.offset[1] - body.size[1] / 2;

        for (let si = 0; si < this._solids.length; si++) {
            if (this._solidIds[si] === this.controlledEntity) continue;
            const w = this._solids[si];
            this._wPos.set(w.px, w.py, w.pz);
            this._wallBox.setFromCenterAndSize(this._wPos, { x: w.hx * 2, y: w.hy * 2, z: w.hz * 2 });
            if (!this._playerBox.intersectsBox(this._wallBox)) continue;

            // Step-over: climb a LOW CURB at the feet instead of blocking. Three
            // guards keep this from becoming a wall-climb:
            //  • grounded only — airborne, a jump (apex ≈ 1.63 m) auto-grabbed any
            //    ledge within stepHeight of the apex, so a 2 m wall (1.63 + 0.5 > 2)
            //    was climbable. Jumping ONTO a lower platform is unaffected (the apex
            //    clears its top, so resolveY lands it, not here).
            //  • top within stepHeight ABOVE the feet (the curb is low), and
            //  • bottom within stepHeight BELOW the feet — so it's a short curb at
            //    your level, NOT a tall wall you happen to be standing beside the top
            //    of (e.g. on an adjacent raised platform): that wall drops far below
            //    your feet, so dropToBottom rejects it and you can't walk onto it.
            const stepUp = (w.py + w.hy) - feetY;
            const dropToBottom = feetY - (w.py - w.hy);
            if (body.isGrounded && stepUp > 0.001 && stepUp <= stepHeight && dropToBottom <= stepHeight) {
                trans.position[1] = (w.py + w.hy) + body.size[1] / 2 - body.offset[1];
                if (body.velocity[1] < 0) body.velocity[1] = 0;
                body.isGrounded = true;
                this.setSupport(this._solidIds[si]);
                continue; // allow the horizontal move
            }

            // Block: snap to the NEAREST face on this axis (minimum penetration).
            // Using velocity direction instead would teleport the player to the far
            // face when they clip inside the solid from a corner or thin wall.
            if (axis === 0) {
                const toPos = (w.px + w.hx) + body.size[0] / 2 - trans.position[0]; // → east face
                const toNeg = (w.px - w.hx) - body.size[0] / 2 - trans.position[0]; // → west face
                trans.position[0] += Math.abs(toPos) <= Math.abs(toNeg) ? toPos : toNeg;
                body.velocity[0] = 0;
            } else {
                const toPos = (w.pz + w.hz) + body.size[2] / 2 - trans.position[2]; // → south face
                const toNeg = (w.pz - w.hz) - body.size[2] / 2 - trans.position[2]; // → north face
                trans.position[2] += Math.abs(toPos) <= Math.abs(toNeg) ? toPos : toNeg;
                body.velocity[2] = 0;
            }
            return;
        }
        trans.position[0] = nextX;
        trans.position[2] = nextZ;
    }

    /** Record (or switch) the solid under the player's feet. */
    private setSupport(eid: EntityId): void {
        if (this._supportEid !== eid) {
            this._supportEid = eid;
            this._supportLast = null;    // snapshot on the next carry pass
        }
    }
}
