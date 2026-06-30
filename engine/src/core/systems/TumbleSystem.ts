import RAPIER from '@dimforge/rapier3d-compat';
import { World, ISystem, EntityId } from '../World';
import { AdjunctType } from '../types/AdjunctType';
import { SystemMode } from '../types/SystemMode';
import { Coords } from '../utils/Coords';
import { BlockComponent } from '../components/BlockComponent';
import { TransformComponent } from '../components/PlayerComponents';
import { setEntityColor } from '../utils/Appearance';
import { TumbleBlockComponent, TumbleTowerComponent } from '../components/TumbleComponents';

/**
 * TumbleSystem — a native in-world block-tower (Jenga) game driven by REAL
 * rigid-body physics (rapier), Pattern B (logic in a SYSTEM, pieces are adjunct
 * entities, the click arrives via interact.primary; lifecycle is zone-gated +
 * trigger-entered like pool/mahjong/shooting).
 *
 * Why rapier and not a hand-rolled sim (like PoolSystem's 2D billiards): the
 * whole game IS the topple — emergent leaning, friction-held stacks, the tower
 * *just* holding then suddenly going. That's exactly what a rigid-body solver
 * gives and a threshold model can't. rapier is headless WASM math (no Three.js),
 * so it lives in core cleanly; we run a SCOPED world holding only this tower's
 * blocks + a ground, in engine/Three space (so gravity −Y = down maps directly,
 * and body poses write straight to TransformComponent with no SPP round-trip).
 * Every other entity (player, terrain, other adjuncts) is untouched — the rapier
 * world is a per-session island, created on entry and freed on exit.
 *
 * Runs in the pre-VisualSync kinematic-driver slot (same as Pool/Coaster): each
 * frame it steps the solver, then writes every block body's translation →
 * TransformComponent.position and rotation (quaternion) → .rotation (Euler), so
 * VisualSyncSystem moves AND turns the meshes the same frame.
 */

// rapier's WASM core must be initialised once before any World/body is built.
// The init is async; the engine step loop is sync — so we kick it off lazily and
// gate spawning on readiness (syncSession simply waits, like the client polls for
// mahjong's async face generation). Module scope = shared across all sessions.
let _rapierReady = false;
let _rapierInit: Promise<void> | null = null;
export function initTumblePhysics(): Promise<void> {
    if (!_rapierInit) _rapierInit = RAPIER.init().then(() => { _rapierReady = true; });
    return _rapierInit;
}
export function isTumblePhysicsReady(): boolean { return _rapierReady; }

const GRAVITY = -9.81;
const TIMESTEP = 1 / 60;     // fixed physics step (deterministic, stable)
const REST_EPS = 0.06;       // below this speed a body counts as at rest

export interface TumbleConfig {
    block: [number, number];
    origin: [number, number];   // tower centre, block-local SPP [E, N]
    surfaceZ?: number;          // ground-top altitude (block-local SPP Z), default 0
    layers?: number;            // tower height in layers, default 15
    perLayer?: number;          // blocks per layer, default 3
    blockLen?: number;          // SPP East length of a block, default 0.72
    blockWid?: number;          // SPP width, default = blockLen / perLayer
    blockHt?: number;           // SPP height, default 0.14
    friction?: number;          // block friction, default 0.7
    woodLight?: number;         // even-layer colour, default 0xceae7b
    woodDark?: number;          // odd-layer colour, default 0xb5894f
}

export class TumbleSystem implements ISystem {
    private config: TumbleConfig | null = null;     // armed declaration
    private rapier: any = null;                      // scoped RAPIER.World (null = no session)
    private towerEid: EntityId | null = null;        // live session marker
    private bodies = new Map<EntityId, any>();       // block entity → rapier RigidBody
    private pendingColor = new Map<EntityId, number>(); // block → wood tone, applied once its mesh exists
    private interactReader: import('../events/EventReader').EventReader<'interact.primary'> | null = null;

    // ── arm / lifecycle (mirrors PoolSystem) ─────────────────────────────────

    /** Arm this block as a tumble tower. The tower spawns when the player ENTERS
     *  Game mode in this block and tears down on leaving; the armed config persists
     *  across eviction so re-entering builds a fresh tower (arcade-cabinet model). */
    public configure(world: World, config: TumbleConfig): void {
        this.endSession(world);
        this.config = config;
        initTumblePhysics();          // start the WASM load now so it's ready by entry
        this.syncSession(world);
    }

