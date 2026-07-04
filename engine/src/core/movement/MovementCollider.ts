import { World, EntityId } from '../World';
import { TransformComponent, RigidBodyComponent, SolidComponent } from '../components/PlayerComponents';
import { PHYSICS_CONSTANTS } from '../Constants';

/** SolidComponent.shape as branch-cheap int tags. */
const SHAPE_BOX = 0, SHAPE_CYL = 1, SHAPE_SLOPE = 2;

/** Pre-computed solid entry for fast, allocation-free collision.
 *  (ox/oy/oz = the SolidComponent offset, kept for in-place position refresh.)
 *  shape: BOX = AABB · CYL = vertical cylinder, radius = hx (rotation-invariant)
 *  · SLOPE = wedge ramp rising toward local north, yaw = TransformComponent
 *  rotation[1] (engine Y = up, per coordinate.md §3.1) cached as cos/sin. */
interface SolidEntry {
    px: number; py: number; pz: number;
    ox: number; oy: number; oz: number;
    hx: number; hy: number; hz: number;
    shape: number;
    cosY: number; sinY: number;
}

/**
 * MovementCollider — the substepped integration + collision core for the
 * controlled player, extracted from CharacterController. Owns the solid cache,
 * step-over, ground probing and the moving-platform carry, operating on the
 * body/transform the controller passes in (it has no ECS ownership of its own).
 * Collision always skips the controlled entity itself.
 *
 * SHAPES — three solid kinds (see SolidComponent): box = AABB (rotation
 * ignored, the historical default), cylinder = vertical round pillar the player
 * slides around, slope = wedge ramp whose top face is a height FUNCTION
 * (topYAt) — walking uphill is just the step-over branch firing every sub-step.
 * All shape branching lives in footprintOverlap/topYAt + the per-shape block
 * push in resolveHorizontal; everything else consumes those primitives.
 *
 * SUBSTEPPED — each integration sub-step moves at most STEP_CLAMP metres, so a
 * fast fall or a large frame dt can never tunnel through the thin ground. Low
 * obstacles (<= stepHeight) are auto-stepped onto instead of hard-blocking.
 */
