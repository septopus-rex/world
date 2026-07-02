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
 *   inventory.<itemId> — total count of that item in the player's inventory
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
 *   { type, conditions?, actions, fallbackActions?, oneTime?, holdDuration? }
 */
export interface TriggerLogicNode {
    /**
     * When to fire:
     *   in    — player enters the volume
     *   out   — player leaves the volume
     *   hold  — player has stayed inside for holdDuration ms (fires once per stay)
     *   touch — player clicks the volume (primary interact ray hits it)
     */
    type: "in" | "out" | "hold" | "touch";
    /**
     * Optional JSONLogic guard. If present, evaluated against WorldContext before
     * dispatching actions. Falsy result → fallbackActions (if any) instead.
     */
    conditions?: JsonLogicRule;
    actions: TriggerAction[];
    /** Fired when conditions evaluate to false (optional). */
    fallbackActions?: TriggerAction[];
    /**
     * Consume after the first PASSING execution (conditions met, actions fired).
     * Fallback executions do not consume — a locked door stays re-tryable.
     */
    oneTime?: boolean;
    /**
     * 'hold' only: milliseconds the player must stay inside before the node
     * fires. Accumulated from stepped dt (deterministic, no wall-clock); resets
     * when the player exits. Absent/0 → fires on the first frame after entry.
     */
    holdDuration?: number;
}

export interface TriggerAction {
    /** Action category: 'adjunct' | 'flag' | 'bag' | 'player' | 'sound' |
     *  'system' | 'delay' | 'spawn' | 'despawn' */
    type: string;
    /** Target reference — adjunctId, flag key, or system name. */
    target: string | number;
    method: string;
    params: any[];
    /** Nested actions for composite types (F1 spec §1.1): `delay` executes these
     *  params[0] seconds later. Optional — absent on every legacy action. */
    actions?: TriggerAction[];
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
    /** itemId → total count in the player's inventory ("has key" conditions) */
    inventory: Record<string, number>;
    /** world.time — 0-1 float (0.5 = noon) */
    time: number;
    weather: string;
}
