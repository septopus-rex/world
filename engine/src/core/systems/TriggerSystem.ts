import jsonLogic from 'json-logic-js';
import { World, ISystem, EntityId } from '../World';
import { TriggerComponent, TriggerEvent } from '../components/TriggerComponent';
import { TransformComponent } from '../components/PlayerComponents';
import { AdjunctComponent } from '../components/AdjunctComponents';
import { TriggerAction, WorldContext } from '../types/Trigger';

export class TriggerSystem implements ISystem {
    private _px = 0; private _py = 0; private _pz = 0;
    private _tx = 0; private _ty = 0; private _tz = 0;

    private _adjunctMap = new Map<string | number, EntityId>();
    private _adjunctMapDirty = true;

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

    public update(world: World, _deltaTime: number): void {
        const triggerEntities = world.queryEntities("TriggerComponent");
        const playerEntities = world.queryEntities("TransformComponent");
        if (playerEntities.length === 0) return;

        const playerId = playerEntities[0];
        const playerTransform = world.getComponent<TransformComponent>(playerId, "TransformComponent");
        if (!playerTransform) return;

        this._px = playerTransform.position[0];
        this._py = playerTransform.position[1];
        this._pz = playerTransform.position[2];

        const ctx = this._buildContext(world, playerTransform);

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
                this._handleEvent(world, trigger, 'in', ctx);
                trigger.entitiesInside.add(playerId);
            } else if (!isInside && wasInside) {
                this._handleEvent(world, trigger, 'out', ctx);
                trigger.entitiesInside.delete(playerId);
            } else if (isInside) {
                this._handleEvent(world, trigger, 'hold', ctx);
            }
        }
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

    private _handleEvent(world: World, trigger: TriggerComponent, type: string, ctx: WorldContext): void {
        const event = trigger.events.find(e => e.type === type);
        if (!event) return;
        if (event.oneTime && (trigger.triggeredCount[type] || 0) > 0) return;

        const pass = this._evalConditions(event, ctx);
        const actions = pass ? event.actions : (event.fallbackActions ?? []);

        for (const action of actions) {
            this._executeAction(world, action);
        }

        trigger.triggeredCount[type] = (trigger.triggeredCount[type] || 0) + 1;
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
                    if (comp) this._applyAdjunctModification(comp, action.method, action.params);
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

    private _applyAdjunctModification(adjunct: AdjunctComponent, method: string, params: any[]): void {
        if (method === 'rotateY') {
            adjunct.stdData.ry += params[0] ?? 0.1;
            adjunct.isInitialized = false;
        } else if (method === 'moveZ') {
            adjunct.stdData.oz += params[0] ?? 0.1;
            adjunct.isInitialized = false;
        }
    }
}
