import { test, expect } from '@playwright/test';
import { bootDeterministic } from './helpers';

// Regression for the confirmed thin-ground tunnelling bug: at a large frame dt the
// player falls fast; the substepped CharacterController collision must still catch
// the 0.1m ground instead of passing through it into the void.
//
// Steps are run SYNCHRONOUSLY in one evaluate so this isolates collision physics
// (no async block-streaming churn between frames — that path is backstopped by the
// void-recovery net, tested separately).

test('large-dt fall lands on the ground (no tunnel through the thin floor)', async ({ page }) => {
  await bootDeterministic(page);

  const minY = await page.evaluate(() => {
    const e = (window as any).loader.engine;
    const w = e.getWorld();
    const id = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
    const y = () => w.getComponent(id, 'TransformComponent').position[1];

    (window as any).loader.setPlayerMoveIntent(0, 1); // step off the spawn pad so it falls
    let min = y();
    for (let i = 0; i < 15; i++) {           // dt=0.1 = a worst-case frame hitch
      e.step(0.1);
      min = Math.min(min, y());
    }
    (window as any).loader.setPlayerMoveIntent(0, 0);
    return min;
  });

  // Falls from the ~6.9 spawn pad and must land on the ~0m ground, not sink to the void.
  expect(minY, `minY=${minY.toFixed(2)}`).toBeGreaterThan(-2);
});

// The user's actual symptom: walking across many block boundaries (with block
// streaming running between frames) at a large dt must never sink into the void —
// the controller hovers over not-yet-streamed blocks instead of falling through.
test('walking across blocks at large dt never sinks into the void', async ({ page }) => {
  // 240s: a REAL 24-sim-second walk crosses ~8 blocks and streams each one in
  // under SwiftShader. (It used to fit 90s only because the spawn showcase
  // pillar wedged the player in place — the walk never actually happened.)
  test.setTimeout(240_000);
  await bootDeterministic(page);
  await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 1));

  const y = () => page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const id = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
    return w.getComponent(id, 'TransformComponent').position[1];
  });

  let minY = await y();
  for (let b = 0; b < 40; b++) {
    await page.evaluate(() => { const e = (window as any).loader.engine; for (let i = 0; i < 6; i++) e.step(0.1); });
    await page.waitForTimeout(8); // let async block streaming resolve between bursts
    minY = Math.min(minY, await y());
  }
  await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 0));

  expect(minY, `minY=${minY.toFixed(2)}`).toBeGreaterThan(-2);
});
