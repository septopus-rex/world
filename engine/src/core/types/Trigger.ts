/**
 * Trigger System Types
 */

// -----------------------------------------------------------------------------
// 1. JSONLogic
// -----------------------------------------------------------------------------

/**
 * A JSONLogic rule — any valid JSONLogic expression.
 * Examples:
 *   {"==": [{"var": "flags.door_open"}, true]}
 *   {"and": [{">=": [{"var": "time"}, 6]}, {"<": [{"var": "time"}, 20]}]}
 *
 * Available vars in the evaluation context (WorldContext):
 *   player.position[0|1|2], player.x/y/z
 *   flags.<key>      — world.globalFlags
 *   time             — world.time (0–1 float, 0.5 = noon)
 *   weather          — world.weather string
 */
export type JsonLogicRule = Record<string, any>;

// -----------------------------------------------------------------------------
// 2. Trigger Event / Logic Node
// -----------------------------------------------------------------------------

/**
 * One event handler on a trigger volume.
 * Serialized format (slot 5 in adjunct data):
 *   { type, conditions?, actions, fallbackActions?, oneTime? }
 */
export interface TriggerLogicNode {
    /** When to fire: player enters, leaves, or stays inside the volume. */
    type: "in" | "out" | "hold";
    /**
     * Optional JSONLogic guard. If present, evaluated against WorldContext before
     * dispatching actions. Falsy result → fallbackActions (if any) instead.
     */
    conditions?: JsonLogicRule;
    actions: TriggerAction[];
    /** Fired when conditions evaluate to false (optional). */
    fallbackActions?: TriggerAction[];
    /** Fire at most once per world load. */
    oneTime?: boolean;
}

export interface TriggerAction {
    /** Action category: 'adjunct' | 'flag' | 'system' */
    type: string;
    /** Target reference — adjunctId, flag key, or system name. */
    target: string | number;
    method: string;
    params: any[];
}

// -----------------------------------------------------------------------------
// 3. ECS Component Definition
// -----------------------------------------------------------------------------

export interface TriggerVolumeComponent {
    shape: "box" | "sphere";
    size: [number, number, number];
    offset: [number, number, number];
    logic: TriggerLogicNode[];
}

// -----------------------------------------------------------------------------
// 4. WorldContext — the data object passed to JSONLogic at evaluation time
// -----------------------------------------------------------------------------

export interface WorldContext {
    player: {
        position: [number, number, number];
        x: number;
        y: number;
        z: number;
    };
    /** world.globalFlags — key/value store readable and writable by trigger actions */
    flags: Record<string, any>;
    /** world.time — 0-1 float (0.5 = noon) */
    time: number;
    weather: string;
}
