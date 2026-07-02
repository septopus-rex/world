import { World, EntityId } from '../World';
import { reportError, AdjunctError } from '../errors';
import { TriggerAction } from '../types/Trigger';
import { SystemMode, asExitPolicy } from '../types/SystemMode';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { TransformComponent } from '../components/PlayerComponents';
import { spawnRelative } from '../utils/Spawn';

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
 */
export class LocalActuator implements IActuator {
    public readonly kind = 'local';

    /** adjunctId → entity. Self-healing: rebuilt on any miss, so runtime
     *  spawn/destroy (item pickup/drop, edits) never needs to invalidate it. */
    private adjunctMap = new Map<string | number, EntityId>();

    public execute(action: TriggerAction, ctx: ActuatorContext): void {
        switch (action.type) {
            case 'adjunct':
                this.execAdjunct(action, ctx.world);
                break;
            case 'flag':
                // set_flag: target = key, params[0] = value (default true)
                ctx.world.globalFlags[action.target as string] = action.params?.[0] ?? true;
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

        // enterGame / exitGame — the DATA-DRIVEN Game-mode entry contract: a
        // trigger placed inside a playable block requests the mode switch, which
        // funnels into the zone-gated World.setMode (so it can only succeed where
        // a block declares game>=1). The mirror of a client confirm button; both
        // honour the same gate. enterGame runs OUTSIDE Game by design.
        if (action.method === 'enterGame') {
            // The game trigger declares how this session ends. params[0] may be a
            // plain policy string or an options object { exitPolicy }. Set it BEFORE
            // setMode so GameZoneSystem/native Systems see it the same frame.
            const p0 = action.params?.[0];
            const policy = typeof p0 === 'object' && p0 !== null ? (p0 as any).exitPolicy : p0;
            ctx.world.gameExitPolicy = asExitPolicy(policy);
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

    private execAdjunct(action: TriggerAction, world: World): void {
        const entityId = this.resolveAdjunct(world, action.target);
        if (entityId === null) return;
        const adjunct = world.getComponent<AdjunctComponent>(entityId, "AdjunctComponent");
        if (adjunct) this.applyAdjunctModification(world, entityId, adjunct, action.method, action.params ?? []);
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
     * Axis note: SPP Alt maps to engine +Y, SPP yaw maps to engine Y rotation,
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
