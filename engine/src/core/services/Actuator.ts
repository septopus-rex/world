import jsonLogic from 'json-logic-js';
import { World, EntityId } from '../World';
import { reportError, AdjunctError } from '../errors';
import { TriggerAction } from '../types/Trigger';
import { SystemMode, asExitPolicy } from '../types/SystemMode';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { TransformComponent, RigidBodyComponent } from '../components/PlayerComponents';
import { BlockComponent } from '../components/BlockComponent';
import { spawnRelative } from '../utils/Spawn';
import { damageNpc } from '../utils/Combat';
import { setEntityColor } from '../utils/Appearance';
import { AdjunctType } from '../types/AdjunctType';
import { Coords } from '../utils/Coords';
import type { ProjectileComponent } from '../components/NpcComponents';

/**
 * Actuator — the execution layer for trigger actions (roadmap P2).
 *
 * Trigger DATA stays declarative; HOW an action lands depends on the injected
 * actuator. Pure mode uses LocalActuator (mutate the live world directly);
 * a chain-connected build swaps in a contract-backed implementation and the
 * same trigger content publishes transactions instead — zero content changes
 * (same pattern as IChainPublisher / IDraftBackend injection).
 */

export interface ActuatorContext {
    world: World;
    /** The acting player (bag actions credit/debit this entity). */
    playerId: EntityId | null;
    mode: SystemMode;
    /** The entity whose logic fired (trigger volume) — spatial anchor for sound. */
    sourceEntity?: EntityId | null;
}

export interface IActuator {
    readonly kind: string;
    execute(action: TriggerAction, ctx: ActuatorContext): void;
}

/**
 * LocalActuator — in-process execution of the full action surface:
 *
 *   adjunct  target=adjunctId          moveZ [m] / rotateY [rad]
 *   flag     target=key                params[0] = value (default true)
 *   bag      target=itemId             give/take [count]   — GAME MODE ONLY
 *   player   (target unused)           damage/heal [amount] — GAME MODE ONLY;
 *            setSpawn (any mode); enterGame/exitGame — zone-gated Game entry
 *   sound    target=audio resource id  play [volume] — 3D positional at the
 *            firing trigger (sourceEntity); flat 2D when it has no transform
 *   system   method=log                console passthrough
 *   delay    (target unused)           params[0]=seconds — nested `actions` run
 *            later on SIMULATION time via world.scheduler (F1)
 *   spawn    (target unused)           params=[typeId, rawRow] — one derived
 *            entity anchored to the firing sourceEntity (F1)
 *   despawn  target=adjunctId          remove a runtime-SPAWNED entity;
 *            authored content is refused (F1)
 *   damage   target='player'|NPC adjunctId  [amount] — GAME MODE ONLY (F3)
 *   projectile (target unused)         params[0]={speed,damage,radius,ttl,
 *            at:'player'|dir,visual} fired from sourceEntity — GAME MODE ONLY (F3)
 */
export class LocalActuator implements IActuator {
    public readonly kind = 'local';

    /** adjunctId → entity. Self-healing: rebuilt on any miss, so runtime
     *  spawn/destroy (item pickup/drop, edits) never needs to invalidate it. */
    private adjunctMap = new Map<string | number, EntityId>();

    public execute(action: TriggerAction, ctx: ActuatorContext): void {
        switch (action.type) {
            case 'adjunct':
                this.execAdjunct(action, ctx);
                break;
            case 'flag':
                // set_flag: target = key, params[0] = value (default true)
                ctx.world.globalFlags[action.target as string] = action.params?.[0] ?? true;
                // Persist the gameplay session AT the mutation chokepoint. Every
                // flag write funnels through here (trigger nodes, dialogue option
                // actions, NPC enter/onDeath) — TriggerSystem's own save only
                // covers trigger executions, which let a dialogue-set quest flag
                // vanish on reload. Fire-and-forget write-behind, same channel.
                ctx.world.draftStore?.saveMeta?.(0, 'session', {
                    flags: ctx.world.globalFlags,
                    triggerFired: ctx.world.sessionTriggerFired ?? {},
                });
                break;
            case 'bag':
                this.execBag(action, ctx);
                break;
            case 'sound':
                this.execSound(action, ctx);
                break;
            case 'player':
                this.execPlayer(action, ctx);
                break;
            case 'system':
                if (action.method === 'log') console.log('[Actuator]', ...(action.params ?? []));
                break;
            case 'delay':
                this.execDelay(action, ctx);
                break;
            case 'spawn':
                this.execSpawn(action, ctx);
                break;
            case 'despawn':
                this.execDespawn(action, ctx);
                break;
            case 'damage':
                this.execDamage(action, ctx);
                break;
            case 'projectile':
                this.execProjectile(action, ctx);
                break;
            default:
                reportError(`unknown action type '${action.type}'`, { tag: '[Actuator]', severity: 'warn' });
        }
    }

