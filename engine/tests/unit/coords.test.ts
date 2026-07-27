import { describe, it, expect } from 'vitest';
import { Coords } from '../../src/core/utils/Coords';

// L1 — pure unit. Every entity position passes through these conversions.
//
// Coords is STATELESS: only the axis-order and rotation mappings live here.
// Conversions that need the world's block size (anything taking a [bx, by])
// moved to WorldMetrics — see world-metrics.test.ts.

describe('Coords', () => {
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
