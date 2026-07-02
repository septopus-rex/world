/**
 * NPC agent runtime state (F2, spec docs/plan/specs/npc-agents.md).
 *
 * Everything here is DERIVED runtime state — never persisted. The authored
 * source of truth is the ba adjunct row (home/visual/behavior/seed); a block
 * reload rebuilds this component fresh and the agent respawns at home.
 */
export interface BehaviorComponent {
    /** Parsed behavior document (spec §2). Null = inert (reported once). */
    doc: any;
    /** Current state name. */
    state: string;
    /** Simulation seconds since entering the current state. */
    timeInState: number;
    /** Home anchor in ENGINE coords (from the authored row position). */
    home: [number, number, number];
    /** mulberry32 stream for wander targets (seeded from the authored seed). */
    rng: () => number;
    /** Current wander target (engine coords), null = pick a new one. */
    wanderTarget: [number, number, number] | null;
    /** True after the current state's enter actions ran. */
    entered: boolean;
    /** True when the last step actually moved the agent (drives walk/idle anim). */
    lastMoved?: boolean;
}
