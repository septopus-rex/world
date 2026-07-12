import jsonLogic from 'json-logic-js';
import { World, ISystem, EntityId } from '../World';
import { AdjunctType } from '../types/AdjunctType';
import { SystemMode } from '../types/SystemMode';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { TransformComponent } from '../components/PlayerComponents';
import { MeshComponent } from '../components/VisualizationComponents';
import { BehaviorComponent } from '../components/NpcComponents';
import { mulberry32 } from '../services/ItemRegistry';
import { reportError, AdjunctError } from '../errors';
import type { EventReader } from '../events/EventReader';

/**
 * NPCSystem — the VM for the ba agent's behavior document (F2, spec
 * docs/plan/specs/npc-agents.md). The behavior is DATA (states + JSONLogic
 * transitions + actuator enter-actions); this system only implements the
 * movement primitives (stay/wander/follow/flee/return) and the state machine
 * semantics — another engine implementing the same spec reaches the same
 * states and the same wander targets (seeded, §4 formula).
 *
 * Movement writes the runtime TransformComponent only (dirty → VisualSync
 * moves the mesh, the pool-balls precedent). stdData keeps the authored HOME —
 * drafts persist the anchor, never the roaming position.
 */
export class NPCSystem implements ISystem {
    /** Entities whose malformed behavior doc was already reported (once). */
    private reported = new Set<EntityId>();
    /** Attack-verb reach — same arm's length as DialogueSystem's TALK_RANGE. */
    private static readonly INTERACT_RANGE = 3.5;
    /** Pull-cursor over interact.primary (the attack verb, combat spec §1.4). */
    private interactReader: EventReader<'interact.primary'> | null = null;

    public update(world: World, dt: number): void {
        // Shared per-frame context pieces (player pos, flags, inventory counts).
        const players = world.getEntitiesWith(["TransformComponent", "InputStateComponent"]);
        const playerId = players[0];
        const pTrans = playerId !== undefined
            ? world.getComponent<TransformComponent>(playerId, "TransformComponent") : null;
        const inventory: Record<string, number> = {};
        const inv = playerId !== undefined
            ? world.getComponent<{ items?: { id: string; quantity?: number }[] }>(playerId, "InventoryComponent") : null;
        if (inv?.items) for (const it of inv.items) inventory[it.id] = (inventory[it.id] ?? 0) + (it.quantity ?? 0);

        // Attack verb: a click on a non-talkable agent runs its authored
        // onInteract actions (JSONLogic-gated + cooldown). Consumed here, next
        // to the perception context the `when` condition reads.
        if (!this.interactReader && (world as any).events?.reader) {
            this.interactReader = world.events.reader('interact.primary');
        }
        if (this.interactReader) {
            for (const ev of this.interactReader.read()) {
                this.onInteract(world, ev as any, playerId ?? null, inventory);
            }
        }

        for (const eid of world.getEntitiesWith(["AdjunctComponent", "TransformComponent"])) {
            const adj = world.getComponent<AdjunctComponent>(eid, "AdjunctComponent");
            if (adj?.stdData?.typeId !== AdjunctType.Npc) continue;
            const trans = world.getComponent<TransformComponent>(eid, "TransformComponent")!;

            let b = world.getComponent<BehaviorComponent>(eid, "BehaviorComponent");
            if (!b) b = this.attach(world, eid, adj, trans);
            if (!b.doc || b.dead) continue; // inert (malformed doc / dead until block reload)
            // In-dialogue agents hold still (dialogue spec §3) — the conversation
            // partner shouldn't wander off mid-sentence.
            if ((world as any).activeDialogue?.npcEid === eid) continue;

            const stateDef = b.doc.states?.[b.state];
            if (!stateDef) continue;

            b.timeInState += dt;
            b.clock = (b.clock ?? 0) + dt;

            // Enter actions — once per state entry, through the actuator (full
            // vocabulary incl. delay/spawn; mode checked as of NOW).
            if (!b.entered) {
                b.entered = true;
                if (Array.isArray(stateDef.enter)) {
                    for (const a of stateDef.enter) {
                        world.actuator.execute(a, { world, playerId: playerId ?? null, mode: world.mode, sourceEntity: eid });
                    }
                }
            }

            // Perception context (spec §3) + transitions: first truthy wins.
            const dxp = pTrans ? trans.position[0] - pTrans.position[0] : Infinity;
            const dzp = pTrans ? trans.position[2] - pTrans.position[2] : Infinity;
            const distToPlayer = pTrans ? Math.hypot(dxp, dzp) : Infinity;
            const distFromHome = Math.hypot(trans.position[0] - b.home[0], trans.position[2] - b.home[2]);
            const ctx = {
                npc: { distToPlayer, distFromHome, state: b.state, timeInState: b.timeInState },
                flags: world.globalFlags,
                inventory,
                time: world.time,
                weather: world.weather,
            };
            if (Array.isArray(stateDef.transitions)) {
                for (const t of stateDef.transitions) {
                    let hit = false;
                    try { hit = !!jsonLogic.apply(t?.when, ctx as any); }
                    catch (e) {
                        // Malformed condition = false + reported (TriggerSystem convention).
                        reportError(e, { tag: '[NPCSystem]', severity: 'warn', id: String(adj.adjunctId) });
                    }
                    if (hit && typeof t.to === 'string' && t.to !== b.state && b.doc.states?.[t.to]) {
                        const from = b.state;
                        b.state = t.to;
                        b.timeInState = 0;
                        b.entered = false;
                        b.wanderTarget = null;
                        world.events?.emit?.('npc.state', { adjunctId: String(adj.adjunctId), from, to: t.to });
                        break;
                    }
                }
            }

            // Movement primitive for the (possibly new) state.
            const move = b.doc.states?.[b.state]?.move ?? { kind: 'stay' };
            this.step(b, trans, pTrans ?? null, move, dt);

            // Contact damage (combat spec §1.5): the bite that follows the body.
            // Rides the distToPlayer this frame already derived — a `follow`
            // chaser damages whoever it catches, on an authored interval. Lands
            // through the actuator damage channel, so the Game-mode permission
            // matrix applies unchanged (checked here first to keep the console
            // free of out-of-mode warns while wandering past in Normal).
            const touch = adj.stdData?.touch;
            if (touch && playerId != null && world.mode === SystemMode.Game) {
                const radius = Number(touch.radius) > 0 ? Number(touch.radius) : 1.2;
                const interval = Number(touch.interval) > 0 ? Number(touch.interval) : 1;
                if (distToPlayer <= radius && (b.lastTouchAt === undefined || (b.clock! - b.lastTouchAt) >= interval)) {
                    b.lastTouchAt = b.clock!;
                    world.actuator.execute(
                        { type: 'damage', target: 'player', method: 'apply', params: [Number(touch.damage)] } as any,
                        { world, playerId, mode: world.mode, sourceEntity: eid },
                    );
                }
            }

            // Module visuals: feed the avatar-contract animation states.
            const mesh = world.getComponent<MeshComponent>(eid, "MeshComponent");
            if (mesh?.handle) {
                const moving = b.lastMoved === true;
                (world.renderEngine as any).setAnimationState?.(mesh.handle, moving ? 'walk' : 'idle');
                (world.renderEngine as any).updateAnimation?.(mesh.handle, dt);
            }
        }
    }

