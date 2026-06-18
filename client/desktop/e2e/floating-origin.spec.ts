import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine } from './helpers';

// The world spawns at block [2048,2048] ≈ 32 km from origin. Without a floating
// origin the GPU shaded geometry at ~32 km in float32 (~4 mm resolution) and the
// shadow pass produced distance-dependent acne ("waves"). The render layer now
// parents all world content under worldRoot offset by −renderOrigin and rebases
// onto the camera, so everything the GPU sees sits near zero.

test('far from origin, rendered world content is rebased near zero', async ({ page }) => {
  await bootDeterministic(page);
  await stepEngine(page, 10); // render a few frames → rebase kicks in

  const r = await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const re: any = w.renderEngine;
    const origin = re.renderOrigin;
    const root = re.worldRoot.position;
    const cam = re.mainCameraInstance.position;

    // A loaded block group's WORLD-space translation (what feeds the GPU).
    const blockId = w.queryEntities('BlockComponent')[0];
    const handle = w.getComponent(blockId, 'MeshComponent').handle;
    handle.updateMatrixWorld(true);
    const e = handle.matrixWorld.elements;
    const blockWorld = [e[12], e[13], e[14]];

    return {
      originDist: Math.hypot(origin.x, origin.y, origin.z),
      rootPlusOrigin: Math.hypot(root.x + origin.x, root.y + origin.y, root.z + origin.z),
      camRenderDist: Math.hypot(cam.x, cam.y, cam.z),
      blockWorldDist: Math.hypot(blockWorld[0], blockWorld[1], blockWorld[2]),
    };
  });

  // We really are far out (spawn at world centre): origin tracks the camera there.
  expect(r.originDist).toBeGreaterThan(30000);
  // worldRoot is offset by exactly −origin.
  expect(r.rootPlusOrigin).toBeLessThan(0.01);
  // Camera renders within one rebase window of zero (REBASE_THRESHOLD = 1024).
  expect(r.camRenderDist).toBeLessThan(1024);
  // The block the GPU shades sits near zero — NOT at ~32 km. This is the fix.
  expect(r.blockWorldDist).toBeLessThan(1200);
});

// A SECOND source of "waves": the sun arcs across the sky (mock clock advances the
// day every ~2 min). With zero shadow bias the flat ground self-shadows — invisible
// at noon, but as the sun drops to a grazing angle each shadow texel smears across
// the ground into regular moiré bands. The sun's shadow must carry a normalBias +
// constant bias so it stays clean at all sun angles.
test('the sun shadow has bias configured (no grazing-angle ground acne)', async ({ page }) => {
  await bootDeterministic(page);
  const shadow = await page.evaluate(() => {
    const re: any = (window as any).loader.engine.getWorld().renderEngine;
    const s = re.sunLight?.shadow;
    return s ? { bias: s.bias, normalBias: s.normalBias, castShadow: re.sunLight.castShadow } : null;
  });
  expect(shadow).not.toBeNull();
  expect(shadow!.castShadow).toBe(true);
  // normalBias is the primary grazing-angle fix; must be a real positive offset.
  expect(shadow!.normalBias).toBeGreaterThan(0);
  // Small negative constant bias for the residual depth-compare acne.
  expect(shadow!.bias).toBeLessThan(0);
});
