import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine } from './helpers';

// The SPP sandbox: a fixed-camera (Observe) diorama of a 3×3 grid held by ONE
// shared b6 source. Clicking a cell's face cycles it (solid→doorway→window→open)
// and the engine re-expands live. Proves visual MULTI-cell SPP authoring in 3D —
// the gap the form-based single-cell editor leaves. Block [2047,2049].

const TAG = '2047_2049';

async function pumpUntil(page: any, cond: () => Promise<boolean>, maxRounds = 50): Promise<boolean> {
  for (let i = 0; i < maxRounds; i++) { await stepEngine(page, 4); if (await cond()) return true; }
  return false;
}

/** The shared b6 source's per-cell faces (deep copy) + derived wall count. */
async function sandboxState(page: any) {
  return page.evaluate((tag: string) => {
    const w = (window as any).loader.engine.getWorld();
    let faces: any = null, walls = 0;
    for (const eid of w.queryEntities('AdjunctComponent')) {
      const adj = w.getComponent(eid, 'AdjunctComponent');
      const std = adj?.stdData;
      if (std?.typeId === 0x00b6 && String(adj.adjunctId ?? '').includes(tag)) {
        faces = JSON.parse(JSON.stringify(std.cells.map((c: any) => c.faces)));
      }
      if (std?.derivedFrom && String(std.derivedFrom).includes(tag) && std.typeId === 0x00a1) walls++;
    }
    return { faces, walls };
  }, TAG);
}

test('the sandbox diorama expands and clicking a face sculpts it live', async ({ page }) => {
  test.setTimeout(90_000);
  await bootDeterministic(page);

  // Enter the sandbox (teleport + Observe orbit + avatar hidden).
  await page.evaluate(() => (window as any).loader.enterSandbox());
  expect(await pumpUntil(page, async () => (await sandboxState(page)).faces !== null)).toBe(true);
  await stepEngine(page, 20);

  const before = await sandboxState(page);
  expect(before.faces).toHaveLength(9);              // 3×3 shared source
  expect(before.walls).toBeGreaterThan(10);          // expanded into marble walls
  expect(await page.evaluate(() => (window as any).loader.engine.getWorld().mode)).toBe('observe');
  await page.screenshot({ path: 'test-results/sandbox-initial.png' });

  // Click the centre of the view → cycle the targeted face on the shared source.
  const picked = await page.evaluate(() => (window as any).loader.sandboxPick(0, 0));
  expect(picked, 'a ray through screen-centre hit a cell face').toBe(true);
  await stepEngine(page, 4);

  const after = await sandboxState(page);
  // Exactly one face changed, and the structure re-expanded (piece count moved).
  const changed = after.faces.flat().filter((f: any, i: number) => JSON.stringify(f) !== JSON.stringify(before.faces.flat()[i]));
  expect(changed.length, 'one face cycled').toBe(1);
  expect(after.walls).not.toBe(before.walls);
});

test('repeated clicks cycle a face through solid → doorway → window → open', async ({ page }) => {
  test.setTimeout(90_000);
  await bootDeterministic(page);
  await page.evaluate(() => (window as any).loader.enterSandbox());
  await pumpUntil(page, async () => (await sandboxState(page)).faces !== null);
  await stepEngine(page, 20);

  // Pick the SAME screen point 4×; that one face should walk the full cycle and
  // return to its start (solid → doorway → window → open → solid).
  const start = await sandboxState(page);
  const states: string[] = [];
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => (window as any).loader.sandboxPick(0.05, 0.0));
    await stepEngine(page, 3);
    const s = await sandboxState(page);
    const idx = s.faces.flat().findIndex((f: any, j: number) => JSON.stringify(f) !== JSON.stringify(start.faces.flat()[j]));
    states.push(idx === -1 ? 'same' : JSON.stringify(s.faces.flat()[idx]));
  }
  // The 4th click returns the face to its original value (full loop).
  expect(states[3]).toBe('same');
  // And the intermediate states are distinct (it actually walked the cycle).
  expect(new Set(states.slice(0, 3)).size).toBe(3);
  await page.screenshot({ path: 'test-results/sandbox-carved.png' });
});

test('overview: sculpt a varied structure with distinct clicks', async ({ page }) => {
  test.setTimeout(90_000);
  await bootDeterministic(page);
  await page.evaluate(() => (window as any).loader.enterSandbox());
  await pumpUntil(page, async () => (await sandboxState(page)).faces !== null);
  await stepEngine(page, 20);

  // A fan of distinct screen points across the lower half hits different
  // camera-facing walls; repeat counts leave doorways (1×) and windows (2×).
  const clicks: Array<[number, number, number]> = [
    [-0.32, -0.18, 1], [-0.10, -0.24, 2], [0.12, -0.24, 1], [0.34, -0.16, 2],
    [-0.22, -0.05, 1], [0.22, -0.05, 1], [0.0, -0.30, 1],
  ];
  for (const [x, y, reps] of clicks) {
    for (let r = 0; r < reps; r++) { await page.evaluate(([cx, cy]) => (window as any).loader.sandboxPick(cx, cy), [x, y]); }
    await stepEngine(page, 2);
  }
  await stepEngine(page, 6);
  const s = await sandboxState(page);
  // Several faces are now non-solid → the structure is genuinely carved.
  const nonSolid = s.faces.flat().filter((f: any) => !(f[0] === 1 && f[1] === 0)).length;
  expect(nonSolid).toBeGreaterThan(3);
  await page.screenshot({ path: 'test-results/sandbox-overview.png' });
});

test('a real canvas tap sculpts a face (full click → ray → cycle path)', async ({ page }) => {
  test.setTimeout(90_000);
  await bootDeterministic(page);
  await page.evaluate(() => (window as any).loader.enterSandbox());
  await pumpUntil(page, async () => (await sandboxState(page)).faces !== null);
  await stepEngine(page, 20);

  const before = await sandboxState(page);
  // Tap a point on the diorama (offset from centre to hit a wall, not the open top).
  const canvas = page.locator('canvas[data-engine]');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 + 40, box.y + box.height / 2 + 60);
  await stepEngine(page, 4);

  const after = await sandboxState(page);
  expect(JSON.stringify(after.faces), 'the tap changed the structure').not.toBe(JSON.stringify(before.faces));
});
