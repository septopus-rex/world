import { test, expect } from '@playwright/test';
import { bootDeterministic, waitForWorldReady, stepEngine } from './helpers';

// "写入 block": after sculpting in the sandbox, saveSandbox() re-serializes the
// live block (b6 SOURCE kept, derived pieces dropped) into the DraftStore. This
// proves the sculpt is WRITTEN and DISPLAYS correctly across a real reload — the
// block must come back from the draft (not the fresh procedural seed) and the b6
// re-expands into walls. Block [2047,2049].

const TAG = '2047_2049';
const SEED = JSON.stringify(Array.from({ length: 9 }, () => [[0, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0]]));

async function pumpUntil(page: any, cond: () => Promise<boolean>, maxRounds = 60): Promise<boolean> {
  for (let i = 0; i < maxRounds; i++) { await stepEngine(page, 4); if (await cond()) return true; }
  return false;
}
async function sandboxCells(page: any) {
  return page.evaluate((tag: string) => {
    const w = (window as any).loader.engine.getWorld();
    for (const eid of w.queryEntities('AdjunctComponent')) {
      const a = w.getComponent(eid, 'AdjunctComponent');
      if (a?.stdData?.typeId === 0x00b6 && String(a.adjunctId ?? '').includes(tag))
        return JSON.parse(JSON.stringify(a.stdData.cells.map((c: any) => c.faces)));
    }
    return null;
  }, TAG);
}
async function derivedWalls(page: any) {
  return page.evaluate((tag: string) => {
    const w = (window as any).loader.engine.getWorld();
    let n = 0;
    for (const eid of w.queryEntities('AdjunctComponent')) {
      const a = w.getComponent(eid, 'AdjunctComponent');
      if (a?.stdData?.derivedFrom && String(a.stdData.derivedFrom).includes(tag) && a.stdData.typeId === 0x00a1) n++;
    }
    return n;
  }, TAG);
}
async function settleReload(page: any) {
  await waitForWorldReady(page);
  await page.evaluate(() => (window as any).loader.engine.stop());
  await stepEngine(page, 60);
}

test('sculpt → write to block → reload → the block displays the persisted structure', async ({ page }) => {
  test.setTimeout(120_000);
  await bootDeterministic(page);

  // Enter + sculpt a non-trivial structure (several faces away from the seed).
  await page.evaluate(() => (window as any).loader.enterSandbox());
  await pumpUntil(page, async () => (await sandboxCells(page)) !== null);
  await stepEngine(page, 20);
  // Sculpt via the two-level API: open a cell, cycle some of its faces, move on.
  // Deterministic (no ray aiming) so the reload comparison is byte-exact.
  await page.evaluate(() => {
    const L = (window as any).loader;
    L.sandboxSelectCell(0); L.sandboxCycleFace(0, 2); L.sandboxCycleFace(0, 3);
    L.sandboxSelectCell(4); L.sandboxCycleFace(4, 2); L.sandboxCycleFace(4, 4); L.sandboxCycleFace(4, 4);
    L.sandboxSelectCell(5); L.sandboxCycleFace(5, 3);
    L.sandboxDeselect();
  });
  await stepEngine(page, 6);

  const sculpted = await sandboxCells(page);
  expect(JSON.stringify(sculpted), 'sculpt actually changed the grid off the seed').not.toBe(SEED);
  await page.screenshot({ path: 'test-results/sandbox-persist-before.png' });

  // Write into the block + flush to IndexedDB.
  expect(await page.evaluate(() => (window as any).loader.saveSandbox())).toBe(true);

  // Reload the whole app — the block must rebuild from the DRAFT, not the seed.
  await page.reload();
  await settleReload(page);
  await page.evaluate(() => (window as any).loader.enterSandbox());
  expect(await pumpUntil(page, async () => (await sandboxCells(page)) !== null)).toBe(true);
  await stepEngine(page, 20);

  // (1) WRITTEN: the restored cells equal the sculpted ones (not the seed).
  const restored = await sandboxCells(page);
  expect(JSON.stringify(restored)).not.toBe(SEED);   // proves draft loaded, not seed
  expect(restored).toEqual(sculpted);                // byte-for-byte the same structure

  // (2) DISPLAYS: the persisted b6 re-expanded into walls.
  expect(await derivedWalls(page)).toBeGreaterThan(10);
  await page.screenshot({ path: 'test-results/sandbox-persisted.png' });
});
