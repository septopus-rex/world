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
        block: [number, number, number]; // Standard [Width, Length, Height], e.g. [16, 16, 16]
        diff: number;              // Terrain elevation diff baseline
        max: number;               // 96 Worlds total (0-95)
    };
    time: {
        epoch: number;             // Genesis block height
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
        extend: number; // Viewport loading radius
    };

    // Admin ban-list
    blacklist: number[]; // Blocked adjunct types (E.g. no teleportation pads allowed)

    // Debug options
    debug?: {
        stats?: boolean;   // Show Three.js Stats (FPS/MS/MB)
    };
}

/**
 * The final runtime configuration used by the Engine/World.
 * Combines Global Constants (Protocol) and Individual World Config (King).
 */
export type FullWorldConfig = WorldConfig & SeptopusGlobalConstants;
