/**
 * @fileoverview
 * Base types and interfaces for the String Particle Protocol (SPP).
 * These types match the Layer 1 (Full State Definition) and Layer 2 (Collapsed State) specifications.
 */

/**
 * Represents the 6 faces of a Particle Cell.
 */
export enum ParticleFace {
    Top = 0,    // Z+
    Bottom = 1, // Z-
    Front = 2,  // Y-
    Back = 3,   // Y+
    Left = 4,   // X-
    Right = 5,  // X+
}

/**
 * Represents the communicative state of a face.
 */
export enum FaceState {
    Open = 0,   // Connected / Passable
    Closed = 1, // Blocked / Generates structure
}

/**
 * Subdivision levels based on the protocol specification.
 * Level 0 = 4x4x4m
 * Level 1 = 2x2x2m
 * Level 2 = 1x1x1m
 * Level 3 = 0.5x0.5x0.5m
 */
export type SubdivisionLevel = 0 | 1 | 2 | 3;

/**
 * Represents the logical structure of a Particle Cell as defined by SPP Protocol v1.1.
 */
export interface ParticleCell {
    /** 
     * Local grid coordinates relative to the Block origin. 
     * Range: [0-255, 0-255, 0-255]
     */
    position: [number, number, number];

    /** Subdivision level (0-3) determining physical size */
    level: SubdivisionLevel;

    /** Rotation in multiples of 15 degrees. Each axis range: 0-23 */
    rotation: [number, number, number];

    /** 
     * 6-bit mask representing the face states. 1=Open, 0=Closed.
     * bit layout: [Right, Left, Back, Front, Bottom, Top]
     */
    bitmask: number;

    /** 
     * Option indices selected for each face.
     * Length is strictly 6, each value corresponds to a variant index 0-15.
     */
    variants: [number, number, number, number, number, number];

    /**
     * Built-in trigger template ID (0 = none, 1-254 = Valid IDs).
     */
    triggerId: number;
}
