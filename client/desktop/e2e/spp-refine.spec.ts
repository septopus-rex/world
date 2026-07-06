import { test, expect } from '@playwright/test';
import { waitForWorldReady, stepEngine } from './helpers';

// Workstream D — recursive refinement in the REAL 3D pipeline (`?level=refine`).
// One b6 source expands two structures: a coarse 4m solid cell (level-0 faces)
// and the SAME footprint REFINED into a 2×2×2 grid of 2m children that inherit
// the parent's boundary faces. Confirms the finer walls become real derived
// entities and render. Spec: spp-protocol-full.md §3.D. Block [2050,2050].

const TAG = '2050_2050';

/** Census SPP-derived a1 walls by their largest dimension → level-0 (~4m coarse)
 *  vs level-1 (~2m refined). */
async function wallCensus(page: any): Promise<{ total: number; coarse: number; fine: number }> {
  return page.evaluate((tag: string) => {
    const w = (window as any).loader.engine.getWorld();
    let total = 0, coarse = 0, fine = 0;
    for (const eid of w.queryEntities('AdjunctComponent')) {
      const a = w.getComponent(eid, 'AdjunctComponent');
      if (a?.stdData?.typeId !== 0x00a1 || !String(a.adjunctId ?? '').includes(tag)) continue;
      total++;
      const maxDim = Math.max(a.stdData.x, a.stdData.y, a.stdData.z);
      if (Math.abs(maxDim - 4) < 0.01) coarse++;
      else if (Math.abs(maxDim - 2) < 0.01) fine++;
    }
    return { total, coarse, fine };
  }, TAG);
}
async function sourceLoaded(page: any): Promise<boolean> {
  return page.evaluate((tag: string) => {
    const w = (window as any).loader.engine.getWorld();
    for (const eid of w.queryEntities('AdjunctComponent')) {
      const a = w.getComponent(eid, 'AdjunctComponent');
      if (a?.stdData?.typeId === 0x00b6 && String(a.adjunctId ?? '').includes(tag)) return true;
    }
    return false;
  }, TAG);
}

test('SPP refinement expands finer walls in real 3D alongside a coarse control', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?level=refine');
  await waitForWorldReady(page);
  await page.evaluate(() => (window as any).loader.engine.stop());

  // Pump until the b6 source + its derived walls are live.
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { await stepEngine(page, 4); ok = await sourceLoaded(page); }
  expect(ok, 'the refine b6 source loaded').toBe(true);
  await stepEngine(page, 60); // let AdjunctSystem build all derived meshes

  const c = await wallCensus(page);
  // The coarse cell contributes level-0 (4m) faces; the refined room contributes
  // level-1 (2m) faces — BOTH present proves the recursion ran in the pipeline.
  expect(c.coarse, 'the coarse control cell rendered its 4m faces').toBeGreaterThan(0);
  expect(c.fine, 'the refined cell expanded into finer 2m walls').toBeGreaterThan(0);
  // The coarse solid cell alone = 6 faces; the refined room adds many finer walls.
  expect(c.total).toBeGreaterThan(6);

  await page.screenshot({ path: 'test-results/spp-refine-diorama.png' });
  // eslint-disable-next-line no-console
  console.log('REFINE census', JSON.stringify(c));
});