    /**
     * The attack verb (combat spec §1.4): interact.primary on a NON-talkable ba
     * agent runs its authored `interact.actions` through the actuator. Dialogue
     * has right of way — an agent WITH a dialogue document belongs to
     * DialogueSystem (same event stream), so it is skipped here; a boss that
     * talks first and fights later stays a dialogue+flags recipe.
     */
    private onInteract(world: World, ev: any, playerId: EntityId | null, inventory: Record<string, number>): void {
        const eid = ev?.target;
        if (eid == null) return;
        if ((ev.payload?.distance ?? 0) > NPCSystem.INTERACT_RANGE) return;

        const adj = world.getComponent<AdjunctComponent>(eid, "AdjunctComponent");
        if (adj?.stdData?.typeId !== AdjunctType.Npc) return;
        if (adj.stdData?.dialogue) return;                 // DialogueSystem's click
        const spec = adj.stdData?.interact;
        if (!spec || !Array.isArray(spec.actions)) return;

        const b = world.getComponent<BehaviorComponent>(eid, "BehaviorComponent");
        if (!b || b.dead) return;                          // corpses don't fight back

        const cooldown = Number(spec.cooldown) > 0 ? Number(spec.cooldown) : 0.4;
        if (b.lastInteractAt !== undefined && (b.clock ?? 0) - b.lastInteractAt < cooldown) return;

        if (spec.when != null) {
            const ctx = {
                npc: { state: b.state, timeInState: b.timeInState, distToPlayer: ev.payload?.distance ?? 0, hp: b.hp, maxHp: b.maxHp },
                flags: world.globalFlags, inventory, time: world.time, weather: world.weather,
            };
            let ok = false;
            try { ok = !!jsonLogic.apply(spec.when, ctx as any); }
            catch (e) { reportError(e, { tag: '[NPCSystem]', severity: 'warn', id: String(adj.adjunctId) }); }
            if (!ok) return;
        }

        b.lastInteractAt = b.clock ?? 0;
        for (const a of spec.actions) {
            world.actuator.execute(a, { world, playerId, mode: world.mode, sourceEntity: eid });
        }
    }

