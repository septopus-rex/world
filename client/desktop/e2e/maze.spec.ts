import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine, worldFlags } from './helpers';

// The Athenian labyrinth: a whole PLAYABLE maze authored as ONE b6 SPP row, which
// the engine expands into ~60 solid marble walls + a goal trigger — proving the
// "SPP as structural skeleton" workflow. The classical dressing (a2 columns /
// monument) is layered on top. Block [2047,2048], one west of the demo spawn.

const MAZE_BLOCK: [number, number] = [2047, 2048];
const PREFIX = 'adj_2047_2048_'; // derived pieces carry their source block in the id

async function pumpUntil(page: any, cond: () => Promise<boolean>, maxRounds = 50): Promise<boolean> {
  for (let i = 0; i < maxRounds; i++) { await stepEngine(page, 4); if (await cond()) return true; }
  return false;
}

/** Census of the maze block: its b6 source + the derived walls / goal trigger. */
async function census(page: any) {
  return page.evaluate((prefix: string) => {
    const w = (window as any).loader.engine.getWorld();
    let source = 0, walls = 0, solidWalls = 0, triggers = 0;
    for (const eid of w.queryEntities('AdjunctComponent')) {
      const adj = w.getComponent(eid, 'AdjunctComponent');
      const std = adj?.stdData;
      if (std?.typeId === 0x00b6 && String(adj?.adjunctId ?? '').includes('2047_2048')) source++;
      if (std?.derivedFrom && String(std.derivedFrom).startsWith(prefix)) {
        if (std.typeId === 0x00a1) { walls++; if (w.getComponent(eid, 'SolidComponent')) solidWalls++; }
        if (std.typeId === 0x00b8) triggers++;
      }
    }
    return { source, walls, solidWalls, triggers };
  }, PREFIX);
}

test('the labyrinth expands from one b6 source into solid marble walls + a goal trigger', async ({ page }) => {
  test.setTimeout(90_000);
  await bootDeterministic(page);

  // Drop the player at the south gate; block streaming loads the maze.
  await page.evaluate((b) => (window as any).loader.teleportSpp(b, [8, 2.5, 3]), MAZE_BLOCK);
  expect(await pumpUntil(page, async () => (await census(page)).source >= 1)).toBe(true);
  await stepEngine(page, 20);

  const c = await census(page);
  // Exactly ONE authored b6 row produced the entire maze.
  expect(c.source).toBe(1);
  // A 7×7 perfect maze ≈ 63 walls (36 interior + 27 boundary after the gate); every
  // wall collides, and there is exactly one derived goal trigger at the heart.
  expect(c.walls).toBeGreaterThan(50);
  expect(c.solidWalls).toBe(c.walls); // every expanded wall is solid
  expect(c.triggers).toBe(1);
});

test('the maze is NOT a game zone (it is a normal explorable block)', async ({ page }) => {
  await bootDeterministic(page);
  await page.evaluate((b) => (window as any).loader.teleportSpp(b, [8, 2.5, 3]), MAZE_BLOCK);
  await pumpUntil(page, async () => (await census(page)).source >= 1);
  await stepEngine(page, 20);
  expect(await page.evaluate(() => (window as any).loader.engine.getWorld().gameZoneActive)).toBe(false);
});

test('reaching the heart of the labyrinth fires the goal trigger', async ({ page }) => {
  test.setTimeout(90_000);
  await bootDeterministic(page);

  // Start at the gate — the goal flag is not yet set.
  await page.evaluate((b) => (window as any).loader.teleportSpp(b, [8, 2.5, 3]), MAZE_BLOCK);
  await pumpUntil(page, async () => (await census(page)).source >= 1);
  await stepEngine(page, 20);
  expect((await worldFlags(page)).maze_solved).toBeUndefined();

  // Reach the centre cell (3,3) → SPP 'in' trigger sets maze_solved.
  await page.evaluate((b) => (window as any).loader.teleportSpp(b, [8, 7.4, 3]), MAZE_BLOCK);
  expect(await pumpUntil(page, async () => (await worldFlags(page)).maze_solved === true)).toBe(true);

  await page.screenshot({ path: 'test-results/maze-heart.png' });
});

test('overview screenshot: the labyrinth + Athenian framing', async ({ page }) => {
  test.setTimeout(90_000);
  await bootDeterministic(page);
  // Load the maze block first (on the ground at the gate).
  await page.evaluate((b) => (window as any).loader.teleportSpp(b, [8, 2.5, 3]), MAZE_BLOCK);
  await pumpUntil(page, async () => (await census(page)).source >= 1);
  await stepEngine(page, 20);
  // First-person so the camera obeys our aim, then lift to a south-high vantage and
  // look NORTH (yaw 0) and down over the whole precinct. Render one frame and shoot
  // before gravity pulls the camera down.
  await page.evaluate(() => {
    const loader = (window as any).loader;
    loader.setCameraView('first');
    loader.teleportSpp([2047, 2048], [8, -7, 13]);
    loader.engine.getWorld().renderEngine?.setMainCameraRotation?.(-0.62, 0, 0);
    loader.engine.step(1 / 60);
    loader.engine.getWorld().renderEngine?.setMainCameraRotation?.(-0.62, 0, 0);
    loader.engine.step(1 / 60);
  });
  await page.screenshot({ path: 'test-results/maze-overview.png' });
});
