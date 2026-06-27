import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine } from './helpers';

// The SPP "magic ball" craft: a held 3×3 grid (one shared b6 source) you orbit
// in Observe and edit in TWO levels — first TAP a cell to OPEN it, then tap ITS
// faces to cycle 实→门→窗→空. Only the open cell is editable; the others dim so
// you are never editing a tangle of overlapping cells. Block [2047,2049].

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

/** Indices of cells whose face-array differs from `base`. */
function changedCells(faces: any[], base: any[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < faces.length; i++) if (JSON.stringify(faces[i]) !== JSON.stringify(base[i])) out.push(i);
  return out;
}

async function enter(page: any) {
  await bootDeterministic(page);
  await page.evaluate(() => (window as any).loader.enterSandbox());
  expect(await pumpUntil(page, async () => (await sandboxState(page)).faces !== null)).toBe(true);
  await stepEngine(page, 20);
}

test('two-level: the first tap SELECTS a cell (no edit), the second edits only it', async ({ page }) => {
  test.setTimeout(90_000);
  await enter(page);

  const before = await sandboxState(page);
  expect(before.faces).toHaveLength(9);              // 3×3 shared source
  expect(before.walls).toBeGreaterThan(10);          // expanded into marble walls
  expect(await page.evaluate(() => (window as any).loader.engine.getWorld().mode)).toBe('observe');

  // (1) First tap → OPENS the cell under the ray. No face changes; selection set.
  const sel = await page.evaluate(() => (window as any).loader.sandboxClick(0, 0));
  expect(sel.kind).toBe('select');
  expect(await page.evaluate(() => (window as any).loader.sandboxSelectedCell)).toBe(sel.cell);
  const mid = await sandboxState(page);
  expect(changedCells(mid.faces, before.faces), 'selecting a cell must not edit it').toHaveLength(0);
  await page.screenshot({ path: 'test-results/sandbox-selected.png' });

  // (2) Second tap (same point) → cycles a face of THAT cell, and only it.
  const cyc = await page.evaluate(() => (window as any).loader.sandboxClick(0, 0));
  expect(cyc.kind).toBe('cycle');
  await stepEngine(page, 4);
  const after = await sandboxState(page);
  expect(changedCells(after.faces, before.faces), 'exactly the open cell changed').toEqual([sel.cell]);
  expect(after.walls).not.toBe(before.walls);
});

test('a cycle walks 实 → 门 → 窗 → 空 and loops back', async ({ page }) => {
  test.setTimeout(90_000);
  await enter(page);

  await page.evaluate(() => (window as any).loader.sandboxSelectCell(4)); // centre cell
  const start = await sandboxState(page);
  // Cycle the same face (3 = Back/North) four times; it walks the cycle and
  // returns to its start value.
  const seen: string[] = [];
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => (window as any).loader.sandboxCycleFace(4, 3));
    await stepEngine(page, 3);
    seen.push(JSON.stringify((await sandboxState(page)).faces[4][3]));
  }
  expect(seen[3]).toBe(JSON.stringify(start.faces[4][3]));   // full loop
  expect(new Set(seen.slice(0, 3)).size).toBe(3);            // distinct intermediate states
  await page.screenshot({ path: 'test-results/sandbox-carved.png' });
});

test('editing is scoped to the open cell; switching cells leaves the first intact', async ({ page }) => {
  test.setTimeout(90_000);
  await enter(page);
  const before = await sandboxState(page);

  // Open cell 0, carve two faces.
  await page.evaluate(() => {
    const L = (window as any).loader;
    L.sandboxSelectCell(0); L.sandboxCycleFace(0, 2); L.sandboxCycleFace(0, 4);
  });
  await stepEngine(page, 4);
  // Close it, open cell 8, carve one face — cell 0's edits must survive.
  await page.evaluate(() => {
    const L = (window as any).loader;
    L.sandboxDeselect(); L.sandboxSelectCell(8); L.sandboxCycleFace(8, 3);
  });
  await stepEngine(page, 4);

  const after = await sandboxState(page);
  expect(changedCells(after.faces, before.faces).sort((a, b) => a - b)).toEqual([0, 8]);
  expect(JSON.stringify(after.faces[0][2]), 'cell 0 kept its edit').not.toBe(JSON.stringify(before.faces[0][2]));
});

test('opening a cell dims the others (focus)', async ({ page }) => {
  test.setTimeout(90_000);
  await enter(page);

  await page.evaluate(() => (window as any).loader.sandboxSelectCell(0)); // corner cell, 5 visible walls
  // Let the focus rAF re-assert opacity on the existing meshes.
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

  const op = await page.evaluate((tag: string) => {
    const w = (window as any).loader.engine.getWorld();
    const split = { open: [] as number[], dim: [] as number[] };
    for (const eid of w.queryEntities('AdjunctComponent')) {
      const a = w.getComponent(eid, 'AdjunctComponent');
      if (!a?.stdData?.derivedFrom || !String(a.stdData.derivedFrom).includes(tag)) continue;
      // Cell index from the piece centre (grid origin [2,2], 4 m cells, 3 wide).
      const gx = Math.floor((a.stdData.ox - 2) / 4), gy = Math.floor((a.stdData.oy - 2) / 4);
      const ci = gx * 3 + gy;
      const mesh = w.getComponent(eid, 'MeshComponent');
      let o = 1; mesh?.handle?.traverse?.((c: any) => { if (c.material) o = c.material.opacity; });
      (ci === 0 ? split.open : split.dim).push(o);
    }
    return split;
  }, TAG);

  expect(op.open.length).toBeGreaterThan(0);
  expect(op.dim.length).toBeGreaterThan(0);
  expect(Math.min(...op.open), 'open cell stays at full opacity').toBeGreaterThan(0.9);
  expect(Math.max(...op.dim), 'the other cells are dimmed').toBeLessThan(0.5);
  await page.screenshot({ path: 'test-results/sandbox-dimmed.png' });
});
