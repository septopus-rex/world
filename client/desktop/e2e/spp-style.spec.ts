import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine } from './helpers';

// Workstream B — StylePacks through the REAL UI: enter the SPP sandbox, click
// the on-screen 风格 switcher, and confirm the SAME cell matrix re-expands into
// visibly different derived geometry (garden = more lattice pieces) and colour
// (brick = terracotta), then clears back. Spec: spp-protocol-full.md §3.B.
// Block [2047,2049].

const TAG = '2047_2049';

/** Census the SPP-derived a1 walls in the sandbox: how many, and which explicit
 *  colours they carry (slot-7 material.color baked by the StylePack). */
async function wallCensus(page: any): Promise<{ count: number; colors: number[] }> {
  return page.evaluate((tag: string) => {
    const w = (window as any).loader.engine.getWorld();
    let count = 0; const colors = new Set<number>();
    for (const eid of w.queryEntities('AdjunctComponent')) {
      const a = w.getComponent(eid, 'AdjunctComponent');
      if (a?.stdData?.typeId === 0x00a1 && String(a.adjunctId ?? '').includes(tag)) {
        count++;
        const c = a.stdData.material?.color;
        if (typeof c === 'number') colors.add(c);
      }
    }
    return { count, colors: [...colors] };
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
async function pumpUntil(page: any, cond: () => Promise<boolean>, maxRounds = 60): Promise<boolean> {
  for (let i = 0; i < maxRounds; i++) { await stepEngine(page, 4); if (await cond()) return true; }
  return false;
}

test('SPP style switcher: same cells recolour + re-geometry live, then clear', async ({ page }) => {
  test.setTimeout(180_000);
  await bootDeterministic(page);

  // Enter the sandbox; the SPP source + its derived walls materialize.
  await page.getByTestId('enter-sandbox').click();
  await expect(page.getByTestId('sandbox-bar')).toBeVisible();
  expect(await pumpUntil(page, () => sourceLoaded(page))).toBe(true);
  await stepEngine(page, 20);

  // The 风格 switcher is on the bar with the built-in visual packs.
  await expect(page.getByTestId('spp-style-switch')).toBeVisible();
  await expect(page.getByTestId('spp-style-basic')).toBeVisible();
  await expect(page.getByTestId('spp-style-brick')).toBeVisible();
  await expect(page.getByTestId('spp-style-garden')).toBeVisible();

  // Baseline: 'basic' → walls carry NO explicit colour (default grey).
  const basic = await wallCensus(page);
  expect(basic.count, 'basic expands some derived walls').toBeGreaterThan(5);
  expect(basic.colors, 'basic has no baked wall colour').toEqual([]);
  await page.screenshot({ path: 'test-results/spp-style-0-basic.png' });

  // Switch to brick → SAME cells, same footprint count, but terracotta colour.
  await page.getByTestId('spp-style-brick').click();
  expect(await pumpUntil(page, async () => (await wallCensus(page)).colors.includes(0x9c5a3c))).toBe(true);
  const brick = await wallCensus(page);
  expect(brick.colors, 'brick bakes its terracotta wall colour').toContain(0x9c5a3c);
  expect(brick.count, 'brick reuses basic variants → same wall count').toBe(basic.count);
  await stepEngine(page, 45); // let AdjunctSystem rebuild all derived meshes before the shot
  await page.screenshot({ path: 'test-results/spp-style-1-brick.png' });

  // Switch to garden → the lattice variant expands MORE pieces (geometry change),
  // and a green colour.
  await page.getByTestId('spp-style-garden').click();
  expect(await pumpUntil(page, async () => (await wallCensus(page)).colors.includes(0x5f8a3a))).toBe(true);
  const garden = await wallCensus(page);
  expect(garden.colors, 'garden bakes its green wall colour').toContain(0x5f8a3a);
  expect(garden.count, 'garden lattice expands more pieces than basic solids').toBeGreaterThan(basic.count);
  await stepEngine(page, 45);
  await page.screenshot({ path: 'test-results/spp-style-2-garden.png' });

  // Back to basic → override cleared, walls return to un-coloured default.
  await page.getByTestId('spp-style-basic').click();
  expect(await pumpUntil(page, async () => (await wallCensus(page)).colors.length === 0)).toBe(true);
  const cleared = await wallCensus(page);
  expect(cleared.colors, 'basic clears the override colour').toEqual([]);
  expect(cleared.count, 'and returns to the basic wall count').toBe(basic.count);
});
