/**
 * Trigger System Types
 * Defines the strict JSON-serializable structures for AI-driven generation.
 */

// -----------------------------------------------------------------------------
// 1. Data-Driven Logic Definitions
// -----------------------------------------------------------------------------

export type ConditionType =
    | "player_has_item"
    | "player_within_distance"
    | "time_of_day"
    | "global_flag_equals";

export interface Condition {
    type: ConditionType;
    // Flexible payload for condition parameters (e.g., id: "key_01", value: true)
    payload: Record<string, any>;
}

export type ActionType =
    | "component_invoke"
    | "play_audio"
    | "spawn_entity"
    | "set_global_flag"
    | "ui_message";

export interface Action {
    type: ActionType;
    // Flexible payload for action parameters (e.g., target: "door_12", method: "open")
    payload: Record<string, any>;
}

export interface TriggerLogicNode {
    event: "in" | "out" | "hold" | "on" | "beside";
    conditions?: Condition[];
    actions: Action[];
    // What to do if conditions fail
    fallbackActions?: Action[];
    // E.g. trigger only once and then disable
    runOneTime?: boolean;
}

// -----------------------------------------------------------------------------
// 2. ECS Component Definition
// -----------------------------------------------------------------------------

/**
 * The runtime ECS component attached to an entity.
 * It has NO visual mesh, only a mathematical boundary.
 */
export interface TriggerVolumeComponent {
    shape: "box" | "sphere" | "cylinder"; // Determines the math used for collision
    size: [number, number, number];       // Extents
    offset: [number, number, number];     // Relative local offset from entity root
    rotation?: [number, number, number];  // Relative rotation for OBB collisions

    // List of logic sequences attached directly to this volume
    logic: TriggerLogicNode[];
}

/**
 * Utility config when triggers are loaded from an SPP cell triggerId (0-255).
 * Represents a global template registry entry.
 */
export interface TriggerTemplate {
    id: number; // 1-255
    name: string;
    desc: string;
    volume: Omit<TriggerVolumeComponent, "logic">; // Standard shape mapping
    logic: TriggerLogicNode[];
}