export class MovementCollider {
    private controlledEntity: EntityId | null = null;

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
            // Same population: refresh POSITIONS (and slope yaw) in place. Adjuncts
            // move at runtime (trigger moveZ doors/lifts) and a stale cache would
            // keep colliding at the old pose — the bug that made "open" doors still
            // block until block streaming happened to rebuild the cache.
            for (let i = 0; i < this._solidIds.length; i++) {
                const t = world.getComponent<TransformComponent>(this._solidIds[i], 'TransformComponent');
                if (!t) { this._lastSolidCount = -1; this.ensureSolidCache(world); return; } // entity churn → rebuild
                const entry = this._solids[i];
                entry.px = t.position[0] + entry.ox;
                entry.py = t.position[1] + entry.oy;
                entry.pz = t.position[2] + entry.oz;
                if (entry.shape === SHAPE_SLOPE) {
                    const yaw = t.rotation[1] || 0;
                    entry.cosY = Math.cos(yaw); entry.sinY = Math.sin(yaw);
                }
            }
            return;
        }
        this._lastSolidCount = solids.length;
        this._solidIds = solids;
        this._solids = solids.map((sid) => {
            const s = world.getComponent<SolidComponent>(sid, 'SolidComponent')!;
            const t = world.getComponent<TransformComponent>(sid, 'TransformComponent');
            const p = t?.position ?? [0, 0, 0];
            const shape = s.shape === 'cylinder' ? SHAPE_CYL : s.shape === 'slope' ? SHAPE_SLOPE : SHAPE_BOX;
            const yaw = shape === SHAPE_SLOPE ? (t?.rotation[1] || 0) : 0;
            return {
                px: p[0] + s.offset[0], py: p[1] + s.offset[1], pz: p[2] + s.offset[2],
                ox: s.offset[0], oy: s.offset[1], oz: s.offset[2],
                hx: s.size[0] / 2, hy: s.size[1] / 2, hz: s.size[2] / 2,
                shape, cosY: Math.cos(yaw), sinY: Math.sin(yaw),
            };
        });
    }

    // ── shape primitives (the ONLY places that branch on SolidEntry.shape) ──

    /** Horizontal footprint overlap between the player's rect (center cx/cz,
     *  half-extents phx/phz) and a solid. Slope uses the player's bounding
     *  circle against the yaw-rotated rect in slope-local frame. */
    private footprintOverlap(w: SolidEntry, cx: number, cz: number, phx: number, phz: number): boolean {
        if (w.shape === SHAPE_BOX) {
            return Math.abs(cx - w.px) < w.hx + phx && Math.abs(cz - w.pz) < w.hz + phz;
        }
        if (w.shape === SHAPE_CYL) {
            // circle vs rect: clamp the cylinder centre to the player rect
            const qx = Math.max(cx - phx, Math.min(w.px, cx + phx));
            const qz = Math.max(cz - phz, Math.min(w.pz, cz + phz));
            const dx = w.px - qx, dz = w.pz - qz;
            return dx * dx + dz * dz < w.hx * w.hx;
        }
        // slope: player bounding circle vs local rect (world→local = R_y(−yaw))
        const pr = Math.max(phx, phz);
        const dx = cx - w.px, dz = cz - w.pz;
        const lx = dx * w.cosY - dz * w.sinY;
        const lz = dx * w.sinY + dz * w.cosY;
        const ex = lx - Math.max(-w.hx, Math.min(lx, w.hx));
        const ez = lz - Math.max(-w.hz, Math.min(lz, w.hz));
        return ex * ex + ez * ez < pr * pr;
    }

    /** Top-face height under (x,z): constant for box/cylinder; for slope, the
     *  ramp plane — +hy at the local-north edge (lz=−hz) down to −hy at the
     *  local-south edge (lz=+hz), clamped at the edges. Must stay in lockstep
     *  with the wedge geometry in MeshFactory. */
    private topYAt(w: SolidEntry, x: number, z: number): number {
        if (w.shape !== SHAPE_SLOPE) return w.py + w.hy;
        const dx = x - w.px, dz = z - w.pz;
        let lz = dx * w.sinY + dz * w.cosY;
        if (lz < -w.hz) lz = -w.hz; else if (lz > w.hz) lz = w.hz;
        return w.py - w.hy * (lz / w.hz);
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
                if (!this.footprintOverlap(w, px, pz, hx, hz)) continue;
                const top = this.topYAt(w, px, pz);
                if (py - hy < top && py + hy > w.py - w.hy) {
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
            if (this.footprintOverlap(w, px, pz, hx, hz)) {
                if (this.topYAt(w, px, pz) <= feet + 0.2) return true; // a surface at/below the feet
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
        const cx = trans.position[0] + body.offset[0];
        const cz = trans.position[2] + body.offset[2];
        const phx = body.size[0] / 2, phz = body.size[2] / 2;
        const halfH = body.size[1] / 2;
        const pBot = nextY + body.offset[1] - halfH;
        const pTop = nextY + body.offset[1] + halfH;

        // Feet/head BEFORE this sub-step's vertical move. The contact must be a real
        // TOP/BOTTOM face hit, not a side clip: resolveHorizontal pushes the player
        // out using a box shrunk by MARGIN, but resolveY tests the FULL box, so a
        // player flush against a wall always overlaps it here by ~MARGIN. Without the
        // face check below, the descending sub-step then read that side overlap as
        // "landed on the wall top" and snapped the player up — the jittery climb up a
        // 2 m wall. Require the feet to have been at/above the top (genuinely coming
        // down onto it); a head/bottom check guards the ceiling case symmetrically.
        const prevFeetY = trans.position[1] + body.offset[1] - halfH;
        const prevHeadY = trans.position[1] + body.offset[1] + halfH;
        const tol = PHYSICS_CONSTANTS.MARGIN;

        for (let si = 0; si < this._solids.length; si++) {
            if (this._solidIds[si] === this.controlledEntity) continue;
            const w = this._solids[si];
            if (!this.footprintOverlap(w, cx, cz, phx, phz)) continue;
            const top = this.topYAt(w, cx, cz);      // slope: surface under the player
            const bottom = w.py - w.hy;              // wedge underside is flat
            if (pBot >= top || pTop <= bottom) continue;
            if (sy < 0) { // landing — only if the feet came down ONTO the top
                if (prevFeetY < top - tol) continue; // side clip → ignore here
                trans.position[1] = top + halfH - body.offset[1];
                body.velocity[1] = 0;
                body.isGrounded = true;
                this.setSupport(this._solidIds[si]);
            } else { // ceiling — only if the head came up UNDER the bottom
                if (prevHeadY > bottom + tol) continue; // side clip → ignore here
                trans.position[1] = bottom - halfH - body.offset[1];
                body.velocity[1] = 0;
            }
            return;
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

        // Margin-shrunk player box at the CANDIDATE position (same shrink as before).
        const cx = nextX + body.offset[0];
        const cy = trans.position[1] + body.offset[1];
        const cz = nextZ + body.offset[2];
        const phx = body.size[0] / 2 - margin;
        const phy = body.size[1] / 2 - eps;
        const phz = body.size[2] / 2 - margin;

        const feetY = trans.position[1] + body.offset[1] - body.size[1] / 2;

        for (let si = 0; si < this._solids.length; si++) {
            if (this._solidIds[si] === this.controlledEntity) continue;
            const w = this._solids[si];
            if (!this.footprintOverlap(w, cx, cz, phx, phz)) continue;
            const top = this.topYAt(w, cx, cz);      // slope: surface at the candidate spot
            if (cy - phy >= top || cy + phy <= w.py - w.hy) continue; // vertically clear

            const stepUp = top - feetY;

            // SLOPE: the top face is a continuous walkable plane — "about to step
            // onto it" never ends, so the grounded gate below (which flickers off
            // every other standing frame: vy=0 skips the landing probe) cannot
            // apply. Within step reach the player RIDES the surface — snapped to
            // the plane whenever the feet are at/under it and not jumping (vy>0
            // rises through freely; resolveY lands the descent). A walkable-grade
            // contact is never horizontally blocked; only a too-steep approach
            // (the vertical back/side of the wedge) falls through to the push-out.
            if (w.shape === SHAPE_SLOPE && stepUp <= stepHeight) {
                if (stepUp > 0.001 && body.velocity[1] <= 0.01) {
                    trans.position[1] = top + body.size[1] / 2 - body.offset[1];
                    if (body.velocity[1] < 0) body.velocity[1] = 0;
                    body.isGrounded = true;
                    this.setSupport(this._solidIds[si]);
                }
                continue; // allow the horizontal move
            }

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
            const dropToBottom = feetY - (w.py - w.hy);
            if (body.isGrounded && stepUp > 0.001 && stepUp <= stepHeight && dropToBottom <= stepHeight) {
                trans.position[1] = top + body.size[1] / 2 - body.offset[1];
                if (body.velocity[1] < 0) body.velocity[1] = 0;
                body.isGrounded = true;
                this.setSupport(this._solidIds[si]);
                continue; // allow the horizontal move
            }

            // Block: push out to the nearest surface (minimum penetration). Using
            // velocity direction instead would teleport the player to the far face
            // when they clip inside the solid from a corner or thin wall.
            if (w.shape === SHAPE_CYL) {
                // Snap along the moving axis to the circle tangent point (player as
                // a bounding circle) — sliding around the pillar falls out of the
                // other axis running its own pass.
                const pr = Math.max(phx, phz);
                const rSum = w.hx + pr;
                const cross = axis === 0 ? (cz - w.pz) : (cx - w.px);
                const gap2 = rSum * rSum - cross * cross;
                if (gap2 <= 0) continue; // grazing the silhouette edge — no real block
                const gap = Math.sqrt(gap2);
                if (axis === 0) {
                    const side = (trans.position[0] + body.offset[0]) >= w.px ? 1 : -1;
                    trans.position[0] = w.px + side * gap - body.offset[0];
                    body.velocity[0] = 0;
                } else {
                    const side = (trans.position[2] + body.offset[2]) >= w.pz ? 1 : -1;
                    trans.position[2] = w.pz + side * gap - body.offset[2];
                    body.velocity[2] = 0;
                }
            } else if (w.shape === SHAPE_SLOPE) {
                // Too steep here (a side/back-face approach — walkable-grade
                // contact already continued above): minimum-translation push of
                // the player's bounding circle out of the local rect, rotated
                // back to world. Applied to both axes (the rect is yaw-rotated,
                // so the push direction generally isn't axis-aligned).
                const pr = Math.max(phx, phz);
                const dx0 = cx - w.px, dz0 = cz - w.pz;
                const lx = dx0 * w.cosY - dz0 * w.sinY;
                const lz = dx0 * w.sinY + dz0 * w.cosY;
                const qx = Math.max(-w.hx, Math.min(lx, w.hx));
                const qz = Math.max(-w.hz, Math.min(lz, w.hz));
                let pushLx = 0, pushLz = 0;
                if (lx === qx && lz === qz) { // centre inside: exit the nearest local face
                    const exitX = (w.hx - Math.abs(lx)) + pr;
                    const exitZ = (w.hz - Math.abs(lz)) + pr;
                    if (exitX < exitZ) pushLx = lx >= 0 ? exitX : -exitX;
                    else pushLz = lz >= 0 ? exitZ : -exitZ;
                } else {
                    const ex = lx - qx, ez = lz - qz;
                    const d = Math.hypot(ex, ez);
                    const need = pr - d;
                    if (need <= 0 || d < 1e-6) continue; // grazing — no real block
                    pushLx = (ex / d) * need; pushLz = (ez / d) * need;
                }
                // local → world: R_y(yaw)
                trans.position[0] = nextX + (pushLx * w.cosY + pushLz * w.sinY);
                trans.position[2] = nextZ + (-pushLx * w.sinY + pushLz * w.cosY);
                body.velocity[axis] = 0;
            } else if (axis === 0) {
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
