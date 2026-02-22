export class Coords {
    public static readonly BLOCK_SIZE = 16;

    /**
     * SPP Protocol (Z-Up) -> Engine (Y-Up Right-Handed)
     * SPP: [X=East, Y=North, Z=Alt]
     * Engine: [X=East, Y=Alt, Z=-North]
     * 
     * RATIONALE: 
     * Three.js is Y-Up. Standard camera looks at -Z. 
     * To map SPP North (+Y) to Engine Forward, we map SPP +Y to Engine -Z.
     * 
     * @param sppPos Relative position within the block [East, North, Alt]
     * @param sppBlock Block coordinates [BX, BY] (1-based)
     */
    public static sppToEngine(sppPos: [number, number, number], sppBlock: [number, number]): [number, number, number] {
        return [
            (sppBlock[0] - 1) * this.BLOCK_SIZE + sppPos[0], // Engine X (East)
            sppPos[2],                                      // Engine Y (Alt)
            -((sppBlock[1] - 1) * this.BLOCK_SIZE + sppPos[1]) // Engine Z (North is -)
        ];
    }

    /**
     * Engine (Y-Up) -> SPP Protocol (Z-Up)
     * 
     * @returns { block: [BX, BY], pos: [LocalEast, LocalNorth, Alt] }
     */
    public static engineToSpp(enginePos: [number, number, number]): { block: [number, number], pos: [number, number, number] } {
        const bx = Math.floor(enginePos[0] / this.BLOCK_SIZE) + 1;
        // Since Engine Z = -SppY, SppY = -EngineZ
        const sppYGlobal = -enginePos[2];
        const by = Math.floor(sppYGlobal / this.BLOCK_SIZE) + 1;

        return {
            block: [bx, by],
            pos: [
                enginePos[0] - (bx - 1) * this.BLOCK_SIZE,
                sppYGlobal - (by - 1) * this.BLOCK_SIZE,
                enginePos[1]
            ]
        };
    }

    /**
     * SPP Rotation (Z-Up Euler [X, Y, Z]) -> Engine (Y-Up Euler [X, Y, Z])
     * Note: Rotation around Y (Yaw) is preserved for basic FPS.
     */
    public static sppRotationToEngine(sppRot: [number, number, number]): [number, number, number] {
        return [sppRot[0], sppRot[1], sppRot[2]];
    }

    public static engineRotationToSpp(engineRot: [number, number, number]): [number, number, number] {
        return [engineRot[0], engineRot[1], engineRot[2]];
    }
}
