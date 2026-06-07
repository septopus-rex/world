import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine, playerPosition, cameraYaw, mainCanvas } from './helpers';

// "Auto-moving the user / view" — driven deterministically via the engine's
// move-intent API + step(dt) (headless rAF is throttled, so we step manually).

test('auto-move forward changes the player position (locomotion)', async ({ page }) => {
  await bootDeterministic(page);

  const before = await playerPosition(page);
  await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 1)); // forward
  await stepEngine(page, 60);
  await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 0)); // stop
  const after = await playerPosition(page);

  const moved = Math.hypot(after[0] - before[0], after[2] - before[2]);
  expect(moved, `before=${before} after=${after}`).toBeGreaterThan(1);
});

test('auto-rotating the view (ArrowLeft) changes the camera yaw', async ({ page }) => {
  await bootDeterministic(page);

  const yaw0 = await cameraYaw(page);
  await mainCanvas(page).click(); // focus the page for keyboard input
  await page.keyboard.down('ArrowLeft');
  await stepEngine(page, 40); // yaw integrates while the key is held
  await page.keyboard.up('ArrowLeft');
  const yaw1 = await cameraYaw(page);

  expect(yaw1, `yaw0=${yaw0} yaw1=${yaw1}`).not.toBeCloseTo(yaw0, 3);
});