    /** Reconcile the live session with "should there be one?" = armed + rapier ready
     *  + Game mode + our block IS the active session's block + that block is loaded
     *  (keyed on world.activeGameBlock, not the player's live position, so a
     *  'confirm' round survives stepping off; the load guard cleans up on evict). */
    private syncSession(world: World): void {
        const c = this.config;
        const a = world.activeGameBlock;
        const want = c != null
            && _rapierReady
            && world.mode === SystemMode.Game
            && a != null && a[0] === c.block[0] && a[1] === c.block[1]
            && this.findBlock(world, c.block) != null;
        if (want && this.towerEid == null) this.startSession(world);
        else if (!want && this.towerEid != null) this.endSession(world);
    }

    // ── build ─────────────────────────────────────────────────────────────────

    private startSession(world: World): void {
        const c = this.config;
        if (!c) return;
        const blockEid = this.findBlock(world, c.block);
        if (blockEid == null) return;
        const bs = world.systems.findSystemByName('BlockSystem') as any;
        if (!bs?.spawnAdjunct) return;

        const layers = c.layers ?? 15;
        const perLayer = c.perLayer ?? 3;
        const L = c.blockLen ?? 0.72;
        const W = c.blockWid ?? L / perLayer;
        const H = c.blockHt ?? 0.14;
        const friction = c.friction ?? 0.7;
        const surfaceZ = c.surfaceZ ?? 0;
        const woodLight = c.woodLight ?? 0xceae7b;
        const woodDark = c.woodDark ?? 0xb5894f;

        // Tower centre anchored in engine/Three space (Y = up). Mirror PoolSystem:
        // sppToEngine does NOT include block elevation, so add it onto Y.
        const base = Coords.sppToEngine([c.origin[0], c.origin[1], surfaceZ], c.block);
        const elevation = this.blockElevation(world, c.block);
        base[1] += elevation;

        // Scoped physics world, gravity straight down (engine −Y).
        this.rapier = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
        this.rapier.timestep = TIMESTEP;

        // Static ground: a wide slab whose TOP is exactly the tower base Y.
        const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(base[0], base[1] - 0.5, base[2]);
        const ground = this.rapier.createRigidBody(groundDesc);
        this.rapier.createCollider(RAPIER.ColliderDesc.cuboid(6, 0.5, 6).setFriction(0.9).setRestitution(0), ground);

        // Tower entity (session marker + topple datum). No mesh.
        const tower: TumbleTowerComponent = {
            block: c.block, base: [base[0], base[1], base[2]],
            layers, perLayer,
            initialTopY: base[1] + layers * H,
            pulled: 0, toppled: false, settled: false,
        };
        this.towerEid = world.createEntity();
        world.addComponent(this.towerEid, 'TumbleTowerComponent', tower);

        // Half-extents are in the block's LOCAL frame (long axis = X); odd layers
        // get a 90° yaw so the long axis runs along Z — classic Jenga cross-stack.
        const hx = L / 2, hy = H / 2, hz = W / 2;
        const spacing = W + 0.004;     // tiny lateral gap → no initial interpenetration
        const yaw90 = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
        const ident = { x: 0, y: 0, z: 0, w: 1 };

        let blockId = 0;
        for (let layer = 0; layer < layers; layer++) {
            const odd = (layer & 1) === 1;
            const cy = base[1] + hy + layer * (H + 0.002);
            for (let slot = 0; slot < perLayer; slot++) {
                const off = (slot - (perLayer - 1) / 2) * spacing;
                // even layer: spread along Z (depth); odd layer: spread along X (east)
                const px = base[0] + (odd ? off : 0);
                const pz = base[2] + (odd ? 0 : off);

                const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
                    .setTranslation(px, cy, pz)
                    .setRotation(odd ? yaw90 : ident)
                    .setLinearDamping(0.25)
                    .setAngularDamping(0.5);
                const body = this.rapier.createRigidBody(bodyDesc);
                this.rapier.createCollider(
                    RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(friction).setRestitution(0),
                    body,
                );

                // Spawn the matching a2 box. raw = [size(SPP E,N,Alt), offset, rot,
                // resource, repeat, animate, stop]. Size [L,W,H]; the per-frame
                // physics sync overrides position/rotation so the offset is nominal.
                // resource 0 (plain) — the wood tone comes from setEntityColor below.
                const raw = [[L, W, H], [c.origin[0], c.origin[1], surfaceZ + cy - base[1]], [0, 0, 0], 0, [1, 1], 0, 0];
                const eid = bs.spawnAdjunct(world, blockEid, AdjunctType.Box, raw);
                if (eid == null) { this.rapier.removeRigidBody(body); continue; }

                // Pieces are simulation state, not authored geometry → tag so the
                // serializer skips them (mirrors pool balls / mahjong tiles).
                const adj = world.getComponent<any>(eid, 'AdjunctComponent');
                if (adj?.stdData) (adj.stdData as any).derivedFrom = 'tumble';

                world.addComponent<TumbleBlockComponent>(eid, 'TumbleBlockComponent', { blockId, layer, slot });
                // Wood tone (alternating). setEntityColor is a no-op until the mesh
                // exists (one AdjunctSystem pass after spawn), so defer it — drained
                // in update() once the MeshComponent appears.
                this.pendingColor.set(eid, odd ? woodDark : woodLight);
                this.writePose(world, eid, body);                         // place at body pose frame 0 (no pop)
                this.bodies.set(eid, body);
                blockId++;
            }
        }
    }

