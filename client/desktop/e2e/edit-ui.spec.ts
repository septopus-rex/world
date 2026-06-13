import { test, expect } from '@playwright/test';
import { bootDeterministic, waitForWorldReady, stepEngine, mainCanvas } from './helpers';

// The COMPLETE creator flow driven purely through the real UI — no synthetic
// engine events for the user-facing steps:
//   React mode switcher → DOM palette button → REAL mouse click on the canvas
//   (raycast placement) → REAL right-click → context menu → edit form →
//   exit Edit (draft save) → REAL reload → everything persisted.
// This is the end-to-end data path: UI → InputProvider → RaycastInteraction →
// EditSystem(add/set) → BlockSerializer → DraftStore(IndexedDB) → re-boot.

/** Aim the camera straight-ish down so a canvas-center click rays onto the
 *  spawn pillar's top surface (inside the active edit block). */
async function aimDown(page: any) {
  await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    w.renderEngine.setMainCameraRotation(-0.9, 0, 0);
  });
  await stepEngine(page, 2);
}

async function canvasCenter(page: any): Promise<{ x: number; y: number }> {
  const box = await mainCanvas(page).boundingBox();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

/** Ids of all adjuncts in the spawn block (diffed to find what a click placed). */
async function adjunctIds(page: any): Promise<string[]> {
  return page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    return w.queryEntities('AdjunctComponent')
      .map((eid: number) => w.getComponent(eid, 'AdjunctComponent')?.adjunctId)
      .filter(Boolean);
  });
}

test('UI-only flow: palette place → right-click → edit form → draft saved', async ({ page }) => {
  await bootDeterministic(page);

  // 1. Enter Edit through the real switcher; the palette renders as DOM.
  await page.locator('[data-testid="mode-edit"]').click();
  await stepEngine(page, 8);
  const boxBtn = page.locator('.sept-ui-group button', { hasText: 'Box' });
  await expect(boxBtn).toBeVisible();

  // 2. Arm the palette with a REAL click, aim, and click the canvas center.
  await boxBtn.click();
  await aimDown(page);
  const before = await adjunctIds(page);
  const { x, y } = await canvasCenter(page);
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
  await stepEngine(page, 4);

  const placedId = (await adjunctIds(page)).find(id => !before.includes(id));
  expect(placedId, 'a new adjunct was placed by the canvas click').toBeTruthy();
  expect(placedId).toMatch(/^adj_2048_2048_162_\d+$/);   // a2 box

  // 3. Deselect (Done), then REAL right-click the new box → context menu.
  await page.locator('.sept-ui-group button', { hasText: 'Done' }).click();
  await stepEngine(page, 2);
  await page.mouse.click(x, y, { button: 'right' });
  await stepEngine(page, 3);
  const editBtn = page.locator('.sept-ui-group button', { hasText: 'Edit Properties' });
  await expect(editBtn).toBeVisible();

  // 4. Edit form: set Height to 2.5 and Apply.
  await editBtn.click();
  await stepEngine(page, 2);
  await expect(page.locator('.sept-ui-modal')).toBeVisible();
  await page.locator('.sept-ui-form-row', { has: page.locator('label', { hasText: 'Height' }) })
    .locator('input').fill('2.5');
  await page.locator('#edit-form-submit').click();
  await stepEngine(page, 3);

  const edited = await page.evaluate((id: string) => {
    const w = (window as any).loader.engine.getWorld();
    for (const eid of w.queryEntities('AdjunctComponent')) {
      const adj = w.getComponent(eid, 'AdjunctComponent');
      if (adj?.adjunctId === id) return { z: adj.stdData.z, x: adj.stdData.x };
    }
    return null;
  }, placedId!);
  expect(edited?.z).toBe(2.5);

  // 5. Exit Edit through the switcher — the session saves the draft.
  await page.locator('[data-testid="mode-normal"]').click();
  await stepEngine(page, 5);
  const draftRow = await page.evaluate(() => {
    const draft = (window as any).loader.engine.getWorld().draftStore.load(0, 2048, 2048);
    const boxes = draft?.raw?.[2]?.find((g: any[]) => g[0] === 0x00a2)?.[1] ?? [];
    return boxes.find((r: any[]) => r[0][0] === 1 && r[0][2] === 2.5) ?? null;
  });
  expect(draftRow, 'the placed+edited box reached the draft store').not.toBeNull();
});

test('UI-placed content survives a real reload (IndexedDB)', async ({ page }) => {
  await bootDeterministic(page);

  // Place one box purely through the UI.
  await page.locator('[data-testid="mode-edit"]').click();
  await stepEngine(page, 8);
  await page.locator('.sept-ui-group button', { hasText: 'Box' }).click();
  await aimDown(page);
  const before = await adjunctIds(page);
  const { x, y } = await canvasCenter(page);
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
  await stepEngine(page, 4);
  expect((await adjunctIds(page)).length).toBe(before.length + 1);

  // Exit Edit (saves), let the write-behind land, REAL reload.
  await page.locator('[data-testid="mode-normal"]').click();
  await stepEngine(page, 5);
  await page.evaluate(async () => {
    await (window as any).loader.engine.getWorld().draftStore.flush();
  });
  await page.reload();
  await waitForWorldReady(page);
  await page.evaluate(() => (window as any).loader.engine.stop());
  await stepEngine(page, 25);

  // The rebuilt world contains the palette-default 1×1×1 box on the pillar top.
  const survived = await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    for (const eid of w.queryEntities('AdjunctComponent')) {
      const adj = w.getComponent(eid, 'AdjunctComponent');
      const s = adj?.stdData;
      if (s?.typeId === 0x00a2 && s.x === 1 && s.y === 1 && s.z === 1 && s.oz > 5) {
        return { id: adj.adjunctId, oz: s.oz };
      }
    }
    return null;
  });
  expect(survived, 'UI-placed box rebuilt from the IndexedDB draft').not.toBeNull();
});
