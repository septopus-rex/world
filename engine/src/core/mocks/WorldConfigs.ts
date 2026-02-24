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
        max: 30,
        color: 0x228B22, // Forest Green
        texture: 1
    },
    player: {
        start: {
            block: [2048, 2048], // Absolute center of the 4096 grid
            position: [8, 0, 8],
            rotation: [0, 0, 0]
        },
        body: { shoulder: 0.5, chest: 0.22, body: [0.3, 0.4, 0.2, 0.8], head: [0.25, 0.05], hand: [0.2, 0.2, 0.1], leg: [0.5, 0.5, 0.1] },
        capacity: {
            rotate: 0.05,
            speed: 10.0,       // Standard walk speed
            jumpForce: 15.0,   // Standard jump
            gravityMultiplier: 1.0 // Standard Gravity
        },
        bag: { max: 100 },
        avatar: { max: 2097152, scale: [1, 1, 1] },
        extend: 2 // 5x5 loading radius
    },
    blacklist: [] // Nothing blocked
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
        body: { shoulder: 0.5, chest: 0.22, body: [0.3, 0.4, 0.2, 0.8], head: [0.25, 0.05], hand: [0.2, 0.2, 0.1], leg: [0.5, 0.5, 0.1] },
        capacity: {
            rotate: 0.08,      // Can look around faster
            speed: 18.0,       // Fast gliding run
            jumpForce: 35.0,   // Massive moon jumps
            gravityMultiplier: 0.16 // Moon gravity (1/6th of normal)
        },
        bag: { max: 10 },    // King forces survival mode (tiny inventory)
        avatar: { max: 512000, scale: [0.8, 1.2, 0.8] }, // Everyone is stretched and thin
        extend: 2 // Larger radius on the moon
    },
    blacklist: [0x00A1, 0x00B7] // E.g., No water (A1), No teleporters (B7)
};
