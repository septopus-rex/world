import { World, ISystem, EntityId } from '../World';
import { AdjunctType } from '../types/AdjunctType';
import { SystemMode } from '../types/SystemMode';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { BlockComponent } from '../components/BlockComponent';
import { TransformComponent, RigidBodyComponent } from '../components/PlayerComponents';

/**
 * CoasterSystem — rides a cart (the player) along a coaster track that was
 * COLLAPSED FROM SPP. The visible rail is the c1 track pieces (coaster theme);
 * the ride PATH is built from the same b6 source cells (cell centers, in
 * authored order) in world-engine coords, so visuals and motion both derive
 * from the SPP source.
 *
 * THE TRACK ADJUNCT IS THE DECLARATION. A ride belongs to the block its b6
 * source sits on — exactly the way a mahjong table belongs to its block: drop
 * the same block data on two coordinates and you get two rides, each ridden on
 * its own rail, with no coordinate known to any host. The anchor is
 * `world.activeGameBlock` (the block whose game session is running, frozen at
 * entry by World.setMode so a rail crossing a block boundary can't retarget the
 * ride mid-flight) — the same anchor Pool/Mahjong/Shooting/Tumble key on.
 *
 * This used to be a WORLD SINGLETON: buildPath scanned every entity, took the
 * FIRST coaster-themed b6 it met, and cached that path forever. Three bugs fell
 * out of the one shortcut (all three regression-tested in
 * tests/scenarios/coaster-ride.test.ts):
 *   · two coasters in one world → you rode whichever one entity iteration met
 *     first, no matter where you actually boarded;
 *   · no zone binding → ANY Game-mode entry mounted the player. In the gallery
 *     world (it embeds the coaster level, and the corridor has a holdem table)
 *     sitting down at the cards yanked you onto the rail;
 *   · the path outlived its session → after one ride every later Game entry
 *     re-mounted the OLD path, whose block may be long evicted. And
 *     GameZoneSystem freezes zone tracking while `rideActive`, so the hijack was
 *     sticky — you could not walk out of it.
 *
 * Active only in GAME mode: entering Game in a block that carries a track mounts
 * the player (snapped to the path start) and carries them kinematically along
 * the rail; reaching the end sets globalFlags.coaster_complete. Leaving Game
 * mode — or entering Game in a block with no track — dismounts. The cart is
 * kinematic (position forced + velocity zeroed + grounded), so the normal
 * controller/physics/fall logic doesn't fight it.
 */
const RIDE_SPEED = 8;        // metres/second along the rail
const SEAT_HEIGHT = 1.0;     // player sits this far above the rail centerline

/** A ride in progress. Scoped to ONE game session — never reused across two. */
interface Ride {
    /** The block whose session started this ride (its rail is the one being ridden). */
    block: [number, number];
    key: string;                            // `x_y` of `block`
    path: [number, number, number][];
    segLen: number[];
    total: number;
    cartS: number;
}

export class CoasterSystem implements ISystem {
    /** Null between rides. There is deliberately no path cache: building one is a
     *  handful of cells, and every cached path this System ever kept was wrong by
     *  the next session. */
    private ride: Ride | null = null;

    private static key(block: [number, number]): string { return `${block[0]}_${block[1]}`; }

    public update(world: World, dt: number): void {
        // Whose game is running? (null outside Game mode.)
        const anchor = world.mode === SystemMode.Game ? world.activeGameBlock : null;
        if (!anchor) { this.dismount(world); return; }

        const key = CoasterSystem.key(anchor);
        if (this.ride && this.ride.key !== key) this.dismount(world);  // boarded a different ride
        if (!this.ride) {
            const built = this.buildRide(world, anchor);
            // No rail on this block: this game zone belongs to some other game.
            // Leave the player alone — the absence of this line is what hijacked
            // every card game / shooting range in a world that had a coaster in it.
            if (!built) { world.rideActive = false; return; }
            this.ride = built;
        }
        const ride = this.ride;

        const player = world.queryEntities('TransformComponent', 'InputStateComponent')[0];
        if (player === undefined) { world.rideActive = false; return; }
        const trans = world.getComponent<TransformComponent>(player, 'TransformComponent');
        if (!trans) { world.rideActive = false; return; }

        // The rail now owns the player's position — freeze zone tracking so a rail
        // that leaves the block doesn't auto-exit Game (see GameZoneSystem).
        world.rideActive = true;

        ride.cartS = Math.min(ride.total, ride.cartS + RIDE_SPEED * dt);
        const p = this.pointAt(ride, ride.cartS);
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

        if (ride.cartS >= ride.total - 1e-3) {
            (world.globalFlags as any).coaster_complete = true;
        }
    }