    // ── F1 scheduler-and-spawn actions (spec §1.1) ────────────────────────────

    /**
     * delay: run the nested `actions` params[0] seconds later (SIMULATION time —
     * world.scheduler). The context is re-derived AT FIRE TIME: `mode` is re-read
     * from the world so a delayed bag/player action still hits the gameonly
     * permission matrix as of when it actually runs (a delay must never smuggle a
     * Game-only action across a mode exit).
     */
    private execDelay(action: TriggerAction, ctx: ActuatorContext): void {
        const nested = action.actions;
        if (!Array.isArray(nested) || nested.length === 0) return;
        const seconds = Number(action.params?.[0]);
        const world = ctx.world;
        const playerId = ctx.playerId;
        const sourceEntity = ctx.sourceEntity ?? null;
        world.scheduler.after(Number.isFinite(seconds) ? seconds : 0, () => {
            for (const a of nested) {
                this.execute(a, { world, playerId, mode: world.mode, sourceEntity });
            }
        });
    }

    /**
     * spawn: create ONE runtime entity in the firing block. params = [typeId,
     * rawRow] — the template's position slot is RELATIVE to the firing entity's
     * anchor (spec §2.3), shifted generically via the type's own std round-trip.
     * The entity is marked derivedFrom the firing adjunct: serializer-skipped
     * (never baked into a draft) and dies with the block.
     */
    private execSpawn(action: TriggerAction, ctx: ActuatorContext): void {
        const world = ctx.world;
        const typeId = Number(action.params?.[0]);
        const rawRow = action.params?.[1];
        if (!Number.isFinite(typeId) || !Array.isArray(rawRow)) {
            reportError(`spawn: params must be [typeId, rawRow]`, { tag: '[Actuator]', severity: 'warn' });
            return;
        }
        const src = ctx.sourceEntity != null
            ? world.getComponent<AdjunctComponent>(ctx.sourceEntity, "AdjunctComponent") : null;
        if (!src || src.parentBlockEntityId == null) {
            reportError(`spawn: no firing adjunct to anchor to (sourceEntity required)`, { tag: '[Actuator]', severity: 'warn' });
            return;
        }
        const spawned = spawnRelative(world, src.parentBlockEntityId, typeId, rawRow, src.stdData, String(src.adjunctId));
        if (spawned) {
            world.events?.emit?.('spawn.created', { adjunctId: spawned.adjunctId, typeId, spawnerId: String(src.adjunctId) });
        }
    }

    /** despawn: destroy a runtime-spawned entity by adjunctId (authored content
     *  is refused — see BlockSystem.despawnRuntime). */
    private execDespawn(action: TriggerAction, ctx: ActuatorContext): void {
        const world = ctx.world;
        const eid = this.resolveAdjunct(world, action.target);
        if (eid === null) return;
        const blocks: any = world.systems.findSystemByName('BlockSystem');
        blocks?.despawnRuntime?.(world, eid, 'despawn');
    }

    // ── F3 combat actions (spec combat-damage.md §1) — GAME MODE ONLY ────────

