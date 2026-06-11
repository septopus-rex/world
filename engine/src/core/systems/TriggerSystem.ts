import jsonLogic from 'json-logic-js';
import { World, ISystem, EntityId } from '../World';
import { TriggerComponent, TriggerEvent } from '../components/TriggerComponent';
import { TransformComponent } from '../components/PlayerComponents';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { TriggerAction, WorldContext } from '../types/Trigger';
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
 */
export class TriggerSystem implements ISystem {
    private _px = 0; private _py = 0; private _pz = 0;
    private _tx = 0; private _ty = 0; private _tz = 0;

    private _adjunctMap = new Map<string | number, EntityId>();
    private _adjunctMapDirty = true;

    /** Clicked entities queued by the 'interact' subscription, drained per update. */
    private _pendingTouches: EntityId[] = [];
    private _interactSubscribed = false;

    public invalidateAdjunctMap(): void {
        this._adjunctMapDirty = true;
    }

    private rebuildAdjunctMap(world: World): void {
        this._adjunctMap.clear();
        for (const id of world.queryEntities("AdjunctComponent")) {
            const comp = world.getComponent<AdjunctComponent>(id, "AdjunctComponent");
            if (comp) this._adjunctMap.set(comp.adjunctId, id);
        }
        this._adjunctMapDirty = false;
    }

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
        const playerTransform = world.getComponent<TransformComponent>(playerId, "TransformComponent");
        if (!playerTransform) return;

        this._px = playerTransform.position[0];
        this._py = playerTransform.position[1];
        this._pz = playerTransform.position[2];

        const ctx = this._buildContext(world, playerTransform);

        // 1) touch — route queued raycast hits to their trigger components.
        if (this._pendingTouches.length > 0) {
            for (const target of this._pendingTouches) {
                const trigger = world.getComponent<TriggerComponent>(target, "TriggerComponent");
                if (!trigger) continue;                                  // clicked a non-trigger
                if (trigger.gameOnly && mode !== SystemMode.Game) continue;
                this._handleEvent(world, trigger, 'touch', ctx);
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
                this._handleEvent(world, trigger, 'in', ctx);
                trigger.entitiesInside.add(playerId);
                trigger.insideMs.set(playerId, 0);
            } else if (!isInside && wasInside) {
                this._handleEvent(world, trigger, 'out', ctx);
                trigger.entitiesInside.delete(playerId);
                trigger.insideMs.delete(playerId);
            } else if (isInside) {
                const prevMs = trigger.insideMs.get(playerId) ?? 0;
                const nowMs = prevMs + deltaTime * 1000;
                trigger.insideMs.set(playerId, nowMs);
                this._handleHold(world, trigger, ctx, prevMs, nowMs);
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

    private _buildContext(world: World, transform: TransformComponent): WorldContext {
        return {
            player: {
                position: [transform.position[0], transform.position[1], transform.position[2]],
                x: transform.position[0],
                y: transform.position[1],
                z: transform.position[2],
            },
            flags: world.globalFlags,
            time: world.time,
            weather: world.weather,
        };
    }

    /** Fire every logic node of the given type (a volume may carry several). */
    private _handleEvent(world: World, trigger: TriggerComponent, type: string, ctx: WorldContext): void {
        for (let i = 0; i < trigger.events.length; i++) {
            const node = trigger.events[i];
            if (node.type !== type) continue;
            this._fireNode(world, trigger, node, `${type}#${i}`, ctx);
        }
    }

    /**
     * hold nodes fire exactly when the accumulated stay crosses their threshold:
     * prevMs <= D < nowMs (with D=0 ⇒ first frame after entry). Firing on the
     * crossing — not on `elapsed >= D` — makes it once-per-stay without extra
     * bookkeeping, and re-arms automatically when the player exits (insideMs reset).
     */
    private _handleHold(world: World, trigger: TriggerComponent, ctx: WorldContext, prevMs: number, nowMs: number): void {
        for (let i = 0; i < trigger.events.length; i++) {
            const node = trigger.events[i];
            if (node.type !== 'hold') continue;
            const threshold = Math.max(0, node.holdDuration ?? 0);
            if (prevMs <= threshold && nowMs > threshold) {
                this._fireNode(world, trigger, node, `hold#${i}`, ctx);
            }
        }
    }

    private _fireNode(world: World, trigger: TriggerComponent, node: TriggerEvent, key: string, ctx: WorldContext): void {
        if (node.oneTime && (trigger.triggeredCount[key] || 0) > 0) return;

        const pass = this._evalConditions(node, ctx);
        const actions = pass ? node.actions : (node.fallbackActions ?? []);

        for (const action of actions) {
            this._executeAction(world, action);
        }

        // Only a passing execution consumes oneTime / counts as triggered.
        if (pass) trigger.triggeredCount[key] = (trigger.triggeredCount[key] || 0) + 1;
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

    private _executeAction(world: World, action: TriggerAction): void {
        switch (action.type) {
            case 'adjunct': {
                if (this._adjunctMapDirty) this.rebuildAdjunctMap(world);
                const targetId = this._adjunctMap.get(action.target);
                if (targetId !== undefined) {
                    const comp = world.getComponent<AdjunctComponent>(targetId, "AdjunctComponent");
                    if (comp) this._applyAdjunctModification(world, targetId, comp, action.method, action.params);
                }
                break;
            }
            case 'flag':
                // set_flag: target = key, params[0] = value (default true)
                world.globalFlags[action.target as string] = action.params[0] ?? true;
                break;
            case 'system':
                if (action.method === 'log') {
                    console.log('[TriggerSystem]', ...action.params);
                }
                break;
        }
    }

    /**
     * Live adjunct mutation: update the entity's TransformComponent (the mesh
     * group's pose authority via VisualSyncSystem — collision follows too) AND
     * stdData (so edit-mode persistence sees the new values). Forcing a mesh
     * rebuild here (the old approach) changed nothing visually — the rebuilt
     * sub-mesh cancels its own offset — and orphaned the previous mesh group.
     *
     * Axis note: SPP Alt maps to engine +Y, SPP yaw maps to engine Y rotation,
     * so both deltas apply 1:1 to the engine transform.
     */
    private _applyAdjunctModification(world: World, entityId: EntityId, adjunct: AdjunctComponent, method: string, params: any[]): void {
        const trans = world.getComponent<TransformComponent>(entityId, "TransformComponent");
        if (method === 'rotateY') {
            const amount = params[0] ?? 0.1;
            adjunct.stdData.ry += amount;
            if (trans) { trans.rotation[1] += amount; trans.dirty = true; }
        } else if (method === 'moveZ') {
            const amount = params[0] ?? 0.1;
            adjunct.stdData.oz += amount;
            if (trans) { trans.position[1] += amount; trans.dirty = true; }
        }
    }
}
