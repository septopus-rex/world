

/**
 * Represents SPP Standard Data (std) for an Adjunct.
 * This is the decoded intermediate format that defines the object's 3D properties.
 */
export interface AdjunctStandardData {
    type?: string;          // The name of the adjunct (e.g., 'box', 'cylinder')
    index?: number;         // Index of this particular instance within the block
    params: {
        size: [number, number, number];       // [x, y, z]
        position: [number, number, number];   // [ox, oy, oz] - relative offset within the block
        rotation: [number, number, number];   // [rx, ry, rz]
    };
    material?: {
        texture?: number | string;
        repeat?: [number, number];
        offset?: [number, number];
        rotation?: number;
        color?: number;
        opacity?: number;
    };
    animate?: any;          // Parsed SPP Animation Protocol configuration
    stop?: {                // Collision/Grounding settings
        opacity?: number;
        color?: number;
    };
    event?: any;            // Trigger event bindings
}

/**
 * Component representing a dynamic, external "Adjunct" in the SPP Engine.
 * Adjuncts act as data-driven bridges for creating complex 3D interactive objects.
 */
export interface AdjunctComponent {
    adjunctId: string;
    stdData: AdjunctStandardData;
    isInitialized: boolean;
    // We hold a reference to the specific Plugin module that handles the `transform` and `menu` logic for this adjunct type.
    logicModule: any | null;
}
