import { test, expect } from '@playwright/test';
import { bootDeterministic, waitForWorldReady } from './helpers';

// The block window must stay BOUNDED as the player roams — the loader evicts
// blocks outside the (2*extend+1)^2 window immediately (matching the old engine's
// cross() algorithm). A wall-clock TTL grace used to let the resident set balloon
// into the hundreds under fast travel, which tanked the frame rate.

async function counts(page: any) {
  return page.evaluate(() => {
    const loader = (window as any).loader;
    const w = loader.engine.getWorld();
    return {
      loadedBlocks: loader.getLoadedBlockCount(),
      blockEntities: w.queryEntities('BlockComponent').length,
    };
  });
}

test('block window stays bounded as the player roams (eviction)', async ({ page }) => {
  await bootDeterministic(page);
  await waitForWorldReady(page);

  const atRest = await counts(page);
  // extend defaults to 2 → a 5x5 = 25 block window.
  expect(atRest.loadedBlocks).toBeLessThanOrEqual(25);
  expect(atRest.blockEntities).toBe(atRest.loadedBlocks);

  // Roam ~30 blocks east, letting each crossing's async fetch+inject settle
  // before the next (as in real play — crossings are seconds apart).
  await page.evaluate(async () => {
    const e = (window as any).loader.engine;
    const w = e.getWorld();
    const id = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
    const t = w.getComponent(id, 'TransformComponent');
    for (let k = 0; k < 30; k++) {
      t.position[0] += 16; // one block east (+X = East)
      for (let i = 0; i < 8; i++) e.step(1 / 60);
      await new Promise((r) => setTimeout(r, 0));
    }
    for (let i = 0; i < 8; i++) e.step(1 / 60);
  });

  const afterRoam = await counts(page);
  // The set must NOT grow with distance travelled — still ~one window.
  expect(afterRoam.loadedBlocks).toBeLessThanOrEqual(25);
  expect(afterRoam.blockEntities).toBe(afterRoam.loadedBlocks);
});
