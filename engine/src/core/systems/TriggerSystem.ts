import { World, ISystem, EntityId } from '../World';
import { TriggerComponent, TriggerAction } from '../components/TriggerComponent';
import { TransformComponent } from '../components/PlayerComponents';
import { AdjunctComponent } from '../components/AdjunctComponents';

/**
 * TriggerSystem handles logic for spatial triggers.
 *
 * OPTIMIZATION:
 * - Reuses Vector-like scratch variables instead of allocating per frame.
 * - Caches adjunctId → entityId map for O(1) lookup on trigger actions.
 */
export class TriggerSystem implements ISystem {
    // Reusable scratch values to avoid per-frame allocations
    private _px = 0; private _py = 0; private _pz = 0;
    private _tx = 0; private _ty = 0; private _tz = 0;

    // adjunctId → entityId cache for O(1) trigger target lookup
    private _adjunctMap = new Map<string | number, EntityId>();
    private _adjunctMapDirty = true;

    public invalidateAdjunctMap(): void {
        this._adjunctMapDirty = true;
    }

    private rebuildAdjunctMap(world: World): void {
        this._adjunctMap.clear();
        const adjuncts = world.queryEntities("AdjunctComponent");
        for (const id of adjuncts) {
            const comp = world.getComponent<AdjunctComponent>(id, "AdjunctComponent");
            if (comp) {
                this._adjunctMap.set(comp.adjunctId, id);
            }
        }
        this._adjunctMapDirty = false;
    }

    public update(world: World, deltaTime: number): void {
        const triggerEntities = world.queryEntities("TriggerComponent");
        const playerEntities = world.queryEntities("TransformComponent");

        if (playerEntities.length === 0) return;

        const playerId = playerEntities[0];
        const playerTransform = world.getComponent<TransformComponent>(playerId, "TransformComponent");
        if (!playerTransform) return;

        this._px = playerTransform.position[0];
        this._py = playerTransform.position[1];
        this._pz = playerTransform.position[2];

        for (const entityId of triggerEntities) {
            const trigger = world.getComponent<TriggerComponent>(entityId, "TriggerComponent");
            const transform = world.getComponent<TransformComponent>(entityId, "TransformComponent");

            if (!trigger || !transform) continue;

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
                this.handleEvent(world, trigger, 'in');
                trigger.entitiesInside.add(playerId);
            } else if (!isInside && wasInside) {
                this.handleEvent(world, trigger, 'out');
                trigger.entitiesInside.delete(playerId);
            } else if (isInside) {
                this.handleEvent(world, trigger, 'hold');
            }
        }
    }

    private handleEvent(world: World, trigger: TriggerComponent, type: string) {
        const event = trigger.events.find(e => e.type === type);
        if (!event) return;
        if (event.oneTime && (trigger.triggeredCount[type] || 0) > 0) return;

        for (const action of event.actions) {
            this.executeAction(world, action);
        }

        trigger.triggeredCount[type] = (trigger.triggeredCount[type] || 0) + 1;
    }

    private executeAction(world: World, action: TriggerAction) {
        if (action.type === 'adjunct') {
            // Rebuild map if invalidated
            if (this._adjunctMapDirty) {
                this.rebuildAdjunctMap(world);
            }

            const targetId = this._adjunctMap.get(action.target);
            if (targetId !== undefined) {
                const comp = world.getComponent<AdjunctComponent>(targetId, "AdjunctComponent");
                if (comp) {
                    this.applyAdjunctModification(comp, action.method, action.params);
                }
            }
        } else if (action.type === 'system') {
            if (action.method === 'log') {
                console.log(`[TriggerSystem Action Log]:`, ...action.params);
            }
        }
    }

    private applyAdjunctModification(adjunct: AdjunctComponent, method: string, params: any[]) {
        if (method === 'rotateY') {
            adjunct.stdData.ry += params[0] || 0.1;
            adjunct.isInitialized = false;
        } else if (method === 'moveZ') {
            adjunct.stdData.oz += params[0] || 0.1;
            adjunct.isInitialized = false;
        }
    }
}
