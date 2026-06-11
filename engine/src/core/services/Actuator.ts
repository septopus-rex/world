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
        if (action.method === 'give') {
            ctx.world.emitSimple('pickup_item', {
                itemId, amount: count, metadata: action.params?.[1],
            }, ctx.playerId);
        } else if (action.method === 'take') {
            ctx.world.emitSimple('consume_item', { itemId, amount: count }, ctx.playerId);
        } else {
            console.warn(`[Actuator] unknown bag method '${action.method}'`);
        }
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
