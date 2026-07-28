import { test, expect } from '@playwright/test';
import { bootDeterministic, waitForWorldReady } from './helpers';

// The block window must stay BOUNDED as the player roams — the loader evicts
// blocks outside the (2*extend+1)^2 window immediately (matching the old engine's
// cross() algorithm). A wall-clock TTL grace used to let the resident set balloon
// into the hundreds under fast travel, which tanked the frame rate.

// `windowSize` is DERIVED from the live extend, never hardcoded: `player.extend`
// in the world document is the one knob for draw distance (it drives the
// streaming window, the fog and the block LOD alike since 2026-07-28), so a spec
// that pinned "25" would turn a deliberate content change into a red build.
async function counts(page: any) {
  return page.evaluate(() => {
    const loader = (window as any).loader;
    const w = loader.engine.getWorld();
    const ext = loader.playerState.extend;
    return {
      loadedBlocks: loader.getLoadedBlockCount(),
      blockEntities: w.queryEntities('BlockComponent').length,
      windowSize: (2 * ext + 1) ** 2,
    };
  });
}

/**
 * The window's SHAPE and how the masks cut it. Counting alone cannot see this:
 * the window-size assertions below are satisfied by a corner-less 21 too, which is
 * how the corner artefacts survived twice — first fog far 38.4 m / lodNear 40 m
 * (both sized by the ORTHOGONAL edge, clipping the four corners into an "井"),
 * then fog far 54.3 m (sized by the DIAGONAL, which instead let the ground end
 * in mid-air at 36 % haze in the orthogonal directions).
 *
 * What is pinned now is the invariant that survives both: the streaming window
 * is a PREFETCH square, and the VISIBLE region is the disc of
 * `metrics.streamingReach(ext)` inside it — fog opaque at its edge, LOD hiding
 * no nearer than that. Headless twin: engine/tests/systems/block-window-coverage.
 */
async function windowShape(page: any) {
  return page.evaluate(() => {
    const loader: any = (window as any).loader;
    const w: any = loader.engine.getWorld();
    const m = w.metrics;
    const pid = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
    const t = w.getComponent(pid, 'TransformComponent');
    const centre = m.engineToSeptopus([t.position[0], t.position[1], t.position[2]]).block;
    const ext = loader.playerState.extend;

    const present = new Set<string>();
    const blockEid = new Map<string, number>();
    for (const eid of w.queryEntities('BlockComponent')) {
      const b = w.getComponent(eid, 'BlockComponent');
      const k = `${b.x - centre[0]},${b.y - centre[1]}`;
      present.add(k);
      blockEid.set(k, eid);
    }

    // Distance from the player to a block's NEAREST point — the metric both
    // masks act on.
    const nearestOf = (k: string) => {
      const [dx, dy] = k.split(',').map(Number);
      const c = m.blockCentre(centre[0] + dx, centre[1] + dy);
      const ax = Math.max(0, Math.abs(t.position[0] - c[0]) - m.blockWidth / 2);
      const az = Math.max(0, Math.abs(t.position[2] - c[2]) - m.blockLength / 2);
      return Math.hypot(ax, az);
    };

    // Adjunct-mesh visibility per block (the LOD tier's observable effect).
    const hiddenBlocks: string[] = [];
    const litBeyondReach: string[] = [];
    const reach = m.streamingReach(ext);
    for (const [k, eid] of blockEid) {
      let total = 0, visible = 0;
      for (const ae of w.getEntitiesWith(['AdjunctComponent'])) {
        const adj = w.getComponent(ae, 'AdjunctComponent');
        if (!adj || adj.parentBlockEntityId !== eid) continue;
        if (typeof adj.adjunctId === 'string' && adj.adjunctId.startsWith('ground')) continue;
        const mesh = w.getComponent(ae, 'MeshComponent');
        if (mesh?.handle) { total++; if (mesh.handle.visible !== false) visible++; }
      }
      if (total === 0) continue;
      // Hidden INSIDE the disc is the "井" bug; lit OUTSIDE it is only waste, but
      // it means the two masks have drifted apart again.
      if (visible === 0 && nearestOf(k) <= reach) hiddenBlocks.push(k);
      if (visible > 0 && nearestOf(k) > reach) litBeyondReach.push(k);
    }

    const expected: string[] = [];
    for (let dx = -ext; dx <= ext; dx++) for (let dy = -ext; dy <= ext; dy++) expected.push(`${dx},${dy}`);

    const fog = w.renderEngine.sceneInstance.fog;
    return {
      ext, reach,
      missing: expected.filter((k) => !present.has(k)),
      hiddenBlocks,
      litBeyondReach,
      fogFar: fog ? fog.far : null,
      // The whole point: the fog must be TOTAL before the nearest window face,
      // so the boundary is a smooth radial dissolve in every direction.
      fogClosesInsideWindow: fog ? fog.far <= reach : null,
    };
  });
}

