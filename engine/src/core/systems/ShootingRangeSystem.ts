import { World, ISystem, EntityId } from '../World';
import { AdjunctType } from '../types/AdjunctType';
import { SystemMode } from '../types/SystemMode';
import { BlockComponent } from '../components/BlockComponent';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { ShootingTargetComponent, ShootingRangeComponent, ShootingTargetState } from '../components/ShootingComponents';
import { setEntityColor } from '../utils/Appearance';

/**
 * ShootingRangeSystem — a real, in-world 3D target range (the third native case
 * after pool + mahjong, the SHOT-and-REACT shape).
 *
 * Pool was continuous physics; mahjong was discrete turn-based lifecycle. This
 * one exists to exercise the gap BOTH of them dodged: RUNTIME RECOLOUR. Targets
 * are a7 sphere adjunct entities the System spawns green; a hit flips the SAME
 * entity red in place via the appearance-override channel (setEntityColor →
 * MeshComponent override → VisualSyncSystem), then it rearms to green after a
 * brief flash. No destroy+respawn to fake a colour change — the colour is live
 * state pushed onto the existing mesh.
 *
 * Firing is the engine's own raycast pick: a click → RaycastInteractionSystem →
 * interact.primary (the same path mahjong uses) → fireAtEntity. The System never
 * reads input itself. Headless tests drive it deterministically via fireAtTarget
 * (castRayFromCamera returns null with no GPU, so the click path is e2e-only).
 *
 * Scope is the SEAM: hit → score + recolour + rearm, a round timer, accuracy.
 * No projectiles/ballistics (the pick is instant), no moving targets.
 */
export class ShootingRangeSystem implements ISystem {
    private rangeEid: EntityId | null = null;
    private targetEids: EntityId[] = [];
    private interactReader: import('../events/EventReader').EventReader<'interact.primary'> | null = null;
    private missReader: import('../events/EventReader').EventReader<'interact.miss'> | null = null;

    // ── setup ────────────────────────────────────────────────────────────────

    /** Build the range: spawn a row of a7 sphere targets (baked green) and start
     *  the round timer. Idempotent. */
    public configure(world: World, config: ShootingConfig): void {
        this.teardown(world);
        const blockEid = this.findBlock(world, config.block);
        if (blockEid == null) return;
        const bs = world.systems.findSystemByName('BlockSystem') as any;
        if (!bs?.spawnAdjunct) return;

        const n = config.targetCount ?? 5;
        const r = config.targetR ?? 0.3;
        const spacing = config.spacing ?? 1.2;
        const z = config.z ?? 1.6;
        const upColor = config.upColor ?? 0x33cc44;   // live green
        const hitColor = config.hitColor ?? 0xff3322; // hit red
        const duration = config.duration ?? 60;

        const range: ShootingRangeComponent = {
            block: config.block, phase: 'running',
            timeLeft: duration, duration,
            score: 0, shots: 0, hits: 0, targetCount: n,
            litTime: config.litTime ?? 1.2,
        };
        this.rangeEid = world.createEntity();
        world.addComponent(this.rangeEid, 'ShootingRangeComponent', range);

        const cx = config.origin[0];
        const cy = config.origin[1] + (config.dist ?? 0);
        for (let i = 0; i < n; i++) {
            const x = cx + (i - (n - 1) / 2) * spacing;
            const raw = [[r * 2, r * 2, r * 2], [x, cy, z], [0, 0, 0], 0, [1, 1], 0, 0];
            const eid = bs.spawnAdjunct(world, blockEid, AdjunctType.Ball, raw);
            if (eid == null) continue;
            // Spheres pass material.colour straight through (unlike boxes, which map
            // a palette index) — bake the live green here, recolour the rest at
            // runtime. Tag derived so it never serializes into the block draft.
            const adj = world.getComponent<AdjunctComponent>(eid, 'AdjunctComponent');
            if (adj?.stdData) {
                adj.stdData.material = { ...(adj.stdData.material || {}), color: upColor };
                (adj.stdData as any).derivedFrom = 'shooting';
            }
            world.addComponent<ShootingTargetComponent>(eid, 'ShootingTargetComponent', {
                targetId: i, state: 'up', litTimer: 0, upColor, hitColor,
            });
            this.targetEids.push(eid);
        }
    }

    // ── firing ───────────────────────────────────────────────────────────────

    /** Register a trigger pull at a picked entity (the interact.primary target, or
     *  null for a miss). A live target → score + flip red. Always counts a shot. */
    public fireAtEntity(world: World, eid: EntityId | null): 'hit' | 'miss' {
        const range = this.findRange(world);
        if (!range || range.phase !== 'running') return 'miss';
        range.shots++;
        if (eid != null) {
            const tc = world.getComponent<ShootingTargetComponent>(eid, 'ShootingTargetComponent');
            if (tc && tc.state === 'up') {
                tc.state = 'hit';
                tc.litTimer = range.litTime;
                range.hits++;
                range.score++;
                setEntityColor(world, eid, tc.hitColor);
                return 'hit';
            }
        }
        return 'miss';
    }