    private attach(world: World, eid: EntityId, adj: AdjunctComponent, trans: TransformComponent): BehaviorComponent {
        const raw = adj.stdData?.behavior;
        let doc: any = null;
        if (raw && typeof raw === 'object' && typeof raw.initial === 'string' && raw.states?.[raw.initial]) {
            doc = raw;
        } else if (!this.reported.has(eid)) {
            this.reported.add(eid);
            reportError(new AdjunctError(`[npc] '${adj.adjunctId}' has no valid behavior document — agent inert`, {
                code: 'ADJUNCT_VALIDATE', id: String(adj.adjunctId),
            }), { tag: '[NPCSystem]', severity: 'warn' });
        }
        const hp = typeof adj.stdData?.hp === 'number' && adj.stdData.hp > 0 ? adj.stdData.hp : 0;
        const facing = Number((adj.stdData?.visual as any)?.facing);
        const b: BehaviorComponent = {
            doc,
            state: doc?.initial ?? 'idle',
            timeInState: 0,
            home: [trans.position[0], trans.position[1], trans.position[2]],
            rng: mulberry32((adj.stdData?.seed ?? 0) >>> 0),
            wanderTarget: null,
            entered: false,
            hp,
            maxHp: hp,
            dead: false,
            facing: Number.isFinite(facing) ? facing : 0,
        };
        world.addComponent<BehaviorComponent>(eid, "BehaviorComponent", b);
        return world.getComponent<BehaviorComponent>(eid, "BehaviorComponent")!;
    }

    /** One horizontal kinematic step (Y untouched — agents are ground-locked v1). */
    private step(
        b: BehaviorComponent & { lastMoved?: boolean },
        trans: TransformComponent,
        pTrans: TransformComponent | null,
        move: any,
        dt: number,
    ): void {
        const speed = Number(move?.speed) > 0 ? Number(move.speed) : 1;
        let target: [number, number] | null = null;   // engine x/z
        let away = false;

        switch (move?.kind) {
            case 'wander': {
                const radius = Number(move?.radius) > 0 ? Number(move.radius) : 3;
                if (!b.wanderTarget) {
                    // Normative target formula (spec §4): exactly 2 rng() per target,
                    // uniform over the disk around HOME.
                    const r = radius * Math.sqrt(b.rng());
                    const theta = b.rng() * Math.PI * 2;
                    b.wanderTarget = [b.home[0] + r * Math.cos(theta), b.home[1], b.home[2] + r * Math.sin(theta)];
                }
                target = [b.wanderTarget[0], b.wanderTarget[2]];
                break;
            }
            case 'follow':
                if (pTrans) {
                    const stopAt = Number(move?.stopAt) > 0 ? Number(move.stopAt) : 1.5;
                    const d = Math.hypot(trans.position[0] - pTrans.position[0], trans.position[2] - pTrans.position[2]);
                    if (d > stopAt) target = [pTrans.position[0], pTrans.position[2]];
                }
                break;
            case 'flee':
                if (pTrans) { target = [pTrans.position[0], pTrans.position[2]]; away = true; }
                break;
            case 'return':
                target = [b.home[0], b.home[2]];
                break;
            case 'stay':
            default:
                break;
        }

        b.lastMoved = false;
        if (!target) return;
        let dx = target[0] - trans.position[0];
        let dz = target[1] - trans.position[2];
        const dist = Math.hypot(dx, dz);
        if (away) { dx = -dx; dz = -dz; }
        else if (dist < 0.15) {
            if (move?.kind === 'wander') b.wanderTarget = null; // arrived → next target
            return;
        }
        const n = Math.hypot(dx, dz) || 1;
        const stepLen = Math.min(speed * dt, away ? speed * dt : dist);
        trans.position[0] += (dx / n) * stepLen;
        trans.position[2] += (dz / n) * stepLen;
        // Face the travel direction (a module body walking sideways reads as
        // broken; the box body is rotation-invariant so this is free). Same yaw
        // convention as the player avatar: heading + per-model facing correction.
        trans.rotation[1] = Math.atan2(-dx, -dz) + (b.facing ?? 0);
        trans.dirty = true;
        b.lastMoved = true;
    }
}
