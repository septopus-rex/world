import { describe, it, expect } from 'vitest';
import { AdjunctBox } from '../../src/plugins/adjunct/basic_box';
import { BasicWallAdjunct } from '../../src/plugins/adjunct/basic_wall';
import { BasicConeAdjunct } from '../../src/plugins/adjunct/basic_cone';
import { BasicSphereAdjunct } from '../../src/plugins/adjunct/basic_sphere';

// L1 — proves the 0D adjunct wiring: each registered primitive has a real
// attribute.deserialize (raw -> STD) AND transform.stdToRenderData (STD -> render).
// Without attribute.deserialize, BlockSystem silently skips the adjunct (renders nothing).

// Raw Septopus layout: [ size[E,N,Alt], pos[ox,oy,oz], rot, resource, repeat, anim, stop ]
const RAW = [[2, 3, 4], [8, 8, 1], [0, 0, 0], 2, [1, 1], 0, 0];

const CASES = [
  { name: 'wall', def: BasicWallAdjunct, typeId: 0x00a1, renderType: 'box' },
  { name: 'box', def: AdjunctBox, typeId: 0x00a2, renderType: 'box' },
  { name: 'cone', def: BasicConeAdjunct, typeId: 0x00a6, renderType: 'cone' },
  { name: 'ball/sphere', def: BasicSphereAdjunct, typeId: 0x00a7, renderType: 'sphere' },
];

describe('primitive adjuncts — 0D wiring (deserialize + transform)', () => {
  for (const c of CASES) {
    describe(c.name, () => {
      it(`declares chain type-id 0x${c.typeId.toString(16)}`, () => {
        expect(c.def.hooks.reg().typeId).toBe(c.typeId);
      });

      it('has an attribute.deserialize (else BlockSystem skips it silently)', () => {
        expect(typeof c.def.attribute?.deserialize).toBe('function');
      });

      it('deserializes raw -> STD then transforms to render data', () => {
        const std = c.def.attribute!.deserialize(RAW);
        expect([std.x, std.y, std.z]).toEqual([2, 3, 4]);
        expect([std.ox, std.oy, std.oz]).toEqual([8, 8, 1]);

        const out = c.def.transform!.stdToRenderData!([std], 0);
        expect(out).toHaveLength(1);
        expect(out[0].type).toBe(c.renderType);
        expect(out[0].params.position).toEqual([8, 8, 1]);
      });
    });
  }
});
