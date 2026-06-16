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
     * Heading axis conversion — the SINGLE definition of the yaw↔heading mapping
     * between the engine (Three) frame and the canonical Septopus frame. EVERY
     * consumer (compass, 2D map, persistence) goes through here so the sign can
     * never drift again (this used to be hand-rolled per-renderer — a recurring bug).
     *
     * Septopus heading: radians, **0 = facing NORTH, increasing CLOCKWISE toward
     * EAST** (compass / navigation convention). Engine yaw ψ is rotation about
     * engine +Y; the facing vector in (East, North) is (-sinψ, cosψ), so the
     * compass heading H (CW from North) satisfies (sinH, cosH) = (-sinψ, cosψ)
     * ⇒ **H = -ψ**. On a north-up / east-right 2D view, rotate a north-pointing
     * marker CLOCKWISE by the heading. See docs/architecture/coordinate.md.
     * NOTE: engine-space 3D renderers (avatar mesh, minimap marker) keep using the
     * raw engine yaw — they live in the engine frame; only SPP/screen-space
     * consumers convert.
     */
    public static engineYawToHeading(engineYaw: number): number {
        return -engineYaw;
    }
    public static headingToEngineYaw(heading: number): number {
        return -heading;
    }

    /**
     * SPP Rotation [Pitch, Heading, Roll] -> Engine [Pitch, Yaw, Roll]. Inverse of
     * engineRotationToSpp — the spawn/restore round-trip relies on this pair. Only
     * the heading/yaw axis is reframed; pitch (about East=X, shared by both frames)
     * and roll (≈0 for the player body) pass through.
     */
    public static sppRotationToEngine(sppRot: [number, number, number]): [number, number, number] {
        return [
            sppRot[0],                          // Pitch
            this.headingToEngineYaw(sppRot[1]), // Heading -> engine Yaw
            sppRot[2]                           // Roll
        ];
    }

    /**
     * Engine Rotation [Pitch, Yaw, Roll] -> SPP [Pitch, Heading, Roll].
     */
    public static engineRotationToSpp(engineRot: [number, number, number]): [number, number, number] {
        return [
            engineRot[0],                          // Pitch
            this.engineYawToHeading(engineRot[1]), // engine Yaw -> Heading
            engineRot[2]                           // Roll
        ];
    }
    /**
     * Snap a value to the nearest grid step.
     */
    public static snapToGrid(value: number, resolution: number): number {
        return Math.round(value / resolution) * resolution;
    }
}
