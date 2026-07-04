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
    /** Runtime hit points (combat spec §1.2). 0 with maxHp 0 = invulnerable.
     *  Never persisted — block reload = full-health respawn (arcade semantics). */
    hp: number;
    maxHp: number;
    /** Dead agents are inert + hidden. AUTHORED agents stay as hidden entities
     *  (destroying them would drop their row from the next draft save — content
     *  loss); block reload revives them. Spawner-DERIVED agents are despawned
     *  instead (frees the maxAlive slot). */
    dead: boolean;
    /** Simulation-clock stamp of the last onInteract fire (attack-verb cooldown,
     *  combat spec §1.4). Undefined = never fired. */
    lastInteractAt?: number;
    /** Simulation-clock stamp of the last touch-damage tick (§1.5). */
    lastTouchAt?: number;
    /** Accumulated simulation seconds (the clock the two stamps above read). */
    clock?: number;
}

/** A projectile in flight (combat spec §1.3) — a runtime-derived entity moved
 *  by ProjectileSystem on simulation time. */
export interface ProjectileComponent {
    /** Velocity in ENGINE coords (m/s). */
    velocity: [number, number, number];
    damage: number;
    /** Hit-sphere radius (m). */
    radius: number;
    /** Remaining lifetime (simulation seconds). */
    ttl: number;
    /** The shooter's adjunctId — never hits its own shooter. */
    shooterId: string;
}
