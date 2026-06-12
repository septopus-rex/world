import { World, EntityId } from '../World';
import { TriggerAction } from '../types/Trigger';
import { SystemMode } from '../types/SystemMode';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { TransformComponent } from '../components/PlayerComponents';

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
 *   player   (target unused)           damage/heal [amount] — GAME MODE ONLY
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
            default:
                console.warn(`[Actuator] unknown action type '${action.type}'`);
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
            console.warn(`[Actuator] unknown bag method '${action.method}'`);
        }
    }

    // ── player vitals (Game mode only — game.md permission matrix) ───────────

    private execPlayer(action: TriggerAction, ctx: ActuatorContext): void {
        if (ctx.mode !== SystemMode.Game) {
            console.warn(`[Actuator] player action '${action.method}' ignored outside Game mode`);
            return;
        }
        if (ctx.playerId == null) return;
        const amount = action.params?.[0] ?? 0;
        if (action.method === 'damage' || action.method === 'heal') {
            ctx.world.emitSimple(`player:${action.method}`, { amount }, ctx.playerId);
        } else {
            console.warn(`[Actuator] unknown player method '${action.method}'`);
        }
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
        }).catch(e => console.warn(`[Actuator] sound ${action.target} failed`, e?.message ?? e));
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
            console.warn(`[Actuator] unknown adjunct method '${method}'`);
        }
    }
}