    /** damage: the generic damage channel. target 'player' → HealthSystem;
     *  target 'self' → the FIRING entity (an NPC's authored onInteract can say
     *  "the player's click hits me" without knowing its own runtime adjunctId);
     *  target = NPC adjunctId → its hp (death flow in damageNpc). */
    private execDamage(action: TriggerAction, ctx: ActuatorContext): void {
        if (ctx.mode !== SystemMode.Game) {
            console.warn(`[Actuator] damage ignored outside Game mode`);
            return;
        }
        const amount = Number(action.params?.[0]) || 0;
        if (amount <= 0) return;
        if (action.target === 'player') {
            if (ctx.playerId == null) return;
            ctx.world.events?.emit?.('combat.hit', { targetKind: 'player', amount });
            ctx.world.emitSimple('player:damage', { amount }, ctx.playerId);
            return;
        }
        if (action.target === 'self') {
            if (ctx.sourceEntity != null) damageNpc(ctx.world, ctx.sourceEntity, amount);
            return;
        }
        const eid = this.resolveAdjunct(ctx.world, this.rewriteRelativeTarget(action.target, ctx));
        if (eid !== null) damageNpc(ctx.world, eid, amount);
    }

    /**
     * projectile: spawn a moving damage body from the firing entity (spec §1.3).
     * params[0] = { speed, damage, radius, ttl, at:'player' | dir:[E,N,Alt], visual? }.
     * The instance is a derived Ball adjunct + ProjectileComponent; flight, hit
     * test and expiry belong to ProjectileSystem.
     */
    private execProjectile(action: TriggerAction, ctx: ActuatorContext): void {
        if (ctx.mode !== SystemMode.Game) {
            console.warn(`[Actuator] projectile ignored outside Game mode`);
            return;
        }
        const world = ctx.world;
        const spec = (action.params?.[0] && typeof action.params[0] === 'object') ? action.params[0] : {};
        const src = ctx.sourceEntity != null
            ? world.getComponent<AdjunctComponent>(ctx.sourceEntity, "AdjunctComponent") : null;
        const srcTrans = ctx.sourceEntity != null
            ? world.getComponent<TransformComponent>(ctx.sourceEntity, "TransformComponent") : null;
        if (!src || !srcTrans || src.parentBlockEntityId == null) {
            reportError(`projectile: needs a firing adjunct (sourceEntity)`, { tag: '[Actuator]', severity: 'warn' });
            return;
        }

        const size = Number(spec.visual?.size) > 0 ? Number(spec.visual.size) : 0.3;
        // A Ball row at the shooter's position (relative [0,0,~chest]) — full
        // standard assembly (mesh/LOD) for free; NOT solid (no stop slot).
        const ballRow = [[size, size, size], [0, 0, 1.0], [0, 0, 0], 0, [1, 1], 0, 0];
        const spawned = spawnRelative(world, src.parentBlockEntityId, AdjunctType.Ball, ballRow, src.stdData, String(src.adjunctId));
        if (!spawned) return;

        // Velocity in ENGINE coords: explicit Septopus dir, or locked onto the player
        // at fire time.
        const speed = Number(spec.speed) > 0 ? Number(spec.speed) : 8;
        let v: [number, number, number] | null = null;
        if (Array.isArray(spec.dir)) {
            const e = Number(spec.dir[0]) || 0, n = Number(spec.dir[1]) || 0, a = Number(spec.dir[2]) || 0;
            const len = Math.hypot(e, a, n) || 1;
            v = [(e / len) * speed, (a / len) * speed, (-n / len) * speed]; // Septopus→engine: [E, Alt, −N]
        } else {
            const pTrans = ctx.playerId != null
                ? world.getComponent<TransformComponent>(ctx.playerId, "TransformComponent") : null;
            const pt = world.getComponent<TransformComponent>(spawned.entityId, "TransformComponent");
            if (pTrans && pt) {
                const dx = pTrans.position[0] - pt.position[0];
                const dy = (pTrans.position[1] + 1.0) - pt.position[1]; // chest height
                const dz = pTrans.position[2] - pt.position[2];
                const len = Math.hypot(dx, dy, dz) || 1;
                v = [(dx / len) * speed, (dy / len) * speed, (dz / len) * speed];
            }
        }
        if (!v) { // no player to aim at and no dir — drop the shot
            const blocks: any = world.systems.findSystemByName('BlockSystem');
            blocks?.despawnRuntime?.(world, spawned.entityId, 'despawn');
            return;
        }

        world.addComponent<ProjectileComponent>(spawned.entityId, "ProjectileComponent", {
            velocity: v,
            damage: Number(spec.damage) > 0 ? Number(spec.damage) : 10,
            radius: Number(spec.radius) > 0 ? Number(spec.radius) : 0.35,
            ttl: Number(spec.ttl) > 0 ? Number(spec.ttl) : 3,
            shooterId: String(src.adjunctId),
        });
        if (typeof spec.visual?.color === 'number') {
            setEntityColor(world, spawned.entityId, spec.visual.color);
        }
    }

