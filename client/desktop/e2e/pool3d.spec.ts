import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine, enterGameAt } from './helpers';

// 3D in-world pool (PoolSystem) in the REAL client: zone-gated — walk onto the
// pool table block and ENTER Game to rack the balls; a break shot then rolls them
// with engine physics and the ball ENTITY transforms update (meshes follow).

function ballsState(page: any) {
  return page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const out: any[] = [];
    for (const eid of w.getEntitiesWith(['PoolBallComponent', 'TransformComponent'])) {
      const b = w.getComponent(eid, 'PoolBallComponent');
      const t = w.getComponent(eid, 'TransformComponent');
      out.push({ id: b.ballId, x: b.x, y: b.y, potted: b.potted, ex: t.position[0], ez: t.position[2] });
    }
    return out.sort((a, b) => a.id - b.id);
  });
}

// Top-down view of the table (set camera directly + render once — no step, so the
// follow-camera doesn't override it).
async function frameTable(page: any) {
  await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    let cx = 0, cy = 0, cz = 0, n = 0;
    for (const eid of w.getEntitiesWith(['PoolBallComponent', 'TransformComponent'])) {
      const t = w.getComponent(eid, 'TransformComponent');
      cx += t.position[0]; cy += t.position[1]; cz += t.position[2]; n++;
    }
    if (!n) return;
    cx /= n; cy /= n; cz /= n;
    const re = w.renderEngine;
    re.setMainCameraPosition(cx, cy + 8, cz + 0.01);
    re.setMainCameraLookAt(cx, cy, cz);
    re.render(false);
  });
}

test('3D pool: balls rack, a break shot rolls them in the client', async ({ page }) => {
  test.setTimeout(180_000); // software WebGL + many engine.step renders is slow
  await bootDeterministic(page);
  // Walk into the pool table zone (north of spawn) + enter Game → the balls rack.
  expect(await enterGameAt(page, [2048, 2049], [8, 8, 2]), 'entered Game in the pool zone').toBe(true);

  const racked = await ballsState(page);
  expect(racked.length, '7 balls racked (cue + 6 object)').toBe(7);
  expect(racked[0].id).toBe(0);
  expect(racked.every((b) => !b.potted)).toBe(true);

  await frameTable(page);
  await page.screenshot({ path: 'test-results/pool3d-racked.png' });

  // Break: strike the cue due East (table coords) into the pack.
  const fired = await page.evaluate(() => (window as any).loader.engine.poolShoot(0, 1));
  expect(fired, 'shot accepted').toBe(true);
  await stepEngine(page, 60);

  const after = await ballsState(page);
  const cue0 = racked.find((b) => b.id === 0)!;
  const cueN = after.find((b) => b.id === 0)!;
  expect(cueN.x, 'cue advanced East').toBeGreaterThan(cue0.x + 0.3);
  const disturbed = after.slice(1).some((b, i) => Math.hypot(b.x - racked[i + 1].x, b.y - racked[i + 1].y) > 0.05);
  expect(disturbed, 'the pack was struck').toBe(true);
  for (const b of after) {
    if (b.potted) continue;
    expect(Math.abs(b.x - 8), 'in bounds E/W').toBeLessThanOrEqual(3.5 + 1e-3);
    expect(Math.abs(b.y - 8), 'in bounds N/S').toBeLessThanOrEqual(2 + 1e-3);
  }
  // The ball ENTITY transform moved (mesh follows): cue's engine X/Z changed.
  expect(Math.hypot(cueN.ex - cue0.ex, cueN.ez - cue0.ez), 'cue mesh moved in 3D').toBeGreaterThan(0.2);

  await frameTable(page);
  await page.screenshot({ path: 'test-results/pool3d-after-break.png' });
  console.log('POOL3D', JSON.stringify({ racked: racked.length, cueAdvance: cueN.x - cue0.x, disturbed }));
});
