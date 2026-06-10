import { EntityId } from '../World';
import { JsonLogicRule, TriggerAction } from '../types/Trigger';

export type TriggerShape = 'box' | 'sphere';

export interface TriggerEvent {
    type: 'in' | 'out' | 'hold';
    /** JSONLogic expression evaluated against WorldContext before firing actions. */
    conditions?: JsonLogicRule;
    actions: TriggerAction[];
    /** Fired when conditions evaluate to false. */
    fallbackActions?: TriggerAction[];
    oneTime?: boolean;
}

export interface TriggerComponent {
    shape: TriggerShape;
    size: [number, number, number];
    offset: [number, number, number];

    events: TriggerEvent[];

    // Runtime state
    entitiesInside: Set<EntityId>;
    triggeredCount: Record<string, number>;

    showHelper: boolean;
    helperColor?: number;
}
