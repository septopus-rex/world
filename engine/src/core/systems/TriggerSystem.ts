import jsonLogic from 'json-logic-js';
import { World, ISystem, EntityId } from '../World';
import { TriggerComponent, TriggerEvent } from '../components/TriggerComponent';
import { TransformComponent } from '../components/PlayerComponents';
import { WorldContext } from '../types/Trigger';
import { SystemMode } from '../types/SystemMode';

/**
 * TriggerSystem — evaluates trigger volumes against the player and runs their
 * JSONLogic-guarded logic nodes.
 *
 * Event model (protocol: docs/systems/trigger.md):
 *   in    — fires the moment the player enters the volume
 *   out   — fires the moment the player leaves
 *   hold  — fires once the player has stayed inside for holdDuration ms
 *           (dt-accumulated, deterministic under step(dt); resets on exit)
 *   touch — fires when the primary interact ray (click / KeyE) hits the volume;
 *           routed here from RaycastInteractionSystem's 'interact' event
 *
 * Mode gating: Edit and Ghost disable all triggers; volumes flagged gameOnly
 * participate only in Game mode.
 *
 * oneTime consumes only on a PASSING execution (conditions met, actions run) —
 * fallbackActions never consume, so e.g. a locked door stays re-tryable.
 *
 * Action EXECUTION is delegated to world.actuator (IActuator) — this system
 * only decides WHAT fires; the injected actuator decides HOW it lands
 * (LocalActuator in pure mode, contract-backed when chain-connected).
 */
export class TriggerSystem implements ISystem {
    private _px = 0; private _py = 0; private _pz = 0;
    private _tx = 0; private _ty = 0; private _tz = 0;

    /** The acting player this frame (actuator context for bag actions). */
    private _playerId: EntityId | null = null;

    /** Clicked entities queued by the 'interact' subscription, drained per update. */
    private _pendingTouches: EntityId[] = [];
    private _interactSubscribed = false;

    public update(world: World, deltaTime: number): void {
        // Edit mode is for authoring, Ghost is read-only — no trigger may fire.
        // Drop queued clicks so they don't fire after the mode switches back.
        const mode = world.mode;
        if (mode === SystemMode.Edit || mode === SystemMode.Ghost) {
            this._pendingTouches.length = 0;
            return;
        }

        this._subscribeInteract(world);

        // The controlled player carries InputStateComponent; plain Transform
        // queries would also match blocks/adjuncts.
        const playerEntities = world.queryEntities("TransformComponent", "InputStateComponent");
        if (playerEntities.length === 0) {
            this._pendingTouches.length = 0;
            return;
        }

        const playerId = playerEntities[0];
        this._playerId = playerId;
        const playerTransform = world.getComponent<TransformComponent>(playerId, "TransformComponent");
        if (!playerTransform) return;

        this._px = playerTransform.position[0];
        this._py = playerTransform.position[1];
        this._pz = playerTransform.position[2];

        const ctx = this._buildContext(world, playerId, playerTransform);

        // 1) touch — route queued raycast hits to their trigger components.
        if (this._pendingTouches.length > 0) {
            for (const target of this._pendingTouches) {
                const trigger = world.getComponent<TriggerComponent>(target, "TriggerComponent");
                if (!trigger) continue;                                  // clicked a non-trigger
                if (trigger.gameOnly && mode !== SystemMode.Game) continue;
                this._handleEvent(world, target, trigger, 'touch', ctx);
            }
            this._pendingTouches.length = 0;
        }

        // 2) volume containment — in / out / hold edges.
        const triggerEntities = world.queryEntities("TriggerComponent");
        for (const entityId of triggerEntities) {
            const trigger = world.getComponent<TriggerComponent>(entityId, "TriggerComponent");
            const transform = world.getComponent<TransformComponent>(entityId, "TransformComponent");
            if (!trigger || !transform) continue;
            if (trigger.gameOnly && mode !== SystemMode.Game) continue;
            if (!trigger.insideMs) trigger.insideMs = new Map();         // older creation paths

            this._tx = transform.position[0] + trigger.offset[0];
            this._ty = transform.position[1] + trigger.offset[1];
            this._tz = transform.position[2] + trigger.offset[2];

            let isInside = false;
            if (trigger.shape === 'sphere') {
                const dx = this._px - this._tx;
                const dy = this._py - this._ty;
                const dz = this._pz - this._tz;
                isInside = (dx * dx + dy * dy + dz * dz) < trigger.size[0] * trigger.size[0];
            } else {
                const hx = trigger.size[0] / 2;
                const hy = trigger.size[1] / 2;
                const hz = trigger.size[2] / 2;
                isInside = (
                    Math.abs(this._px - this._tx) < hx &&
                    Math.abs(this._py - this._ty) < hy &&
                    Math.abs(this._pz - this._tz) < hz
                );
            }

            const wasInside = trigger.entitiesInside.has(playerId);

            if (isInside && !wasInside) {
                this._handleEvent(world, entityId, trigger, 'in', ctx);
                trigger.entitiesInside.add(playerId);
                trigger.insideMs.set(playerId, 0);
            } else if (!isInside && wasInside) {
                this._handleEvent(world, entityId, trigger, 'out', ctx);
                trigger.entitiesInside.delete(playerId);
                trigger.insideMs.delete(playerId);
            } else if (isInside) {
                const prevMs = trigger.insideMs.get(playerId) ?? 0;
                const nowMs = prevMs + deltaTime * 1000;
                trigger.insideMs.set(playerId, nowMs);
                this._handleHold(world, entityId, trigger, ctx, prevMs, nowMs);
            }
        }
    }