    // ── bag (Game mode only — game.md permission matrix) ─────────────────────

    private execBag(action: TriggerAction, ctx: ActuatorContext): void {
        if (ctx.mode !== SystemMode.Game) {
            console.warn(`[Actuator] bag action '${action.method}' ignored outside Game mode`);
            return;
        }
        if (ctx.playerId == null) return;

        const itemId = String(action.target);
        const count = action.params?.[0] ?? 1;
        const events = (ctx.world as any).events;   // bare unit-test fakes have no queue
        if (action.method === 'give') {
            events?.emit('item.pickup', {
                itemId, amount: count, metadata: action.params?.[1],
            }, { actor: ctx.playerId });
        } else if (action.method === 'take') {
            events?.emit('item.consume', { itemId, amount: count }, { actor: ctx.playerId });
        } else {
            reportError(`unknown bag method '${action.method}'`, { tag: '[Actuator]', severity: 'warn' });
        }
    }

    // ── player vitals (Game mode only — game.md permission matrix) ───────────

    private execPlayer(action: TriggerAction, ctx: ActuatorContext): void {
        // setSpawn (checkpoint) is allowed in any mode — it's not a cheat like
        // damage/heal, and parkour runs in Normal or Game.
        if (action.method === 'setSpawn') {
            this.execSetSpawn(ctx);
            return;
        }

        // teleport — anchor-gated relocation (specs/teleport-portal.md). Any
        // mode, like setSpawn: portals are Normal-world furniture, and leaving
        // a Game zone through one hands off to GameZoneSystem's exit semantics.
        if (action.method === 'teleport') {
            void this.execTeleport(action, ctx); // async (may fetch the destination raw)
            return;
        }

        // enterGame / exitGame — the DATA-DRIVEN Game-mode entry contract: a
        // trigger placed inside a playable block requests the mode switch, which
        // funnels into the zone-gated World.setMode (so it can only succeed where
        // a block declares game>=1). The mirror of a client confirm button; both
        // honour the same gate. enterGame runs OUTSIDE Game by design.
        if (action.method === 'enterGame') {
            // The game trigger declares how this session ends. params[0] may be a
            // plain policy string or an options object { exitPolicy, lockMovement? }.
            // Set both BEFORE setMode so GameZoneSystem/native Systems/
            // CharacterController see them the same frame.
            const p0 = action.params?.[0];
            const opts = typeof p0 === 'object' && p0 !== null ? (p0 as any) : null;
            const policy = opts ? opts.exitPolicy : p0;
            ctx.world.gameExitPolicy = asExitPolicy(policy);
            ctx.world.moveLocked = !!opts?.lockMovement;
            ctx.world.setMode(SystemMode.Game);
            return;
        }
        if (action.method === 'exitGame') {
            ctx.world.setMode(SystemMode.Normal);
            return;
        }

        if (ctx.mode !== SystemMode.Game) {
            console.warn(`[Actuator] player action '${action.method}' ignored outside Game mode`);
            return;
        }
        if (ctx.playerId == null) return;
        const amount = action.params?.[0] ?? 0;
        if (action.method === 'damage' || action.method === 'heal') {
            ctx.world.emitSimple(`player:${action.method}`, { amount }, ctx.playerId);
        } else {
            reportError(`unknown player method '${action.method}'`, { tag: '[Actuator]', severity: 'warn' });
        }
    }

    // ── teleport (anchor-gated, specs/teleport-portal.md) ────────────────────