    // ── per-frame ───────────────────────────────────────────────────────────────

    public update(world: World, dt: number): void {
        // No lazy init here: configure() kicks off the WASM load when a tower is
        // armed, and syncSession waits on _rapierReady — so a world that never sets
        // up Tumble never loads rapier at all.
        this.syncSession(world);
        if (!this.rapier || this.towerEid == null) return;

        // A click resolves to interact.primary carrying the picked entity in
        // boundary.target (same path shooting uses). If it's one of our blocks,
        // pull it — the support vanishes and the rest reacts under gravity.
        if (!this.interactReader && (world as any).events?.reader) {
            this.interactReader = world.events.reader('interact.primary');
        }
        if (this.interactReader) {
            const blocked = world.mode === SystemMode.Edit || world.mode === SystemMode.Ghost;
            for (const ev of this.interactReader.read()) {
                if (!blocked) this.pull(world, (ev as any).target ?? null);
            }
        }

        this.rapier.step();

        // Body poses → ECS transforms (VisualSync moves + turns the meshes).
        for (const [eid, body] of this.bodies) this.writePose(world, eid, body);
        // Apply the deferred wood tone once each piece's mesh has materialised
        // (setEntityColor is a no-op before then; writePose already marked dirty).
        if (this.pendingColor.size) {
            for (const [eid, color] of this.pendingColor) {
                if (world.getComponent(eid, 'MeshComponent')) { setEntityColor(world, eid, color); this.pendingColor.delete(eid); }
            }
        }
        this.updateTowerState(world);
    }

    /** Pull a piece by its stable blockId — a no-aim convenience for HUDs/tests;
     *  clicking a block in-world does the same through the raycast path. Returns
     *  whether a piece was pulled. */
    public pullById(world: World, blockId: number): boolean {
        for (const eid of this.bodies.keys()) {
            const bc = world.getComponent<TumbleBlockComponent>(eid, 'TumbleBlockComponent');
            if (bc?.blockId === blockId) { this.pull(world, eid); return true; }
        }
        return false;
    }

    /** Remove the clicked block: free its rigid body + the adjunct mesh/entity. */
    private pull(world: World, target: EntityId | null): void {
        if (target == null) return;
        const body = this.bodies.get(target);
        if (!body) return;                       // not one of our pieces
        this.rapier.removeRigidBody(body);       // drops the body + its collider
        this.bodies.delete(target);
        // Wake the rest: rapier sleeps settled bodies, and removing a support does
        // NOT auto-wake the pieces resting on it — without this the tower would
        // hang frozen in mid-air instead of reacting to the lost support.
        for (const b of this.bodies.values()) b.wakeUp();
        const bs = world.systems.findSystemByName('BlockSystem') as any;
        if (bs?.destroyAdjunct) bs.destroyAdjunct(world, target);
        else world.destroyEntity?.(target);
        const tower = this.findTower(world);
        if (tower) tower.pulled++;
    }

