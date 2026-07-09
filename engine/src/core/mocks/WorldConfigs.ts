import { WorldConfig } from '../types/WorldConfig';

/**
 * World 0 (Earth-like / Normal)
 * Standard physics, green grass, standard movement. 
 */
export const MockWorldNormal: WorldConfig = {
    world: {
        desc: "The Origin. A peaceful, standard Earth-like world.",
        nickname: "Genesis",
        mode: ["normal", "game"],
        accuracy: 1000,
        index: 0,
        containerId: "render-canvas"
    },
    assetBaseUrl: "/assets",
    block: {
        elevation: 0,
        // Per-block AUTHORED adjunct cap — ENFORCED since hardening ① (inject
        // truncates over-cap rows; the editor refuses to place past it). 64 gives
        // headroom over the densest authored demo block; derived entities (SPP/
        // motif expansion) and runtime System spawns don't count.
        max: 64,
        color: 0x228B22, // Forest Green
        texture: 1
    },
    player: {
        start: {
            block: [2048, 2048], // Absolute center of the 4096 grid
            position: [8, 0, 8],
            rotation: [0, 0, 0]
        },
        physique: { height: 1.8, eyeHeight: 1.7, stepHeight: 0.5, crouchHeight: 0.9, jumpHeight: 1.2, fallDeathHeight: 12 },
        // Capacity is LIVE config (EntityFactory / CharacterController consume it).
        // This block used to be dead (declared, never read) with aspirational
        // numbers; when it was wired up, values were aligned to the engine's
        // long-shipped behavior so wiring changed nothing.
        capacity: {
            rotate: 0.05,           // reserved (not consumed yet)
            speed: 10.0,            // RUN speed baseline (m/s)
            walkSpeed: 5.0,         // walk speed (m/s)
            jumpForce: 8.0,         // standard jump impulse
            gravityMultiplier: 1.0, // standard gravity
            ghostFlySpeed: 6.0,     // ghost-mode vertical fly (m/s)
            voidRecover: 20         // void-recovery net depth (m)
        },
        bag: { max: 100 },
        avatar: { max: 2097152, scale: [1, 1, 1] },
        extend: 2 // 5x5 loading radius
    },
    blacklist: [], // Nothing blocked
    debug: { stats: true }
};

/**
 * World 13 (The Ghost Moon)
 * Low gravity, gray surface, faster running, massive jumping.
 * Forbidden to use certain block types (like water or specific items).
 */
export const MockWorldGhostMoon: WorldConfig = {
    world: {
        desc: "A desolate, low-gravity celestial body governed by an eccentric King.",
        nickname: "Lunar Asylum",
        mode: ["ghost", "normal"],
        accuracy: 1000,
        index: 13,
        containerId: "render-canvas"
    },
    assetBaseUrl: "/assets",
    block: {
        elevation: 50, // Started high
        max: 10,       // Very sparse! King limits adjuncts heavily.
        color: 0x808080, // Gray moon surface
        texture: 5
    },
    player: {
        start: {
            block: [100, 100],
            position: [8, 0, 8],
            rotation: [0, 0, 0]
        },
        physique: { height: 1.8, eyeHeight: 1.7, stepHeight: 0.5, crouchHeight: 0.9, jumpHeight: 1.2, fallDeathHeight: 12 },
        capacity: {
            rotate: 0.08,      // Can look around faster
            speed: 18.0,       // RUN baseline: fast gliding run (m/s)
            jumpForce: 35.0,   // Massive moon jumps (live config — applies if this world is used)
            gravityMultiplier: 0.16 // Moon gravity (1/6th of normal)
        },
        bag: { max: 10 },    // King forces survival mode (tiny inventory)
        avatar: { max: 512000, scale: [0.8, 1.2, 0.8] }, // Everyone is stretched and thin
        extend: 2 // Larger radius on the moon
    },
    blacklist: [0x00A1, 0x00B7] // E.g., No water (A1), No teleporters (B7)
};
