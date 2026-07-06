import { World, ISystem, EntityId } from '../World';
import { AdjunctType } from '../types/AdjunctType';
import { Coords } from '../utils/Coords';
import { SystemMode } from '../types/SystemMode';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { BlockComponent } from '../components/BlockComponent';
import { TransformComponent, RigidBodyComponent } from '../components/PlayerComponents';

/**
 * CoasterSystem — rides a cart (the player) along a coaster track that was
 * COLLAPSED FROM SPP. The visible rail is the c1 track pieces (coaster theme);
 * the ride PATH is built here from the same b6 source cells (cell centers, in
 * authored order) in world-engine coords, so visuals and motion both derive
 * from the SPP source.
 *
 * Active only in GAME mode: on entering Game mode the player is mounted (snapped
 * to the path start) and carried kinematically along the rail; reaching the end
 * sets globalFlags.coaster_complete. Leaving Game mode dismounts. The cart is
 * kinematic (position forced + velocity zeroed + grounded), so the normal
 * controller/physics/fall logic doesn't fight it.
 */
const RIDE_SPEED = 8;        // metres/second along the rail
const SEAT_HEIGHT = 1.0;     // player sits this far above the rail centerline

export class CoasterSystem implements ISystem {
    private path: [number, number, number][] | null = null;
    private segLen: number[] = [];
    private total = 0;
    private cartS = 0;
    private mounted = false;

    public update(world: World, dt: number): void {
        if (world.mode !== SystemMode.Game) {
            this.mounted = false;
            this.cartS = 0;
            world.rideActive = false;
            return;
        }
        if (!this.path) this.buildPath(world);
        if (!this.path || this.path.length < 2) { world.rideActive = false; return; }

        const player = world.queryEntities('TransformComponent', 'InputStateComponent')[0];
        if (player === undefined) { world.rideActive = false; return; }
        const trans = world.getComponent<TransformComponent>(player, 'TransformComponent');
        if (!trans) { world.rideActive = false; return; }

        if (!this.mounted) { this.cartS = 0; this.mounted = true; } // snap to start
        // The rail now owns the player's position — freeze zone tracking so a rail
        // that leaves the block doesn't auto-exit Game (see GameZoneSystem).
        world.rideActive = true;

        this.cartS = Math.min(this.total, this.cartS + RIDE_SPEED * dt);
        const p = this.pointAt(this.cartS);
        trans.position[0] = p[0];
        trans.position[1] = p[1] + SEAT_HEIGHT;
        trans.position[2] = p[2];
        trans.dirty = true;

        // Keep the kinematic cart from fighting gravity/fall logic.
        const body = world.getComponent<RigidBodyComponent>(player, 'RigidBodyComponent');
        if (body) {
            body.velocity[0] = body.velocity[1] = body.velocity[2] = 0;
            body.isGrounded = true;
        }

        if (this.cartS >= this.total - 1e-3) {
            (world.globalFlags as any).coaster_complete = true;
        }
    }

    /** Build the ride path from the b6 coaster source's cells (world-engine). */
    private buildPath(world: World): void {
        for (const eid of world.getEntitiesWith(['AdjunctComponent'])) {
            const a = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent');
            const std: any = a?.stdData;
            if (!std || std.typeId !== AdjunctType.Spp || std.theme !== 'coaster' || !Array.isArray(std.cells)) continue;
            const blockEid = a!.parentBlockEntityId;
            const block = blockEid != null ? world.getComponent<BlockComponent>(blockEid, 'BlockComponent') : null;
            if (!block) continue;

            const origin = [std.ox ?? 0, std.oy ?? 0, std.oz ?? 0];
            const pts: [number, number, number][] = [];
            for (const cell of std.cells) {
                const s = 4 * Math.pow(0.5, cell.level ?? 0);
                const center: [number, number, number] = [
                    origin[0] + cell.position[0] * s + s / 2,
                    origin[1] + cell.position[1] * s + s / 2,
                    origin[2] + cell.position[2] * s + s / 2,
                ];
                const e = Coords.septopusToEngine(center, [block.x, block.y]);
                e[1] += block.elevation || 0;
                pts.push(e);
            }
            if (pts.length < 2) return;

            this.path = pts;
            this.segLen = [];
            this.total = 0;
            for (let i = 1; i < pts.length; i++) {
                const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
                this.segLen.push(d);
                this.total += d;
            }
            return;
        }
    }

    /** Point at arc-length s along the polyline path. */
    private pointAt(s: number): [number, number, number] {
        const pts = this.path!;
        if (s <= 0) return [pts[0][0], pts[0][1], pts[0][2]];
        let acc = 0;
        for (let i = 0; i < this.segLen.length; i++) {
            if (acc + this.segLen[i] >= s) {
                const t = this.segLen[i] > 0 ? (s - acc) / this.segLen[i] : 0;
                return [
                    pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
                    pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t,
                    pts[i][2] + (pts[i + 1][2] - pts[i][2]) * t,
                ];
            }
            acc += this.segLen[i];
        }
        const last = pts[pts.length - 1];
        return [last[0], last[1], last[2]];
    }

    /** Diagnostics/tests. */
    public getRideState(): { mounted: boolean; cartS: number; total: number } {
        return { mounted: this.mounted, cartS: this.cartS, total: this.total };
    }
}
