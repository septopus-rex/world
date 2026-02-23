/**
 * Septopus Native Block Format: [elevation, status, adjuncts_list]
 */
export type MockBlockDataRaw = [number, number, any[]];

export interface MockBlockData {
    x: number;
    y: number;
    elevation: number;
    adjuncts: any[]; // Now holds the raw array from Septopus chain
}

/**
 * Mocking a dynamic world service that returns varying elevations and adjuncts.
 */
export async function fetchMockBlock(x: number, y: number): Promise<MockBlockData> {
    const hash = (x * 71 + y * 131);
    const elevation = 0;

    // Septopus Native Format for adjuncts: [[typeId, [instances]], ...]
    const adjunctsRaw: any[] = [];

    // Add a random pillar (box) in the center if hash is even
    adjunctsRaw.push([
        0x00a2, // Box Hex ID
        [
            // Instance data array (Indice-based)
            // [size, pos, rot, resId, repeat, animation, stop]
            // Corrected size: [East, North, Alt] -> [2, 2, 10]
            [[2, 2, 10], [8, 8, 5], [0, 0, 0], 1, [1, 1], 0, 1]
        ]
    ]);

    return {
        x,
        y,
        elevation,
        adjuncts: adjunctsRaw
    };
}