    /**
     * player.teleport: target = ANCHOR NAME (never bare coordinates — a block
     * with no authored anchor is unreachable by mechanism, not by rule),
     * params[0] = destination block hint [nx, ny] (pure routing; legality never
     * comes from it). Resolution: live entities first (loaded block — the
     * anchor's ACTUAL pose wins over the hint), then dataSource.view for an
     * unloaded far block. The anchor's optional `when` is the DESTINATION-side
     * permission. Landing reuses the three existing safety nets: streaming
     * follows the player, hasGroundBelow=false hovers until ground arrives,
     * popOutIfEmbedded rescues a bad spot.
     */
    private async execTeleport(action: TriggerAction, ctx: ActuatorContext): Promise<void> {
        const world = ctx.world;
        const name = typeof action.target === 'string' ? action.target : '';
        const hint = action.params?.[0];
        const emitDenied = (block: [number, number], reason: 'bad-args' | 'no-anchor' | 'refused') => {
            world.events?.emit?.('teleport.denied', { anchor: name, block, reason });
        };
        if (!name || !Array.isArray(hint) || !Number.isFinite(Number(hint[0])) || !Number.isFinite(Number(hint[1]))) {
            reportError(`teleport: needs an anchor name + destination block hint`, { tag: '[Actuator]', severity: 'warn' });
            emitDenied([0, 0], 'bad-args');
            return;
        }
        const bx = Number(hint[0]), by = Number(hint[1]);

        const anchor = this.findLiveAnchor(world, name) ?? await this.findRawAnchor(world, bx, by, name);
        if (!anchor) { emitDenied([bx, by], 'no-anchor'); return; }

        // Destination-side permission (flags / inventory / time / weather).
        if (anchor.when != null) {
            let ok = false;
            try { ok = !!jsonLogic.apply(anchor.when, this.conditionCtx(world, ctx.playerId)); }
            catch (e) { reportError(e, { tag: '[Actuator]', severity: 'warn' }); }
            if (!ok) { emitDenied(anchor.block, 'refused'); return; }
        }

        const playerId = ctx.playerId;
        if (playerId == null) return;
        const trans = world.getComponent<TransformComponent>(playerId, "TransformComponent");
        const body = world.getComponent<RigidBodyComponent>(playerId, "RigidBodyComponent");
        if (!trans) return;
        const dest = {
            pos: [anchor.pos[0], anchor.pos[1] + 1.2, anchor.pos[2]] as [number, number, number], // arrive slightly above the pad
            block: anchor.block, name,
        };
        // Animated transition (specs/teleport-portal.md): freeze the player + dolly
        // the camera out → swap → dolly back in. The CharacterController owns the
        // position swap + `teleport.done`. Falls back to an INSTANT swap below when
        // there's no walking-mode controller (Ghost/Observe/Edit, or a headless edge
        // with no controlled player) so the relocation always happens.
        const cc: any = (world as any).systems?.findSystemByName?.('CharacterController');
        if (cc?.beginTeleport?.(world, dest)) return;

        trans.position[0] = dest.pos[0];
        trans.position[1] = dest.pos[1];
        trans.position[2] = dest.pos[2];
        trans.dirty = true;
        if (body) { body.velocity[0] = 0; body.velocity[1] = 0; body.velocity[2] = 0; }
        world.events?.emit?.('teleport.done', { anchor: name, block: anchor.block });
    }

    /** Anchor in the LIVE world (destination block loaded): the b8 entity whose
     *  stdData.anchor.name matches. Engine-space position comes straight from
     *  its transform (elevation already applied). */
    private findLiveAnchor(world: World, name: string):
        { pos: [number, number, number]; block: [number, number]; when: any } | null {
        for (const eid of world.queryEntities("AdjunctComponent")) {
            const adj = world.getComponent<AdjunctComponent>(eid, "AdjunctComponent");
            const a = adj?.stdData?.anchor;
            if (adj?.stdData?.typeId !== AdjunctType.Trigger || a?.name !== name) continue;
            const t = world.getComponent<TransformComponent>(eid, "TransformComponent");
            if (!t) continue;
            const block = adj.parentBlockEntityId != null
                ? world.getComponent<BlockComponent>(adj.parentBlockEntityId, "BlockComponent") : null;
            return {
                pos: [t.position[0], t.position[1], t.position[2]],
                block: block ? [block.x, block.y] : [0, 0],
                when: a.when ?? null,
            };
        }
        return null;
    }