test('block window stays bounded as the player roams (eviction)', async ({ page }) => {
  await bootDeterministic(page);
  await waitForWorldReady(page);

  const atRest = await counts(page);
  // extend=2 → 5×5=25; extend=3 → 7×7=49. Derived, so raising the world doc's
  // extend is a content decision, not a test edit.
  expect(atRest.loadedBlocks).toBeLessThanOrEqual(atRest.windowSize);
  expect(atRest.blockEntities).toBe(atRest.loadedBlocks);

  // Roam ~30 blocks east, letting each crossing's async fetch+inject settle
  // before the next (as in real play — crossings are seconds apart).
  await page.evaluate(async () => {
    const e = (window as any).loader.engine;
    const w = e.getWorld();
    const id = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
    const t = w.getComponent(id, 'TransformComponent');
    for (let k = 0; k < 30; k++) {
      t.position[0] += 16; // one block east (+X = East)
      for (let i = 0; i < 8; i++) e.step(1 / 60);
      await new Promise((r) => setTimeout(r, 0));
    }
    for (let i = 0; i < 8; i++) e.step(1 / 60);
  });

  const afterRoam = await counts(page);
  // The set must NOT grow with distance travelled — still ~one window.
  expect(afterRoam.loadedBlocks).toBeLessThanOrEqual(afterRoam.windowSize);
  expect(afterRoam.blockEntities).toBe(afterRoam.loadedBlocks);
});

test('the window is a FILLED square, and the masks cut a DISC inside it', async ({ page }) => {
  await bootDeterministic(page);
  await waitForWorldReady(page);

  const shape = await windowShape(page);
  // Data layer: no gap anywhere in the (2·ext+1)² square.
  expect(shape.missing).toEqual([]);
  // Render layer: inside the visible disc, nothing may be clipped — the corners
  // used to come back hidden while the orthogonal edges at the same distance
  // stayed lit.
  expect(shape.hiddenBlocks).toEqual([]);
  // …and the two masks must not have drifted apart: nothing lit past the disc.
  expect(shape.litBeyondReach).toEqual([]);
  // Fog goes total BEFORE the nearest window face, so the ground never ends
  // while still partly transparent (that was the 54.3 m regression).
  expect(shape.fogClosesInsideWindow).toBe(true);
  expect(shape.fogFar).toBeLessThanOrEqual(shape.reach);
});

test('sky-matched fog hides the bounded-window chunk boundary', async ({ page }) => {
  await bootDeterministic(page);
  const fog = await page.evaluate(() => {
    const loader: any = (window as any).loader;
    const w: any = loader.engine.getWorld();
    const re: any = w.renderEngine;
    const f = re.sceneInstance.fog;
    const sky = re.skyInfo();
    const reach = w.metrics.streamingReach(loader.playerState.extend);
    return f ? { near: f.near, far: f.far, reach, color: f.color.getHex(), horizon: sky.horizon, ibl: sky.ibl } : null;
  });
  expect(fog).not.toBeNull();
  // Fog colour must equal the sky AT THE HORIZON so terrain dissolves into it (no
  // hard jagged void edge at the load boundary). Since 2026-07-25 the sky is a
  // gradient texture rather than a flat colour, so the reference is the horizon
  // band that SkyEnvironment keeps in step with the day cycle — not `background`,
  // which is no longer a Color at all.
  expect(fog!.color).toBe(fog!.horizon);
  // (Whether the sky ALSO feeds scene.environment is tier-dependent — the suite
  //  runs the cheap tier — so that assertion lives in render-tier.spec.ts.)
  // far = metrics.streamingReach(extend) — the radius the window is GUARANTEED
  // to contain in every direction (extend=2, 16 m blocks → 32 m; extend=3 → 48 m).
  // Derived, not pinned: this is the ONE knob, and hand-picking a larger `far`
  // is what shipped the corner artefacts twice (38.4 m and 54.3 m each left one
  // direction's boundary showing). near is half of it, so the haze has depth
  // instead of being an opaque wall.
  expect(fog!.far).toBe(fog!.reach);
  expect(fog!.near).toBe(fog!.reach / 2);
});