    /** Fire by logical targetId (null = a deliberate miss) — the deterministic
     *  entry for the facade + headless tests (no camera ray needed). */
    public fireAtTarget(world: World, targetId: number | null): 'hit' | 'miss' {
        if (targetId == null) return this.fireAtEntity(world, null);
        for (const eid of world.getEntitiesWith(['ShootingTargetComponent'])) {
            if (world.getComponent<ShootingTargetComponent>(eid, 'ShootingTargetComponent')!.targetId === targetId) {
                return this.fireAtEntity(world, eid);
            }
        }
        return this.fireAtEntity(world, null); // unknown id → still a (missed) shot
    }

    /** Diagnostics / tests / HUD. */
    public snapshot(world: World): ShootingSnapshot | null {
        const range = this.findRange(world);
        if (!range) return null;
        const targets: Array<{ targetId: number; state: ShootingTargetState }> = [];
        for (const eid of world.getEntitiesWith(['ShootingTargetComponent'])) {
            const tc = world.getComponent<ShootingTargetComponent>(eid, 'ShootingTargetComponent')!;
            targets.push({ targetId: tc.targetId, state: tc.state });
        }
        targets.sort((a, b) => a.targetId - b.targetId);
        return {
            block: range.block, phase: range.phase, timeLeft: range.timeLeft, duration: range.duration,
            score: range.score, shots: range.shots, hits: range.hits, targetCount: range.targetCount, targets,
        };
    }

    // ── per-frame ──────────────────────────────────────────────────────────────

    public update(world: World, dt: number): void {
        const range = this.findRange(world);
        if (!range || range.phase !== 'running') return;

        range.timeLeft -= dt;
        if (range.timeLeft <= 0) { range.timeLeft = 0; range.phase = 'over'; }

        // Rearm hit targets: count down the red flash, then flip back to green.
        for (const eid of world.getEntitiesWith(['ShootingTargetComponent'])) {
            const tc = world.getComponent<ShootingTargetComponent>(eid, 'ShootingTargetComponent')!;
            if (tc.state === 'hit') {
                tc.litTimer -= dt;
                if (tc.litTimer <= 0) { tc.state = 'up'; setEntityColor(world, eid, tc.upColor); }
            }
        }

        // Real firing: a click resolves to interact.primary (hit something) or
        // interact.miss (hit nothing) — both are a trigger pull. (No-op headless.)
        if (!this.interactReader && (world as any).events?.reader) {
            this.interactReader = world.events.reader('interact.primary');
            this.missReader = world.events.reader('interact.miss');
        }
        if (this.interactReader && this.missReader) {
            const blocked = world.mode === SystemMode.Edit || world.mode === SystemMode.Ghost;
            for (const ev of this.interactReader.read()) {
                if (!blocked) this.fireAtEntity(world, (ev as any).target ?? null);
            }
            for (const _ of this.missReader.read()) {
                if (!blocked) this.fireAtEntity(world, null);
            }
        }
    }

    // ── helpers ────────────────────────────────────────────────────────────────

    private findRange(world: World): ShootingRangeComponent | null {
        const eid = world.getEntitiesWith(['ShootingRangeComponent'])[0];
        return eid != null ? world.getComponent<ShootingRangeComponent>(eid, 'ShootingRangeComponent') ?? null : null;
    }

    private findBlock(world: World, [bx, by]: [number, number]): EntityId | null {
        for (const eid of world.getEntitiesWith(['BlockComponent'])) {
            const b = world.getComponent<BlockComponent>(eid, 'BlockComponent');
            if (b?.x === bx && b?.y === by) return eid;
        }
        return null;
    }

    private teardown(world: World): void {
        // Targets own meshes + instanced resources — free those before destroying
        // the entity (bare destroyEntity leaks the mesh), mirroring pool/mahjong.
        const bs = world.systems.findSystemByName('BlockSystem') as any;
        for (const eid of this.targetEids) {
            if (bs?.destroyAdjunct) bs.destroyAdjunct(world, eid); else world.destroyEntity?.(eid);
        }
        if (this.rangeEid != null) world.destroyEntity?.(this.rangeEid);
        this.targetEids = [];
        this.rangeEid = null;
        this.interactReader = null;
        this.missReader = null;
    }
}

export interface ShootingConfig {
    block: [number, number];
    origin: [number, number];   // range centre (block-local SPP); targets sit `dist` north
    targetCount?: number;       // default 5
    targetR?: number;           // sphere radius, default 0.3
    spacing?: number;           // centre-to-centre along East, default 1.2
    dist?: number;              // north offset of the target row from origin, default 0
    z?: number;                 // target centre altitude, default 1.6
    duration?: number;          // round seconds, default 60
    litTime?: number;           // red-flash seconds before rearm, default 1.2
    upColor?: number;           // live colour, default green 0x33cc44
    hitColor?: number;          // hit colour, default red 0xff3322
}

export interface ShootingSnapshot {
    block: [number, number];
    phase: 'running' | 'over';
    timeLeft: number;
    duration: number;
    score: number;
    shots: number;
    hits: number;
    targetCount: number;
    targets: Array<{ targetId: number; state: ShootingTargetState }>;
}