    /** Drop the rider and forget the rail. A path NEVER outlives its session. */
    private dismount(world: World): void {
        this.ride = null;
        world.rideActive = false;
    }

    /** Build the ride from the coaster b6 source ON `block` (world-engine coords).
     *  Null when that block carries no track — which is the normal answer for
     *  every other game zone in the world. */
    private buildRide(world: World, block: [number, number]): Ride | null {
        let blockEid: EntityId | null = null;
        let comp: BlockComponent | null = null;
        for (const eid of world.getEntitiesWith(['BlockComponent'])) {
            const b = world.getComponent<BlockComponent>(eid, 'BlockComponent');
            if (b && b.x === block[0] && b.y === block[1]) { blockEid = eid; comp = b; break; }
        }
        if (blockEid == null || !comp) return null;

        for (const eid of world.getEntitiesWith(['AdjunctComponent'])) {
            const a = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent');
            if (!a || a.parentBlockEntityId !== blockEid) continue;
            const std: any = a.stdData;
            if (!std || std.typeId !== AdjunctType.Spp || std.theme !== 'coaster' || !Array.isArray(std.cells)) continue;

            const origin = [std.ox ?? 0, std.oy ?? 0, std.oz ?? 0];
            const pts: [number, number, number][] = [];
            for (const cell of std.cells) {
                const s = 4 * Math.pow(0.5, cell.level ?? 0);
                const center: [number, number, number] = [
                    origin[0] + cell.position[0] * s + s / 2,
                    origin[1] + cell.position[1] * s + s / 2,
                    origin[2] + cell.position[2] * s + s / 2,
                ];
                const e = world.metrics.septopusToEngine(center, [comp.x, comp.y]);
                e[1] += comp.elevation || 0;
                pts.push(e);
            }
            if (pts.length < 2) continue;   // a one-cell stub is scenery, not a rail

            const segLen: number[] = [];
            let total = 0;
            for (let i = 1; i < pts.length; i++) {
                const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
                segLen.push(d);
                total += d;
            }
            return { block: [comp.x, comp.y], key: CoasterSystem.key([comp.x, comp.y]), path: pts, segLen, total, cartS: 0 };
        }
        return null;
    }

    /** Point at arc-length s along the polyline path. */
    private pointAt(ride: Ride, s: number): [number, number, number] {
        const pts = ride.path;
        if (s <= 0) return [pts[0][0], pts[0][1], pts[0][2]];
        let acc = 0;
        for (let i = 0; i < ride.segLen.length; i++) {
            if (acc + ride.segLen[i] >= s) {
                const t = ride.segLen[i] > 0 ? (s - acc) / ride.segLen[i] : 0;
                return [
                    pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
                    pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t,
                    pts[i][2] + (pts[i + 1][2] - pts[i][2]) * t,
                ];
            }
            acc += ride.segLen[i];
        }
        const last = pts[pts.length - 1];
        return [last[0], last[1], last[2]];
    }

    /** Diagnostics/tests. `block` says WHICH rail is being ridden. */
    public getRideState(): { mounted: boolean; cartS: number; total: number; block: [number, number] | null } {
        return {
            mounted: this.ride !== null,
            cartS: this.ride?.cartS ?? 0,
            total: this.ride?.total ?? 0,
            block: this.ride ? [this.ride.block[0], this.ride.block[1]] : null,
        };
    }
}
