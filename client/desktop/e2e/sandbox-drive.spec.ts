import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine } from './helpers';

// Drive the SPP sandbox through the REAL UI exactly as a user would: click the
// on-screen button to enter, tap canvas faces to sculpt, drag to orbit, click
// Exit. Captures the presentation at each stage so it can be eyeballed against
// expectations. Block [2047,2049].

const TAG = '2047_2049';

async function pumpUntil(page: any, cond: () => Promise<boolean>, maxRounds = 60): Promise<boolean> {
  for (let i = 0; i < maxRounds; i++) { await stepEngine(page, 4); if (await cond()) return true; }
  return false;
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
async function faceTally(page: any) {
  return page.evaluate((tag: string) => {
    const w = (window as any).loader.engine.getWorld();
    for (const eid of w.queryEntities('AdjunctComponent')) {
      const a = w.getComponent(eid, 'AdjunctComponent');
      if (a?.stdData?.typeId === 0x00b6 && String(a.adjunctId ?? '').includes(tag)) {
        const all = a.stdData.cells.flatMap((c: any) => c.faces);
        return {
          nonSolid: all.filter((f: any) => !(f[0] === 1 && f[1] === 0)).length,
          doorsWindows: all.filter((f: any) => f[0] === 1 && (f[1] === 1 || f[1] === 2)).length,
        };
      }
    }
    return { nonSolid: -1, doorsWindows: -1 };
  }, TAG);
}
const mode = (page: any) => page.evaluate(() => (window as any).loader.engine.getWorld().mode);
const azimuth = (page: any) => page.evaluate(() =>
  (window as any).loader.engine.getWorld().systems.findSystemByName('CharacterController').getObserveState().azimuth);

test('drive the SPP sandbox through the real UI and capture each stage', async ({ page }) => {
  test.setTimeout(120_000);
  await bootDeterministic(page);

  // (1) The entry button is present in the normal HUD.
  await expect(page.getByTestId('enter-sandbox')).toBeVisible();
  await page.screenshot({ path: 'test-results/drive-0-button.png' });

  // (2) Click it for real → the sandbox bar appears, mode flips to observe.
  await page.getByTestId('enter-sandbox').click();
  await expect(page.getByTestId('sandbox-bar')).toBeVisible();
  expect(await pumpUntil(page, () => sourceLoaded(page))).toBe(true);
  await stepEngine(page, 20);
  expect(await mode(page)).toBe('observe');
  expect((await faceTally(page)).nonSolid).toBe(9); // 9 cells start with their Top open, rest solid
  await page.screenshot({ path: 'test-results/drive-1-entered.png' });

  // (3) TWO-LEVEL edit through the real UI. First tap near centre OPENS a cell —
  // the bar switches to its editing state (the "退出该格" button appears) and no
  // face has changed yet.
  const canvas = page.locator('canvas[data-engine]');
  const b = (await canvas.boundingBox())!;
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const before = await faceTally(page);
  await page.mouse.click(cx, cy); await stepEngine(page, 2);
  await expect(page.getByTestId('close-cell'), 'first tap opened a cell for editing').toBeVisible();
  expect(await page.evaluate(() => (window as any).loader.sandboxSelectedCell), 'a cell is open').not.toBeNull();
  expect((await faceTally(page)).nonSolid, 'opening a cell does not edit it').toBe(before.nonSolid);
  await page.screenshot({ path: 'test-results/drive-2a-selected.png' });

  // (3b) Tap the open cell's camera-facing faces (a tight cluster around centre,
  // since only THIS cell is editable now) → carve doorways/windows.
  const cluster: Array<[number, number]> = [[-26, 18], [24, 16], [0, 30], [-22, 18], [22, 18]];
  for (const [dx, dy] of cluster) { await page.mouse.click(cx + dx, cy + dy); await stepEngine(page, 2); }
  await stepEngine(page, 6);
  const carved = await faceTally(page);
  expect(carved.nonSolid, 'taps on the open cell carved its faces').toBeGreaterThan(before.nonSolid);
  expect(carved.doorsWindows, 'at least one doorway/window appeared').toBeGreaterThanOrEqual(1);
  await page.screenshot({ path: 'test-results/drive-2-carved.png' });

  // (3c) Close the cell (bar button) → back to cell-picking; the editing button goes.
  await page.getByTestId('close-cell').click();
  await expect(page.getByTestId('close-cell')).toBeHidden();
  expect(await page.evaluate(() => (window as any).loader.sandboxSelectedCell), 'no cell open').toBeNull();

  // (4) Drag to orbit the camera (real mouse drag) → a new viewing angle.
  const az0 = await azimuth(page);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 10; i++) { await page.mouse.move(cx - 26 * (i + 1), cy + 6 * (i + 1)); await stepEngine(page, 1); }
  await page.mouse.up();
  await stepEngine(page, 6);
  expect(Math.abs((await azimuth(page)) - az0)).toBeGreaterThan(0.2); // it actually orbited
  await page.screenshot({ path: 'test-results/drive-3-orbited.png' });

  // (5) Exit via the bar button → back to normal, sandbox bar gone.
  await page.getByTestId('exit-sandbox').click();
  await expect(page.getByTestId('sandbox-bar')).toBeHidden();
  await stepEngine(page, 10);
  expect(await mode(page)).toBe('normal');
  await page.screenshot({ path: 'test-results/drive-4-exited.png' });
});
