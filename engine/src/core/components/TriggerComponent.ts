import { EntityId } from '../World';

export type TriggerShape = 'box' | 'sphere';

export interface TriggerAction {
    type: string;          // Action category (e.g., 'adjunct', 'player', 'system')
    target: string | number; // Target reference (e.g., adjunctId or entity index)
    method: string;        // Method to call on the target
    params: any[];         // parameters for the method
}

export interface TriggerEvent {
    type: 'in' | 'out' | 'hold' | 'touch';
    actions: TriggerAction[];
    oneTime?: boolean;
}

/**
 * TriggerComponent
 * 
 * Defines a volume in 3D space that executes logic when entities (usually the Player)
 * interact with it.
 */
export interface TriggerComponent {
    shape: TriggerShape;
    size: [number, number, number];
    offset: [number, number, number];

    events: TriggerEvent[];

    // Runtime state
    entitiesInside: Set<EntityId>;
    triggeredCount: Record<string, number>; // Track how many times each event has fired

    // Visual helper (optional, for debugging)
    showHelper: boolean;
    helperColor?: number;
}
