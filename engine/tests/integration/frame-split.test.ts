import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeHeadlessEngine } from '../helpers/make-world';

// Frame-split loading: streaming a whole region in at once must NOT build all of
// its adjunct meshes in a single frame (that stalls the 3D). BlockSystem and
// AdjunctSystem each cap work per frame, spreading the build across frames.

const region = JSON.parse(readFileSync(new URL('../fixtures/region.json', import.meta.url), 'utf8'));

describe('frame-split block/adjunct loading', () => {
  it('spreads adjunct mesh building across frames, and eventually builds all', async () => {
    const engine = await makeHeadlessEngine();
    const world = engine.getWorld()!;

    // Inject the whole 5x5 region (25 blocks x 5 box adjuncts) in one shot.
    for (const b of region.blocks) {
      engine.injectBlock({ x: b.x, y: b.y, world: 'main', adjuncts: b.raw, elevation: b.raw[0] });
    }

    const builtCount = () => world.getEntitiesWith(['AdjunctComponent'])
      .filter((id: number) => (world.getComponent<any>(id, 'AdjunctComponent') as any)?.isInitialized).length;

    expect(builtCount()).toBe(0); // nothing built before stepping

    engine.step(1 / 60);
    const afterOne = builtCount();
    // frame-split: one frame builds SOME but nowhere near the whole region (~150 adjuncts).
    expect(afterOne).toBeGreaterThan(0);
    expect(afterOne, `built ${afterOne} in one frame — should be bounded by the per-frame budget`).toBeLessThanOrEqual(20);

    // Pump frames; the backlog drains and everything builds.
    for (let i = 0; i < 60; i++) engine.step(1 / 60);

    const total = world.getEntitiesWith(['AdjunctComponent']).length;
    expect(total).toBeGreaterThanOrEqual(125);  // 125 boxes (+ synthetic grounds)
    expect(builtCount(), 'all adjuncts eventually built').toBe(total);
  });
});