    /** Lazily hook RaycastInteractionSystem's 'interact' events (real World only;
     *  unit-test fakes without a bus simply never queue touches). */
    private _subscribeInteract(world: World): void {
        if (this._interactSubscribed || typeof world.on !== 'function') return;
        world.on('interact', (ev: any) => {
            const id = ev?.payload?.entityId;
            if (id !== null && id !== undefined) this._pendingTouches.push(id as EntityId);
        });
        this._interactSubscribed = true;
    }

    private _buildContext(world: World, playerId: EntityId, transform: TransformComponent): WorldContext {
        // itemId → total count, so conditions can gate on possession:
        //   {">=": [{"var": "inventory.tpl_2"}, 1]}   — "has a key"
        const counts: Record<string, number> = {};
        const inv = world.getComponent<{ items?: { id: string; quantity?: number }[] }>(playerId, "InventoryComponent");
        if (inv?.items) {
            for (const item of inv.items) {
                counts[item.id] = (counts[item.id] ?? 0) + (item.quantity ?? 0);
            }
        }
        return {
            player: {
                position: [transform.position[0], transform.position[1], transform.position[2]],
                x: transform.position[0],
                y: transform.position[1],
                z: transform.position[2],
            },
            flags: world.globalFlags,
            inventory: counts,
            time: world.time,
            weather: world.weather,
        };
    }

    /** Fire every logic node of the given type (a volume may carry several). */
    private _handleEvent(world: World, entityId: EntityId, trigger: TriggerComponent, type: string, ctx: WorldContext): void {
        for (let i = 0; i < trigger.events.length; i++) {
            const node = trigger.events[i];
            if (node.type !== type) continue;
            this._fireNode(world, entityId, trigger, node, `${type}#${i}`, ctx);
        }
    }

    /**
     * hold nodes fire exactly when the accumulated stay crosses their threshold:
     * prevMs <= D < nowMs (with D=0 ⇒ first frame after entry). Firing on the
     * crossing — not on `elapsed >= D` — makes it once-per-stay without extra
     * bookkeeping, and re-arms automatically when the player exits (insideMs reset).
     */
    private _handleHold(world: World, entityId: EntityId, trigger: TriggerComponent, ctx: WorldContext, prevMs: number, nowMs: number): void {
        for (let i = 0; i < trigger.events.length; i++) {
            const node = trigger.events[i];
            if (node.type !== 'hold') continue;
            const threshold = Math.max(0, node.holdDuration ?? 0);
            if (prevMs <= threshold && nowMs > threshold) {
                this._fireNode(world, entityId, trigger, node, `hold#${i}`, ctx);
            }
        }
    }

    private _fireNode(world: World, entityId: EntityId, trigger: TriggerComponent, node: TriggerEvent, key: string, ctx: WorldContext): void {
        // Durable oneTime: keyed by the adjunct's stable id (component state is
        // rebuilt on every block reload, so triggeredCount alone forgets).
        const adjunctId = world.getComponent<{ adjunctId?: string }>(entityId, "AdjunctComponent")?.adjunctId;
        const session: Record<string, number> | undefined = (world as any).sessionTriggerFired;
        const sessionKey = adjunctId ? `${adjunctId}#${key}` : null;

        if (node.oneTime) {
            if ((trigger.triggeredCount[key] || 0) > 0) return;
            if (sessionKey && session && (session[sessionKey] || 0) > 0) return;
        }

        const pass = this._evalConditions(node, ctx);
        const actions = pass ? node.actions : (node.fallbackActions ?? []);

        for (const action of actions) {
            world.actuator.execute(action, {
                world, playerId: this._playerId, mode: world.mode, sourceEntity: entityId,
            });
        }

        // Only a passing execution consumes oneTime / counts as triggered.
        if (pass) {
            trigger.triggeredCount[key] = (trigger.triggeredCount[key] || 0) + 1;
            if (sessionKey && session) session[sessionKey] = (session[sessionKey] || 0) + 1;
        }

        // Persist the gameplay session (flags + oneTime) whenever a node ran
        // anything — fire-and-forget write-behind, restored by hydrateDrafts.
        if (actions.length > 0 || pass) {
            (world as any).draftStore?.saveMeta?.(0, 'session', {
                flags: world.globalFlags,
                triggerFired: session ?? {},
            });
        }
    }

    /** Returns true when there are no conditions, or when JSONLogic evaluates truthy. */
    private _evalConditions(event: TriggerEvent, ctx: WorldContext): boolean {
        if (!event.conditions) return true;
        try {
            return !!jsonLogic.apply(event.conditions, ctx as unknown as Record<string, unknown>);
        } catch {
            return false;
        }
    }

}
