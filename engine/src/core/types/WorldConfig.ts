/**
 * Septopus World "King" Configuration Interface.
 * Determines the physics, rendering, and structural baseline of an individual world (1 of 96).
 * Based off of the legacy septopus `world.js` JSON parameter structure.
 */

// -----------------------------------------------------------------------------
// Base Constants (Shared by the 96 worlds engine-wide)
// -----------------------------------------------------------------------------
export interface SeptopusGlobalConstants {
    world: {
        name: string;
        desc: string;
        range: [number, number];   // Dimensions limit per face, e.g., 4096x4096
        block: [number, number, number]; // Sub-block structure sizes
        diff: number;              // Terrain elevation diff baseline
        max: number;               // 99 Worlds total
    };
    time: {
        year: number; month: number; day: number;
        hour: number; minute: number; second: number;
        speed: number;             // Ratio of Septopus time vs Reality
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
    };

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
        body: {
            shoulder: number;
            chest: number;
            body: [number, number, number, number]; // head, body, hip, leg ratios
            head: [number, number];                 // head height, neck
            hand: [number, number, number];         // upper, lower, hand
            leg: [number, number, number];          // thigh, calf, foot
        };
        capacity: {
            rotate: number;          // Mouse turn speed limit
            speed: number;           // Walking baseline modifier
            jumpForce: number;       // Base jump force 
            gravityMultiplier: number; // 1.0 is default Gravity. 
        };
        // Items & Size ceilings
        bag: { max: number };
        avatar: { max: number, scale: [number, number, number] };
    };

    // Admin ban-list
    blacklist: number[]; // Blocked adjunct types (E.g. no teleportation pads allowed)
}
