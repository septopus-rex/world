import { test, expect } from '@playwright/test';
import { bootDeterministic, waitForWorldReady, stepEngine } from './helpers';

// DEV-TOOL loop: stamp the demo test scene onto any block as a persistent draft,
// reload to prove it survives, then RESET STATE to wipe back to the pristine seed.
// Both write through the same DraftStore the editor uses (unified LocalDataSource
// seam), so this is the editor's "edit -> see result -> reset -> repeat" loop.

// [2050,2048] sits inside the boot window (extend=2 -> 2046..2050) but carries no
// authored content — just the procedural ground. A clean target to stamp onto.
const BX = 2050, BY = 2048;

async function settle(page: any) {
  await waitForWorldReady(page);
  await page.evaluate(() => (window as any).loader.engine.stop());
  await stepEngine(page, 30);
}

/** Adjunct census + draft flag for one block. */
async function blockCensus(page: any, bx: number, by: number) {
  return page.evaluate(([x, y]: [number, number]) => {
    const w = (window as any).loader.engine.getWorld();
    for (const eid of w.queryEntities('BlockComponent')) {
      const b = w.getComponent(eid, 'BlockComponent');
      if (b?.x === x && b?.y === y) {
        const count = w.queryEntities('AdjunctComponent')
          .map((id: number) => w.getComponent(id, 'AdjunctComponent'))
          .filter((a: any) => a?.parentBlockEntityId === eid).length;
        return { found: true, isDraft: !!b.isDraft, count };
      }
    }
    return { found: false, isDraft: false, count: 0 };
  }, [bx, by]);
}

test('stamp test scene onto an empty block, persist across reload, then reset', async ({ page }) => {
  // This test does two full reloads, each re-booting under SwiftShader software
  // rendering. Boot alone stalls the main thread ~29s (initial 25-block materialise
  // + shader compile after engine.stop() — measured identical on a clean tree), so
  // the 3-boot sequence lands right at ~86-90s. Give it headroom rather than flake
  // at the boundary (same batch-contention practice as the mahjong FPV budget).
  test.setTimeout(150_000);
  await bootDeterministic(page);

  // Seed state: the target block has only the procedural ground.
  const before = await blockCensus(page, BX, BY);
  expect(before.found).toBe(true);
  expect(before.isDraft).toBe(false);
  expect(before.count).toBeLessThan(5);

  // Stamp the (empty) target block. The UI button stamps the player's CURRENT
  // block (playerState.block); here we target a specific empty one directly —
  // same code path, just an explicit block instead of "where I'm standing".
  await page.evaluate(([x, y]: [number, number]) => (window as any).loader.stampTestScene(x, y), [BX, BY]);
  await stepEngine(page, 30);

  const stamped = await blockCensus(page, BX, BY);
  expect(stamped.isDraft).toBe(true);                 // now backed by a draft
  expect(stamped.count).toBeGreaterThan(20);          // full demo (incl. SPP expansion)
  // The draft is in the store, scoped to this block.
  expect(await page.evaluate(([x, y]: [number, number]) =>
    (window as any).loader.engine.getWorld().draftStore.hasDraft(0, x, y), [BX, BY])).toBe(true);

  // Reload → the stamp must survive (persisted in IndexedDB).
  await page.reload();
  await settle(page);
  const reloaded = await blockCensus(page, BX, BY);
  expect(reloaded.isDraft, 'stamped scene persisted across reload').toBe(true);
  expect(reloaded.count).toBeGreaterThan(20);

  // RESET STATE wipes ALL drafts, then a reload falls back to the pristine seed.
  // (The button is resetWorld = clearDrafts + reload; drive the wipe explicitly
  // here so the reload is playwright-controlled, not a self-triggered race.)
  await page.evaluate(() => (window as any).loader.engine.clearDrafts(0));
  await page.reload();
  await settle(page);
  const reset = await blockCensus(page, BX, BY);
  expect(reset.isDraft, 'reset wiped the draft').toBe(false);
  expect(reset.count, 'block fell back to the bare seed').toBeLessThan(5);
});
