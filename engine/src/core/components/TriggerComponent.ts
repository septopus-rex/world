import { EntityId } from '../World';
import { TriggerLogicNode } from '../types/Trigger';

export type TriggerShape = 'box' | 'sphere';

/**
 * Canonical logic-node type lives in types/Trigger.ts (TriggerLogicNode);
 * this alias is kept so existing imports keep working.
 */
export type TriggerEvent = TriggerLogicNode;

export interface TriggerComponent {
    shape: TriggerShape;
    /** Engine-axis extents [X(east), Y(alt), Z(north)] — see Coords.getBoxDimensions. */
    size: [number, number, number];
    offset: [number, number, number];
    /** Volume participates only in Game mode (protocol slot 4). */
    gameOnly?: boolean;

    events: TriggerEvent[];

    // Runtime state
    entitiesInside: Set<EntityId>;
    /** Per-entity ms spent inside the volume (drives holdDuration; dt-accumulated). */
    insideMs: Map<EntityId, number>;
    /** Per logic-node count of PASSING executions, keyed `${type}#${nodeIndex}`. */
    triggeredCount: Record<string, number>;

    showHelper: boolean;
    helperColor?: number;
}
