import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine, playerPosition, mainCanvas, worldFlags, walkUntil } from './helpers';

// Trigger system end-to-end: real browser, real WebGL raycast, real input —
// through the FULL data path (mock raw b8 rows → deserialize → BlockSystem →
// TriggerSystem). The spawn block's trigger court (DesktopLoader.injectDemoAssets):
//   auto-door pad @ SPP [8,11.25] — in/out toggle `demo_gate` (+ door), hold(800ms) → `demo_hold`
//   touch button  @ SPP [12,10.5] — click sets `demo_touch` (+ spins the cone)
// Player spawns at SPP [8,8] (on the 6m spawn pillar) facing north; assertions
// read world.globalFlags.

/** Engine-Y (altitude) of the auto door — the visible reactor of the gate pad. */
async function doorAltitude(page: any): Promise<number | null> {
  return page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    for (const id of w.queryEntities('AdjunctComponent')) {
      const a = w.getComponent(id, 'AdjunctComponent');
      if (a?.adjunctId === 'adj_2048_2048_161_0') {
        return w.getComponent(id, 'TransformComponent')?.position[1] ?? null;
      }
    }
    return null;
  });
}

test('walking into and out of a trigger volume fires in/out actions', async ({ page }) => {
  await bootDeterministic(page);

  expect((await worldFlags(page)).demo_gate).toBeUndefined();
  const doorClosed = await doorAltitude(page);
  expect(doorClosed, 'auto door reactor should exist').not.toBeNull();

  // North into the gate pad → 'in' (flag set + door slides up)
  const entered = await walkUntil(page, [0, 1], async () => (await worldFlags(page)).demo_gate === true);
  expect(entered, 'player should enter the gate trigger walking north').toBe(true);
  expect(await doorAltitude(page), 'door should slide up on enter').toBeCloseTo(doorClosed! + 3.2, 3);

  // Back south out of it → 'out' (flag cleared + door slides back)
  const exited = await walkUntil(page, [0, -1], async () => (await worldFlags(page)).demo_gate === false);
  expect(exited, 'player should leave the gate trigger walking south').toBe(true);
  expect(await doorAltitude(page), 'door should slide back on exit').toBeCloseTo(doorClosed!, 3);
});

test('staying inside a volume fires hold after holdDuration (deterministic dt)', async ({ page }) => {
  await bootDeterministic(page);

  const entered = await walkUntil(page, [0, 1], async () => (await worldFlags(page)).demo_gate === true);
  expect(entered).toBe(true);

  // Just entered (≤ ~330ms inside): 800ms hold must not have fired yet.
  await stepEngine(page, 10);
  expect((await worldFlags(page)).demo_hold).toBeUndefined();

  // Stand still past the threshold: 60 more steps ≈ +1000ms.
  await stepEngine(page, 60);
  expect((await worldFlags(page)).demo_hold).toBe(true);
});

test('clicking a touch trigger volume fires its actions (real raycast)', async ({ page }) => {
  await bootDeterministic(page);
  await page.evaluate(() => (window as any).loader.setCameraView('first'));

  // Sidestep east until the touch volume (SPP E 11..13, N 9.5..11.5) is dead ahead.
  const startX = (await playerPosition(page))[0];
  const aligned = await walkUntil(page, [1, 0], async () => (await playerPosition(page))[0] >= startX + 3.5);
  expect(aligned, 'player should sidestep ~3.5m east').toBe(true);
  // The player walks off the spawn pillar top — wait for the fall to finish so
  // the eye-level ray ends up at volume height (alt 0..2.5), not 6m in the air.
  await stepEngine(page, 90);

  expect((await worldFlags(page)).demo_touch).toBeUndefined();

  // Click the canvas center: the camera ray (facing north) hits the invisible
  // trigger volume ~2.5m ahead; RaycastInteractionSystem routes it as 'interact'.
  await mainCanvas(page).click();
  await stepEngine(page, 3);

  expect((await worldFlags(page)).demo_touch).toBe(true);
});
