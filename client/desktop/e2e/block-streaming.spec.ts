import { test, expect } from '@playwright/test';
import { bootDeterministic, waitForWorldReady } from './helpers';

// The block window must stay BOUNDED as the player roams — the loader evicts
// blocks outside the (2*extend+1)^2 window immediately (matching the old engine's
// cross() algorithm). A wall-clock TTL grace used to let the resident set balloon
// into the hundreds under fast travel, which tanked the frame rate.

async function counts(page: any) {
  return page.evaluate(() => {
    const loader = (window as any).loader;
    const w = loader.engine.getWorld();
    return {
      loadedBlocks: loader.getLoadedBlockCount(),
      blockEntities: w.queryEntities('BlockComponent').length,
    };
  });
}

/**
 * The window's SHAPE and the visibility of what is in it — a filled square
 * ("田"), never a corner-punched "井". Counting alone cannot see this: the
 * `<= 25` assertions below are satisfied by a corner-less 21 too, which is
 * exactly how the 2026-07-27 corner bug survived (fog far 38.4 m and lodNear
 * 40 m both sized by the ORTHOGONAL edge, while corner block centres sit at
 * 45.3 m — √2× further). Headless twin: engine/tests/systems/block-window-coverage.
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

    // Adjunct-mesh visibility per block (the LOD tier's observable effect).
    const hiddenBlocks: string[] = [];
    for (const [k, eid] of blockEid) {
      let total = 0, visible = 0;
      for (const ae of w.getEntitiesWith(['AdjunctComponent'])) {
        const adj = w.getComponent(ae, 'AdjunctComponent');
        if (!adj || adj.parentBlockEntityId !== eid) continue;
        if (typeof adj.adjunctId === 'string' && adj.adjunctId.startsWith('ground')) continue;
        const mesh = w.getComponent(ae, 'MeshComponent');
        if (mesh?.handle) { total++; if (mesh.handle.visible !== false) visible++; }
      }
      if (total > 0 && visible === 0) hiddenBlocks.push(k);
    }

    const expected: string[] = [];
    for (let dx = -ext; dx <= ext; dx++) for (let dy = -ext; dy <= ext; dy++) expected.push(`${dx},${dy}`);

    const fog = w.renderEngine.sceneInstance.fog;
    const cornerCentre = ext * Math.hypot(m.blockWidth, m.blockLength);
    return {
      ext,
      missing: expected.filter((k) => !present.has(k)),
      hiddenBlocks,
      cornerCentre,
      fogFar: fog ? fog.far : null,
      cornerInsideFog: fog ? cornerCentre < fog.far : null,
    };
  });
}

test('block window stays bounded as the player roams (eviction)', async ({ page }) => {
  await bootDeterministic(page);
  await waitForWorldReady(page);

  const atRest = await counts(page);
  // extend defaults to 2 → a 5x5 = 25 block window.
  expect(atRest.loadedBlocks).toBeLessThanOrEqual(25);
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
  expect(afterRoam.loadedBlocks).toBeLessThanOrEqual(25);
  expect(afterRoam.blockEntities).toBe(afterRoam.loadedBlocks);
});

test('the window is a FILLED square — corners loaded AND visible (田, not 井)', async ({ page }) => {
  await bootDeterministic(page);
  await waitForWorldReady(page);

  const shape = await windowShape(page);
  // Data layer: no gap anywhere in the (2·ext+1)² square.
  expect(shape.missing).toEqual([]);
  // Render layer: no block in the window may have ALL its adjuncts clipped —
  // the corners used to come back hidden while the orthogonal edges stayed lit.
  expect(shape.hiddenBlocks).toEqual([]);
  // Fog must reach past the DIAGONAL, else corner blocks are painted pure sky.
  expect(shape.cornerInsideFog).toBe(true);
  expect(shape.fogFar).toBeGreaterThan(shape.cornerCentre);
});

test('sky-matched fog hides the bounded-window chunk boundary', async ({ page }) => {
  await bootDeterministic(page);
  const fog = await page.evaluate(() => {
    const re: any = (window as any).loader.engine.getWorld().renderEngine;
    const f = re.sceneInstance.fog;
    const sky = re.skyInfo();
    return f ? { near: f.near, far: f.far, color: f.color.getHex(), horizon: sky.horizon, ibl: sky.ibl } : null;
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
  // Sized to the window's DIAGONAL reach (extend=2 → 2·√(16²+16²) ≈ 45.3 m, so
  // far ≈ 54 m), not its orthogonal edge (32 m → far 38.4 m, which left the four
  // corner blocks outside the fog entirely — see the 田/井 test above).
  expect(fog!.far).toBeGreaterThan(45.3);
  expect(fog!.far).toBeLessThan(96);
});