    /** Anchor in an UNLOADED block: fetch the hinted block's effective raw
     *  through the data source (draft overlay included) and scan its b8 rows. */
    private async findRawAnchor(world: World, bx: number, by: number, name: string):
        Promise<{ pos: [number, number, number]; block: [number, number]; when: any } | null> {
        let raw: any[] | null = null;
        try {
            const view = await world.dataSource.view(bx, by, 0, 0);
            const cell = Array.isArray(view)
                ? view.find((b: any) => b?.x === bx && b?.y === by) ?? view[0] : view;
            raw = Array.isArray(cell?.raw) ? cell.raw : null;
        } catch { /* no data source (headless) → unresolvable */ }
        if (!raw) return null;
        const elevation = typeof raw[0] === 'number' ? raw[0] : 0;
        const groups: any[] = Array.isArray(raw[2]) ? raw[2] : [];
        for (const [typeId, rows] of groups) {
            if (typeId !== AdjunctType.Trigger || !Array.isArray(rows)) continue;
            for (const row of rows) {
                const a = row?.[6];
                if (!a || typeof a !== 'object' || a.name !== name) continue;
                const off = Array.isArray(row[1]) ? row[1] : [8, 8, 0];
                const pos = Coords.septopusToEngine([off[0] ?? 8, off[1] ?? 8, off[2] ?? 0], [bx, by]);
                pos[1] += elevation;
                return { pos: pos as [number, number, number], block: [bx, by], when: a.when ?? null };
            }
        }
        return null;
    }

    /** JSONLogic context for destination-side permission — same surface as
     *  DialogueSystem/NPCSystem conditions (flags / inventory / time / weather). */
    private conditionCtx(world: World, playerId: EntityId | null): any {
        const inventory: Record<string, number> = {};
        const inv = playerId != null
            ? world.getComponent<{ items?: { id: string; quantity?: number }[] }>(playerId, "InventoryComponent") : null;
        if (inv?.items) for (const it of inv.items) inventory[it.id] = (inventory[it.id] ?? 0) + (it.quantity ?? 0);
        return { flags: world.globalFlags, inventory, time: world.time, weather: world.weather };
    }

    /** Move the respawn point to the checkpoint (the firing trigger), lifted a
     *  little so the player lands on the platform rather than inside it. */
    private execSetSpawn(ctx: ActuatorContext): void {
        if (ctx.sourceEntity == null) return;
        const trans = ctx.world.getComponent<TransformComponent>(ctx.sourceEntity, "TransformComponent");
        if (!trans) return;
        const pos: [number, number, number] = [trans.position[0], trans.position[1] + 0.5, trans.position[2]];
        ctx.world.respawnPoint = pos;
        ctx.world.emitSimple('player:checkpoint', { position: pos }, ctx.playerId ?? undefined);
    }

    // ── sound (3D one-shot via the render layer) ─────────────────────────────

    private execSound(action: TriggerAction, ctx: ActuatorContext): void {
        const world = ctx.world;
        const volume = action.params?.[0] ?? 1;

        // Anchor at the firing trigger's transform (engine coords) when known.
        let position: [number, number, number] | null = null;
        if (ctx.sourceEntity != null) {
            const trans = world.getComponent<TransformComponent>(ctx.sourceEntity, "TransformComponent");
            if (trans) position = [trans.position[0], trans.position[1], trans.position[2]];
        }

        // Observable immediately (tests / UI), before the async fetch+decode.
        world.emitSimple?.('audio:played', { target: action.target, position, volume });

        const rm = (world as any).resourceManager;
        const resolve: Promise<string> = rm?.getAudioUrl
            ? rm.getAudioUrl(action.target)
            : Promise.resolve(String(action.target));   // direct URL/path fallback
        resolve.then(url => {
            (world.renderEngine as any)?.playSpatialSound?.(url, position, volume);
        }).catch(e => reportError(e, { tag: '[Actuator]', severity: 'warn', code: 'RESOURCE_LOAD' }));
    }

