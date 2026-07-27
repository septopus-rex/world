/**
 * Septopus World "King" Configuration Interface.
 * Determines the physics, rendering, and structural baseline of an individual world (1 of 96).
 * Based off of the legacy septopus `world.js` JSON parameter structure.
 */

// -----------------------------------------------------------------------------
// Protocol DEFAULTS (what a world document that declares nothing inherits)
// -----------------------------------------------------------------------------
export interface SeptopusGlobalConstants {
    world: {
        name: string;
        desc: string;
        // range/block/diff are per-world MUTABLE config (world.md §1, 2026-07-27) —
        // these entries are only the fallback for a document that omits them. The
        // engine reads them via `world.metrics` (core/utils/WorldMetrics), never
        // from here directly; nothing may hardcode 4096 / 16 again.
        range: [number, number];   // Block count per axis [East, North]
        block: [number, number, number]; // Block size in metres, Septopus order [East, North, Alt]
        diff: number;              // Height granularity in metres
        max: number;               // 96 Worlds total (0-95) — METAVERSE-level, not per-world
    };
    time: {
        epoch: number;             // Genesis block height
        year: number; month: number; day: number;
        hour: number; minute: number; second: number;
        speed: number;             // Ratio of Septopus time vs Reality (chain calendar only — day-and-above)
        localDaySeconds: number;   // Real seconds for one LOCAL sun cycle (hour/minute/second) — chain-independent
    };
}

// -----------------------------------------------------------------------------
// Mutable King's Configurations (Specific to each of the 96 worlds)
// -----------------------------------------------------------------------------
export interface WorldConfig {
    world: {
        desc: string;
        nickname: string;
        mode: ("ghost" | "normal" | "game")[];
        accuracy: number;          // Typically 1000 (mm to meters conversion)
        index: number;             // World Index [0 - 95]
        containerId: string;       // Canvas HTML DOM mount ID

        // GEOMETRY (world.md §1) — the world's own grid, declared as DATA so a
        // chain-served configuration can define it. Omitted fields inherit the
        // protocol defaults above. Consume through `world.metrics`, which
        // validates these and is the ONLY place block offsets are computed.
        range?: [number, number];        // Block count per axis [East, North]
        block?: [number, number, number]; // Block size in metres [East, North, Alt]
        diff?: number;                    // Height granularity in metres
    };
    assetBaseUrl: string;          // Global asset path

    // Default appearance of land
    block: {
        elevation: number;
        max: number;               // Max adjuncts per block
        color: number;             // Hex color 0xXXXXXX
        texture: number;           // Texture index map
    };

    // Player constraints in this world
    player: {
        start: {
            block: [number, number];     // [X,Y] grid start
            position: [number, number, number]; // Sub-local start
            rotation: [number, number, number];
        };
        // Physique BASELINE (base-data-audit D9): the engine-consumed body
        // parameters — the PHYSICS authority (collision capsule, step, jump)
        // and the visual fallback for avatars that declare no physique of
        // their own (player.md §2/§3). Defaults per player.md. Replaces the
        // legacy VBW `body` shape, which nothing consumed (dead data, removed).
        physique?: {
            height?: number;          // physics body height + visual fallback (m, default 1.8)
            eyeHeight?: number;       // first-person camera fallback (default 1.7)
            stepHeight?: number;      // walkable step-over (default 0.5)
            crouchHeight?: number;    // crouch body height (default 0.9)
            jumpHeight?: number;      // jump apex reference (default 1.2)
            fallDeathHeight?: number; // fatal fall distance (m, default 12)
            // World clamp on avatar-DECLARED visual heights (world authority
            // over extreme bodies); default [0.5, 3.0] m.
            avatarHeightRange?: [number, number];
        };
        // Movement capacity — CONSUMED by EntityFactory.setupPlayer (rigid body)
        // and CharacterController (ghost fly / void recovery). The king's config
        // is authoritative; engine defaults only cover absent fields.
        capacity: {
            rotate: number;          // Mouse turn speed limit (reserved, not consumed yet)
            speed: number;           // RUN speed baseline (m/s) → RigidBody.maxSpeedRun
            walkSpeed?: number;      // Walk speed (m/s) → maxSpeedWalk (default 5)
            jumpForce: number;       // Jump impulse → RigidBody.jumpForce
            gravityMultiplier: number; // 1.0 is default Gravity.
            ghostFlySpeed?: number;  // Ghost-mode vertical fly speed (m/s, default 6)
            voidRecover?: number;    // Fall this far below last grounded spot → recover (m, default 20)
        };
        // Items & Size ceilings
        bag: { max: number };
        // `resource`: optional model id (IPFS CID / path) for the player's avatar,
        // loaded via ResourceManager; omit to keep the placeholder body box.
        // `facing`: per-model yaw correction (radians). `physique`: the avatar's
        // DECLARED visual body (height = scale target, eyeHeight = camera) —
        // world-clamped via physique.avatarHeightRange; omit = world baseline.
        avatar: {
            max: number, scale: [number, number, number], resource?: string | number,
            facing?: number, physique?: { height?: number; eyeHeight?: number },
        };
        extend: number; // Viewport loading radius
    };

    // Admin ban-list
    blacklist: number[]; // Blocked adjunct types (E.g. no teleportation pads allowed)

    // Debug options
    debug?: {
        stats?: boolean;     // Show Three.js Stats (FPS/MS/MB)
        shadows?: boolean;   // Start with the sun's shadow map on (default true; runtime: Engine.setShadows)
        ibl?: boolean;       // Sky image-based light (default true). Off = gradient sky only,
                             // no PMREM: one fewer shader permutation for weak/software GL.
    };
}

/**
 * The final runtime configuration used by the Engine/World.
 * Combines Global Constants (Protocol) and Individual World Config (King).
 */
export type FullWorldConfig = WorldConfig & SeptopusGlobalConstants;
