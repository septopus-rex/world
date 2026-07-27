/**
 * Coords — the STATELESS axis-order and rotation conversions between the
 * Septopus data frame (X=East, Y=North, Z=Alt) and the engine frame (Three.js:
 * X=right, Y=up, Z=forward, north = −Z).
 *
 * Everything here is a pure function of its arguments. Conversions that need
 * the world's GEOMETRY (block offsets — i.e. anything taking a `[bx, by]`)
 * live on `world.metrics` instead (core/utils/WorldMetrics), because block size
 * comes from the world document and differs per world. This class used to carry
 * a mutable `BLOCK_SIZE` static for that; it was process-global and silently
 * shared between concurrent Worlds — see WorldMetrics for the full story.
 */
export class Coords {
    /**
     * Local SPP (Z-Up) -> Local Engine (Y-Up)
     * Identical axis mapping to WorldMetrics.septopusToEngine, without the
     * block offset (so it needs no world geometry).
     */
    public static localSeptopusToEngine(localSpp: [number, number, number]): [number, number, number] {
        return [
            localSpp[0],  // Engine X (East)
            localSpp[2],  // Engine Y (Alt)
            -localSpp[1] // Engine Z (North)
        ];
    }

    /**
     * SPP Size [East, North, Alt] -> Engine Box Dimensions [width, height, depth]
     * Engine width(X)  = SPP East(X)
     * Engine height(Y) = Septopus Alt(Z)
     * Engine depth(Z)  = SPP North(Y)
     */
    public static getBoxDimensions(septopusSize: [number, number, number]): [number, number, number] {
        return [
            septopusSize[0], // width (East)
            septopusSize[2], // height (Alt)
            septopusSize[1]  // depth (North)
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
     * Septopus Rotation [Pitch, Heading, Roll] -> Engine [Pitch, Yaw, Roll]. Inverse of
     * engineRotationToSeptopus — the spawn/restore round-trip relies on this pair. Only
     * the heading/yaw axis is reframed; pitch (about East=X, shared by both frames)
     * and roll (≈0 for the player body) pass through.
     */
    public static septopusRotationToEngine(septopusRot: [number, number, number]): [number, number, number] {
        return [
            septopusRot[0],                          // Pitch
            this.headingToEngineYaw(septopusRot[1]), // Heading -> engine Yaw
            septopusRot[2]                           // Roll
        ];
    }

    /**
     * Engine Rotation [Pitch, Yaw, Roll] -> SPP [Pitch, Heading, Roll].
     */
    public static engineRotationToSeptopus(engineRot: [number, number, number]): [number, number, number] {
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
