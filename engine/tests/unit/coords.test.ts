import { describe, it, expect, beforeEach } from 'vitest';
import { Coords } from '../../src/core/utils/Coords';

// L1 — pure unit. Every entity position passes through these conversions.

describe('Coords', () => {
  beforeEach(() => {
    // BLOCK_SIZE is a mutable static (set from config at World construction).
    // Pin it so tests don't couple to global init order.
    Coords.BLOCK_SIZE = 16;
  });

  it('sppToEngine maps Alt(Z)->EngineY and North(+Y)->Engine -Z', () => {
    const [ex, ey, ez] = Coords.sppToEngine([8, 8, 1], [1, 1]); // block [1,1] => zero offset
    expect(ex).toBe(8);  // East
    expect(ey).toBe(1);  // Alt -> Engine Y
    expect(ez).toBe(-8); // North -> -Z
  });

  it('sppToEngine -> engineToSpp round-trips for in-block positions', () => {
    const block: [number, number] = [2048, 2048];
    const pos: [number, number, number] = [8, 8, 1];
    const back = Coords.engineToSpp(Coords.sppToEngine(pos, block));
    expect(back.block).toEqual(block);
    expect(back.pos[0]).toBeCloseTo(pos[0]);
    expect(back.pos[1]).toBeCloseTo(pos[1]);
    expect(back.pos[2]).toBeCloseTo(pos[2]);
  });

  it('localSppToEngine flips North to -Z (no block offset)', () => {
    expect(Coords.localSppToEngine([3, 5, 2])).toEqual([3, 2, -5]);
  });

  it('getBoxDimensions swaps SPP [East,North,Alt] -> Engine [w,h,d]', () => {
    expect(Coords.getBoxDimensions([3, 4, 5])).toEqual([3, 5, 4]);
  });

  it('snapToGrid rounds to nearest resolution step', () => {
    expect(Coords.snapToGrid(7, 2)).toBe(8);
    expect(Coords.snapToGrid(0.4, 0.5)).toBe(0.5);
    expect(Coords.snapToGrid(0.24, 0.5)).toBe(0);
  });
});