    // ── adjunct (live world mutation) ─────────────────────────────────────────

    private execAdjunct(action: TriggerAction, ctx: ActuatorContext): void {
        const world = ctx.world;
        const entityId = this.resolveAdjunct(world, this.rewriteRelativeTarget(action.target, ctx));
        if (entityId === null) return;
        const adjunct = world.getComponent<AdjunctComponent>(entityId, "AdjunctComponent");
        if (adjunct) this.applyAdjunctModification(world, entityId, adjunct, action.method, action.params ?? []);
    }

    /**
     * Block-relative adjunct target → absolute, resolved against the FIRING
     * entity's OWN block. A target `adj_~_~_{typeId}_{idx}` means "the adjunct at
     * THIS block" — so the SAME authored content works wherever it is placed
     * (relocatable / includable across blocks). Absolute ids (`adj_{x}_{y}_…`)
     * and numeric targets pass through unchanged; with no firing block the token
     * is left as-is (resolve misses → null, safe). See full-data-migration.md P1
     * / bevy-reference-engine.md (the (c) reference-portability geobase).
     */
    private rewriteRelativeTarget(target: string | number, ctx: ActuatorContext): string | number {
        const PREFIX = 'adj_~_~_';
        if (typeof target !== 'string' || !target.startsWith(PREFIX)) return target;
        const src = ctx.sourceEntity != null
            ? ctx.world.getComponent<AdjunctComponent>(ctx.sourceEntity, "AdjunctComponent") : null;
        const blk = src?.parentBlockEntityId != null
            ? ctx.world.getComponent<BlockComponent>(src.parentBlockEntityId, "BlockComponent") : null;
        if (!blk) return target;
        return `adj_${blk.x}_${blk.y}_${target.slice(PREFIX.length)}`;
    }

    /** Map lookup with one rebuild-and-retry on miss or stale entry. */
    private resolveAdjunct(world: World, target: string | number): EntityId | null {
        const fresh = (eid: EntityId | undefined) =>
            eid !== undefined && !!world.getComponent<AdjunctComponent>(eid, "AdjunctComponent");

        let eid = this.adjunctMap.get(target);
        if (!fresh(eid)) {
            this.adjunctMap.clear();
            for (const id of world.queryEntities("AdjunctComponent")) {
                const comp = world.getComponent<AdjunctComponent>(id, "AdjunctComponent");
                if (comp) this.adjunctMap.set(comp.adjunctId, id);
            }
            eid = this.adjunctMap.get(target);
        }
        return fresh(eid) ? (eid as EntityId) : null;
    }

    /**
     * Live adjunct mutation: update the entity's TransformComponent (the mesh
     * group's pose authority via VisualSyncSystem — collision follows too) AND
     * stdData (so edit-mode persistence sees the new values). Forcing a mesh
     * rebuild here changed nothing visually — the rebuilt sub-mesh cancels its
     * own offset — and orphaned the previous mesh group.
     *
     * Axis note: Septopus Alt maps to engine +Y, Septopus yaw maps to engine Y rotation,
     * so both deltas apply 1:1 to the engine transform.
     */
    private applyAdjunctModification(world: World, entityId: EntityId, adjunct: AdjunctComponent, method: string, params: any[]): void {
        const trans = world.getComponent<TransformComponent>(entityId, "TransformComponent");
        if (method === 'rotateY') {
            const amount = params[0] ?? 0.1;
            adjunct.stdData.ry += amount;
            if (trans) { trans.rotation[1] += amount; trans.dirty = true; }
        } else if (method === 'moveZ') {
            const amount = params[0] ?? 0.1;
            adjunct.stdData.oz += amount;
            if (trans) { trans.position[1] += amount; trans.dirty = true; }
        } else {
            reportError(new AdjunctError(`unknown adjunct method '${method}'`), { tag: '[Actuator]', severity: 'warn' });
        }
    }
}
