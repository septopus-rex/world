import { describe, it, expect, beforeEach } from 'vitest';
import { Coords } from '../../src/core/utils/Coords';

// L1 — pure unit. Every entity position passes through these conversions.

describe('Coords', () => {
  beforeEach(() => {
    // BLOCK_SIZE is a mutable static (set from config at World construction).
    // Pin it so tests don't couple to global init order.
    Coords.BLOCK_SIZE = 16;
  });

  it('septopusToEngine maps Alt(Z)->EngineY and North(+Y)->Engine -Z', () => {
    const [ex, ey, ez] = Coords.septopusToEngine([8, 8, 1], [1, 1]); // block [1,1] => zero offset
    expect(ex).toBe(8);  // East
    expect(ey).toBe(1);  // Alt -> Engine Y
    expect(ez).toBe(-8); // North -> -Z
  });

  it('septopusToEngine -> engineToSeptopus round-trips for in-block positions', () => {
    const block: [number, number] = [2048, 2048];
    const pos: [number, number, number] = [8, 8, 1];
    const back = Coords.engineToSeptopus(Coords.septopusToEngine(pos, block));
    expect(back.block).toEqual(block);
    expect(back.pos[0]).toBeCloseTo(pos[0]);
    expect(back.pos[1]).toBeCloseTo(pos[1]);
    expect(back.pos[2]).toBeCloseTo(pos[2]);
  });

  it('localSeptopusToEngine flips North to -Z (no block offset)', () => {
    expect(Coords.localSeptopusToEngine([3, 5, 2])).toEqual([3, 2, -5]);
  });

  it('getBoxDimensions swaps SPP [East,North,Alt] -> Engine [w,h,d]', () => {
    expect(Coords.getBoxDimensions([3, 4, 5])).toEqual([3, 5, 4]);
  });

  it('snapToGrid rounds to nearest resolution step', () => {
    expect(Coords.snapToGrid(7, 2)).toBe(8);
    expect(Coords.snapToGrid(0.4, 0.5)).toBe(0.5);
    expect(Coords.snapToGrid(0.24, 0.5)).toBe(0);
  });

  // Heading: the single yaw↔heading definition every renderer goes through.
  // Septopus heading = 0 north, CW toward east; H = -engineYaw.
  it('engineYawToHeading negates yaw (compass CW-from-North) and is self-inverse', () => {
    expect(Coords.engineYawToHeading(0)).toBe(-0);           // facing North
    expect(Coords.engineYawToHeading(Math.PI / 2)).toBeCloseTo(-Math.PI / 2); // engine +yaw = West
    expect(Coords.headingToEngineYaw(Coords.engineYawToHeading(1.23))).toBeCloseTo(1.23);
  });

  it('engineRotationToSeptopus <-> septopusRotationToEngine round-trip (spawn/restore safety)', () => {
    const engine: [number, number, number] = [0.1, 1.2, -0.3];
    const spp = Coords.engineRotationToSeptopus(engine);
    expect(spp[1]).toBeCloseTo(-1.2);                        // yaw reframed to heading
    const back = Coords.septopusRotationToEngine(spp);
    expect(back[0]).toBeCloseTo(engine[0]);                  // pitch passes through
    expect(back[1]).toBeCloseTo(engine[1]);                  // yaw restored exactly
    expect(back[2]).toBeCloseTo(engine[2]);                  // roll passes through
  });
});
