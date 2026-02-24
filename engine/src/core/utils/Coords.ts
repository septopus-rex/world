import { GlobalConfig } from '../GlobalConfig';

export class Coords {
    public static BLOCK_SIZE = 16;

    /**
     * SPP Protocol (Z-Up) -> Engine (Y-Up Right-Handed)
     * SPP:    [X=East, Y=North, Z=Alt]
     * Engine: [X=East, Y=Alt,   Z=-North]
     * 
     * RATIONALE: 
     * Three.js is Y-Up. Standard camera looks at -Z. 
     * To map SPP North (+Y) to Engine Forward, we map SPP +Y to Engine -Z.
     */
    public static sppToEngine(sppPos: [number, number, number], sppBlock: [number, number]): [number, number, number] {
        return [
            (sppBlock[0] - 1) * this.BLOCK_SIZE + sppPos[0], // Engine X (East)
            sppPos[2],                                      // Engine Y (Alt)
            -((sppBlock[1] - 1) * this.BLOCK_SIZE + sppPos[1]) // Engine Z (North is -Z)
        ];
    }

    /**
     * Engine (Y-Up) -> SPP Protocol (Z-Up)
     */
    public static engineToSpp(enginePos: [number, number, number]): { block: [number, number], pos: [number, number, number] } {
        const bx = Math.floor(enginePos[0] / this.BLOCK_SIZE) + 1;
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
     * Local SPP (Z-Up) -> Local Engine (Y-Up)
     * Identical mapping logic to sppToEngine but without block offset.
     */
    public static localSppToEngine(localSpp: [number, number, number]): [number, number, number] {
        return [
            localSpp[0],  // Engine X (East)
            localSpp[2],  // Engine Y (Alt)
            -localSpp[1] // Engine Z (North)
        ];
    }

    /**
     * SPP Size [East, North, Alt] -> Engine Box Dimensions [width, height, depth]
     * Engine width(X)  = SPP East(X)
     * Engine height(Y) = SPP Alt(Z)
     * Engine depth(Z)  = SPP North(Y)
     */
    public static getBoxDimensions(sppSize: [number, number, number]): [number, number, number] {
        return [
            sppSize[0], // width (East)
            sppSize[2], // height (Alt)
            sppSize[1]  // depth (North)
        ];
    }

    /**
     * SPP Rotation [X=Pitch, Y=Yaw, Z=Roll] -> Engine [X=Pitch, Y=Yaw, Z=Roll]
     */
    public static sppRotationToEngine(sppRot: [number, number, number]): [number, number, number] {
        return [
            sppRot[0], // Pitch
            sppRot[1], // Yaw
            sppRot[2]  // Roll
        ];
    }

    /**
     * Engine Rotation [X=Pitch, Y=Yaw, Z=Roll] -> SPP [X=Pitch, Y=Yaw, Z=Roll]
     */
    public static engineRotationToSpp(engineRot: [number, number, number]): [number, number, number] {
        return [
            engineRot[0], // Pitch
            engineRot[1], // Yaw
            engineRot[2]  // Roll
        ];
    }
    /**
     * Snap a value to the nearest grid step.
     */
    public static snapToGrid(value: number, resolution: number): number {
        return Math.round(value / resolution) * resolution;
    }
}
