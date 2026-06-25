import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine, mainCanvas } from './helpers';

// Pre-placement params: arming a palette type opens a non-blocking form pre-filled
// with the placement defaults, MINUS position/rotation (those are set in 3D space).
// Tweaking + Apply, then clicking a surface, places the adjunct with the tweaked
// values — size/colour/etc. from the form, position from the click.

async function aimDown(page: any) {
  await page.evaluate(() => (window as any).loader.engine.getWorld().renderEngine.setMainCameraRotation(-0.9, 0, 0));
  await stepEngine(page, 2);
}
async function canvasCenter(page: any) {
  const box = await mainCanvas(page).boundingBox();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}
async function boxIds(page: any): Promise<string[]> {
  return page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    return w.queryEntities('AdjunctComponent')
      .map((eid: number) => w.getComponent(eid, 'AdjunctComponent')?.adjunctId)
      .filter((id: string) => id && id.includes('_162_')); // a2 box = typeDec 162
  });
}

test('pre-placement form: tweak size (position filtered), then place with tweaks', async ({ page }) => {
  await bootDeterministic(page);

  // Enter Edit; arm the Box palette button → the pre-placement form opens.
  await page.locator('[data-testid="mode-edit"]').click();
  await stepEngine(page, 8);
  await page.locator('.sept-ui-group button', { hasText: 'Box' }).click();
  await stepEngine(page, 2);

  const form = page.locator('#place-form');
  await expect(form, 'pre-placement form opened on arm').toBeVisible();

  // Position/rotation are filtered out — set in 3D space, not here.
  await expect(
    form.locator('.sept-ui-form-row', { has: page.locator('label', { hasText: 'X Offset' }) }),
    'position fields are filtered from the placement form',
  ).toHaveCount(0);
  // ...but size IS editable.
  const widthRow = form.locator('.sept-ui-form-row', { has: page.locator('label', { hasText: 'Width (E)' }) });
  await expect(widthRow).toHaveCount(1);

  // Tweak size, then Apply (captures params; form closes).
  await widthRow.locator('input').fill('3.5');
  await form.locator('.sept-ui-form-row', { has: page.locator('label', { hasText: 'Height' }) }).locator('input').fill('2.5');
  await page.locator('#place-form-submit').click();
  await stepEngine(page, 2);

  // Now place: aim down and click a surface inside the active block.
  await aimDown(page);
  const before = await boxIds(page);
  const { x, y } = await canvasCenter(page);
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
  await stepEngine(page, 4);

  const placedId = (await boxIds(page)).find((id) => !before.includes(id));
  expect(placedId, 'a box was placed by the canvas click').toBeTruthy();

  // The placed box carries the TWEAKED size (form), and a clicked position (NOT a
  // form value): default box is 1×1×1 — proving the pre-placement params applied.
  const placed = await page.evaluate((id: string) => {
    const w = (window as any).loader.engine.getWorld();
    for (const eid of w.queryEntities('AdjunctComponent')) {
      const a = w.getComponent(eid, 'AdjunctComponent');
      if (a?.adjunctId === id) return { x: a.stdData.x, y: a.stdData.y, z: a.stdData.z, ox: a.stdData.ox, oy: a.stdData.oy };
    }
    return null;
  }, placedId!);
  expect(placed!.x, 'width came from the form').toBe(3.5);
  expect(placed!.z, 'height came from the form').toBe(2.5);
  expect(placed!.y, 'untouched dimension kept its default').toBe(1);
  // Position came from the click (inside the 16×16 block), not the form.
  expect(placed!.ox).toBeGreaterThan(0);
  expect(placed!.ox).toBeLessThan(16);

  await page.screenshot({ path: 'test-results/edit-place-params.png' });
});