    /** Diagnostics / tests: the tower's standing state derived from live bodies. */
    public snapshot(world: World): {
        block: [number, number] | null; standing: number; pulled: number;
        maxY: number; maxLateral: number; maxTilt: number; toppled: boolean; settled: boolean;
    } {
        const tower = this.findTower(world);
        if (!tower) return { block: null, standing: 0, pulled: 0, maxY: 0, maxLateral: 0, maxTilt: 0, toppled: false, settled: true };
        let maxY = -Infinity, maxLateral = 0, maxTilt = 0, moving = false;
        for (const body of this.bodies.values()) {
            const t = body.translation();
            maxY = Math.max(maxY, t.y);
            maxLateral = Math.max(maxLateral, Math.hypot(t.x - tower.base[0], t.z - tower.base[2]));
            // Tilt = angle of the piece's local up-axis from world up — YAW-INVARIANT
            // (an upright piece reads 0 at any yaw, unlike raw Euler at the 90° gimbal
            // point), so it cleanly separates "standing" from "tipped over".
            const q = body.rotation();
            const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
            maxTilt = Math.max(maxTilt, Math.acos(upY < -1 ? -1 : upY > 1 ? 1 : upY));
            const lv = body.linvel(), av = body.angvel();
            if (Math.hypot(lv.x, lv.y, lv.z) > REST_EPS || Math.hypot(av.x, av.y, av.z) > REST_EPS) moving = true;
        }
        return {
            block: tower.block, standing: this.bodies.size, pulled: tower.pulled,
            maxY: maxY === -Infinity ? 0 : maxY, maxLateral, maxTilt,
            toppled: tower.toppled, settled: !moving,
        };
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    /** rapier body pose → engine TransformComponent (position direct; quaternion →
     *  Euler XYZ so VisualSync can drive the Three mesh's local euler). */
    private writePose(world: World, eid: EntityId, body: any): void {
        const t = world.getComponent<TransformComponent>(eid, 'TransformComponent');
        if (!t) return;
        const p = body.translation();
        t.position[0] = p.x; t.position[1] = p.y; t.position[2] = p.z;
        const q = body.rotation();
        const e = quatToEulerXYZ(q.x, q.y, q.z, q.w);
        t.rotation[0] = e[0]; t.rotation[1] = e[1]; t.rotation[2] = e[2];
        t.dirty = true;
    }

    private updateTowerState(world: World): void {
        const tower = this.findTower(world);
        if (!tower) return;
        const snap = this.snapshot(world);
        // The tower has fallen once the tallest piece has dropped > ~2 layers from
        // the original top, or a piece has slid well past the footprint.
        const dropped = tower.initialTopY - snap.maxY;
        if (!tower.toppled && (dropped > 2 * this.layerHeight() || snap.maxLateral > this.footprintRadius())) {
            tower.toppled = true;
        }
        tower.settled = snap.settled;
    }

    private layerHeight(): number { return (this.config?.blockHt ?? 0.14); }
    private footprintRadius(): number {
        const c = this.config; const L = c?.blockLen ?? 0.72;
        return L; // a piece more than one block-length off the central axis = fallen off
    }

    private findTower(world: World): TumbleTowerComponent | null {
        const eid = world.getEntitiesWith(['TumbleTowerComponent'])[0];
        return eid != null ? world.getComponent<TumbleTowerComponent>(eid, 'TumbleTowerComponent') ?? null : null;
    }

    private findBlock(world: World, [bx, by]: [number, number]): EntityId | null {
        for (const eid of world.getEntitiesWith(['BlockComponent'])) {
            const b = world.getComponent<BlockComponent>(eid, 'BlockComponent');
            if (b?.x === bx && b?.y === by) return eid;
        }
        return null;
    }

    private blockElevation(world: World, block: [number, number]): number {
        const eid = this.findBlock(world, block);
        const b = eid != null ? world.getComponent<BlockComponent>(eid, 'BlockComponent') : null;
        return b?.elevation || 0;
    }

    /** End the session: free every block body, the rapier world (WASM), and the
     *  block + tower entities. Armed config is kept → re-entry rebuilds. */
    private endSession(world: World): void {
        const bs = world.systems.findSystemByName('BlockSystem') as any;
        for (const eid of this.bodies.keys()) {
            if (bs?.destroyAdjunct) bs.destroyAdjunct(world, eid);
            else world.destroyEntity?.(eid);
        }
        this.bodies.clear();
        this.pendingColor.clear();
        if (this.rapier) { this.rapier.free(); this.rapier = null; }
        if (this.towerEid != null) { world.destroyEntity?.(this.towerEid); this.towerEid = null; }
    }
}

/** Quaternion → Euler angles in Three.js 'XYZ' order (matches RenderEngine's
 *  obj.rotation.set / Euler default), computed without importing Three.js so this
 *  stays inside the core layer. Derived from a rotation matrix exactly as
 *  THREE.Euler.setFromRotationMatrix('XYZ') does. */
export function quatToEulerXYZ(x: number, y: number, z: number, w: number): [number, number, number] {
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    // Rotation-matrix elements (THREE column-major makeRotationFromQuaternion).
    const m11 = 1 - (yy + zz), m12 = xy - wz, m13 = xz + wy;
    const m22 = 1 - (xx + zz), m23 = yz - wx;
    const m32 = yz + wx, m33 = 1 - (xx + yy);
    const clamp = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v);
    const ey = Math.asin(clamp(m13));
    let ex: number, ez: number;
    if (Math.abs(m13) < 0.9999999) {
        ex = Math.atan2(-m23, m33);
        ez = Math.atan2(-m12, m11);
    } else {
        ex = Math.atan2(m32, m22);
        ez = 0;
    }
    return [ex, ey, ez];
}
