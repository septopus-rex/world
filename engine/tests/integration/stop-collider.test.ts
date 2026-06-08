import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine } from '../helpers/make-world';
import { getBuiltinAdjunct } from '../../src/core/services/AdjunctRegistry';

// stop adjunct (chain b4 / 0x00b4): an invisible collider. The new engine's
// collision is generic — CharacterController collides against any SolidComponent —
// so a stop adjunct just has to mark std.stop so BlockSystem attaches one. Here we
// prove it dispatches (not a fallback box) and produces a SolidComponent sized to
// the authored barrier; the actual blocking/standing is the same SolidComponent
// path already covered by the physics tests.

// stop instance: [size[E,N,Alt], offset, rot, mode(1 BODY), animate]. typeId 0x00b4.
const BLOCK = [0.2, 1, [[0x00b4, [[[4, 1, 3], [8, 8, 1.5], [0, 0, 0], 1, 0]]]], []];

describe('stop adjunct (b4) — invisible collider', () => {
  it('is registered and dispatched (not a fallback box)', () => {
    const def = getBuiltinAdjunct(0x00b4);
    expect(def).toBeTruthy();
    expect(def!.hooks.reg().typeId).toBe(0x00b4);
    expect(typeof def!.attribute?.deserialize).toBe('function');
  });

  it('attaches a SolidComponent collider sized to the barrier', async () => {
    const engine = await makeHeadlessEngine();
    const world = engine.getWorld()!;

    engine.injectBlock({ x: 3000, y: 3000, world: 'main', adjuncts: BLOCK, elevation: 0.2 });
    for (let i = 0; i < 12; i++) engine.step(1 / 60); // build block + adjuncts

    // getBoxDimensions([E=4, N=1, Alt=3]) = [w=4, h=3, d=1] — distinct from the
    // synthetic ground collider ([16, 0.1, 16]).
    const solids = world.getEntitiesWith(['SolidComponent']);
    const hasBarrier = solids.some((id: number) => {
      const s = world.getComponent<any>(id, 'SolidComponent');
      return s && s.size[0] === 4 && s.size[1] === 3 && s.size[2] === 1;
    });
    expect(hasBarrier, 'stop adjunct produced a 4x3x1 SolidComponent').toBe(true);

    // It also rendered a (translucent) adjunct entity — i.e. it was handled by the
    // stop logic, not skipped.
    const adj = world.getEntitiesWith(['AdjunctComponent']).map((id: number) =>
      world.getComponent<any>(id, 'AdjunctComponent'));
    expect(adj.some((a: any) => a?.logicModule?.hooks?.reg?.().typeId === 0x00b4)).toBe(true);
  });
});
