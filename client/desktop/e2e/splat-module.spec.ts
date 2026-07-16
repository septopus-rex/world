import { test, expect } from '@playwright/test';
import { waitForWorldReady, stepEngine } from './helpers';

// Gaussian-splat content through the REAL a4 module pipeline (not the earlier
// RenderEngine.loadSplat spike): gallery exhibit ㉑ ([2000,1020]) places TWO
// module rows referencing the SAME synthetic test splat (resource 39) at
// different positions/sizes — same reuse pattern as ③'s two pagodas sharing
// resource 27. This is also the empirical check for whether
// ResourceManager.instance()'s splat branch (fresh SplatMesh sharing the
// template's PackedSplats) actually gives each placement an independent
// transform, since SplatMesh has no working clone()/copy(). A THIRD placement
// (resource 40) is a REAL World Labs Marble-generated splat — the exhibit's
// permanent "actual output" example, generated once via the 🌍 World Labs
// panel (marble-1.1-plus, "a Protoss village from StarCraft…") and saved as
// a static demo asset (client/desktop/public/assets/protoss-village.spz).

test('㉑ 高斯泼溅展项:合成测试数据两处独立摆放 + 一处真实 Marble 生成结果', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?level=gallery');
  await waitForWorldReady(page);
  await page.evaluate(() => (window as any).loader.engine.stop());
  await stepEngine(page, 60);

  await page.evaluate(() => (window as any).loader.teleportSeptopus([2000, 1020], [8, 8, 1.2]));

  // Wait for all THREE instances to exist AND finish decoding (numSplats > 0)
  // — not just "the object exists": the real Marble asset (resource 40) is a
  // village scene, an order of magnitude bigger than the synthetic 16k-point
  // test sphere, so its async decode genuinely takes longer to settle.
  let instances: any[] = [];
  for (let i = 0; i < 60 && (instances.length < 3 || instances.some((x) => !x.numSplats)); i++) {
    await stepEngine(page, 15);
    await page.waitForTimeout(150); // give the browser's own event loop a real tick to progress the async decode
    instances = await page.evaluate(() => {
      const w = (window as any).loader.engine.getWorld();
      const found: any[] = [];
      w.renderEngine.sceneInstance.traverse((obj: any) => {
        if (obj.userData?.isSplatInstance) {
          found.push({
            numSplats: obj.numSplats ?? null,
            resourceId: obj.userData.resourceId,
            pos: [obj.matrixWorld.elements[12], obj.matrixWorld.elements[13], obj.matrixWorld.elements[14]],
            scale: [obj.scale.x, obj.scale.y, obj.scale.z],
          });
        }
      });
      return found;
    });
  }

  expect(instances.length, JSON.stringify(instances)).toBe(3);
  for (const inst of instances) {
    expect(inst.numSplats, JSON.stringify(inst)).toBeGreaterThan(0);
  }

  const synthetic = instances.filter((i) => i.resourceId === '39');
  const real = instances.filter((i) => i.resourceId === '40');
  expect(synthetic.length, JSON.stringify(instances)).toBe(2);
  expect(real.length, JSON.stringify(instances)).toBe(1);
  // The real Marble asset is a village scene — an order of magnitude more
  // splats than the synthetic 16k-point test sphere.
  expect(real[0].numSplats, JSON.stringify(real)).toBeGreaterThan(16000);

  // Independent transforms: if instance() had accidentally shared one SplatMesh
  // (or its transform) across placements, these would coincide.
  const [a, b] = synthetic;
  const dist = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]);
  expect(dist, `placements ${a.pos.join(',')} vs ${b.pos.join(',')}`).toBeGreaterThan(1);
  expect(a.scale[0], JSON.stringify(instances)).not.toBeCloseTo(b.scale[0], 3);

  for (let i = 0; i < 10; i++) { await stepEngine(page, 6); await page.waitForTimeout(200); }
  await page.screenshot({ path: 'test-results/gallery-splat-exhibit.png' });
});
