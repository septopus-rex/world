import { test, expect } from '@playwright/test';
import { waitForWorldReady, stepEngine } from './helpers';

// Gaussian-splat content through the REAL a4 module pipeline (not the earlier
// RenderEngine.loadSplat spike): gallery exhibit ㉑ ([2000,1020]) places TWO
// module rows referencing the SAME splat resource id (39, a synthetic test
// asset) at different positions/sizes — same reuse pattern as ③'s two
// pagodas sharing resource 27. This is also the empirical check for whether
// ResourceManager.instance()'s splat branch (fresh SplatMesh sharing the
// template's PackedSplats) actually gives each placement an independent
// transform, since SplatMesh has no working clone()/copy().

test('㉑ 高斯泼溅展项:两处引用同一 splat 资源,独立渲染、独立变换', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?level=gallery');
  await waitForWorldReady(page);
  await page.evaluate(() => (window as any).loader.engine.stop());
  await stepEngine(page, 60);

  await page.evaluate(() => (window as any).loader.teleportSeptopus([2000, 1020], [8, 8, 1.2]));

  let instances: any[] = [];
  for (let i = 0; i < 40 && instances.length < 2; i++) {
    await stepEngine(page, 15);
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

  expect(instances.length, JSON.stringify(instances)).toBe(2);
  for (const inst of instances) {
    expect(inst.resourceId, JSON.stringify(inst)).toBe('39');
    expect(inst.numSplats, JSON.stringify(inst)).toBeGreaterThan(0);
  }

  // Independent transforms: if instance() had accidentally shared one SplatMesh
  // (or its transform) across both placements, these would coincide.
  const [a, b] = instances;
  const dist = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]);
  expect(dist, `placements ${a.pos.join(',')} vs ${b.pos.join(',')}`).toBeGreaterThan(1);
  expect(a.scale[0], JSON.stringify(instances)).not.toBeCloseTo(b.scale[0], 3);

  for (let i = 0; i < 10; i++) { await stepEngine(page, 6); await page.waitForTimeout(200); }
  await page.screenshot({ path: 'test-results/gallery-splat-exhibit.png' });
});
