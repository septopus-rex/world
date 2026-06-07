import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine } from '../helpers/make-world';

// Block eviction: streamed-in blocks must be destroyable (with their adjuncts +
// render handles) so memory stays bounded as the player roams. The desktop loader
// drives this via a view-window TTL; here we test the engine.removeBlock primitive.

const BLOCK = [0.2, 1, [[0x00a2, [[[1, 1, 1], [8, 8, 1], [0, 0, 0], 2, [1, 1], 0, 1]]]], []];

describe('block eviction (engine.removeBlock)', () => {
  it('destroys a block and its adjuncts', async () => {
    const engine = await makeHeadlessEngine();
    const world = engine.getWorld()!;

    engine.injectBlock({ x: 3000, y: 3000, world: 'main', adjuncts: BLOCK, elevation: 0.2 });
    for (let i = 0; i < 12; i++) engine.step(1 / 60); // build block + adjuncts

    const adjBefore = world.getEntitiesWith(['AdjunctComponent']).length;
    expect(adjBefore).toBeGreaterThan(0); // box + synthetic ground

    engine.removeBlock(3000, 3000);

    const blockGone = world.getEntitiesWith(['BlockComponent'])
      .every((id: number) => { const b = world.getComponent<any>(id, 'BlockComponent') as any; return !(b.x === 3000 && b.y === 3000); });
    expect(blockGone, 'block entity destroyed').toBe(true);
    expect(world.getEntitiesWith(['AdjunctComponent']).length, 'adjuncts destroyed').toBeLessThan(adjBefore);
  });

  it('is a safe no-op for an unknown block', async () => {
    const engine = await makeHeadlessEngine();
    expect(() => engine.removeBlock(9999, 9999)).not.toThrow();
  });
});
