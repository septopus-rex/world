import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine } from './helpers';

// The SPP "magic ball" craft: a held 3×3 grid (one shared b6 source) you orbit
// in Observe and edit in TWO levels — first TAP a cell to OPEN it (the orbit
// glides in on it), then tap ITS faces to SELECT them: the face config panel
// lists the ACTIVE library's two pools (Engine.listVariants — never hard-coded)
// and one click writes [state, key] + re-expands in place. Only the open cell
// is editable; the others dim so you are never editing a tangle of overlapping
// cells. The old blind 实→门→窗→空 cycle survives as the sandboxCycleFace API
// (ray-free seam for quick sculpting/tests). Block [2047,2049].

const TAG = '2047_2049';

/** Observe-orbit radius — the zoom the cell focus eases toward. */
async function obsRadius(page: any): Promise<number> {
  return page.evaluate(() =>
    (window as any).loader.engine.getWorld().systems.findSystemByName('CharacterController').getObserveState().radius);
}

/** Wait (real rAF — the ease is rAF-driven) until the orbit radius crosses a
 *  bound: dir 'below' → r < bound, 'above' → r > bound. */
async function waitRadius(page: any, dir: 'below' | 'above', bound: number) {
  await page.waitForFunction(({ dir, bound }: any) => {
    const r = (window as any).loader.engine.getWorld().systems.findSystemByName('CharacterController').getObserveState().radius;
    return dir === 'below' ? r < bound : r > bound;
  }, { dir, bound }, { timeout: 20_000 });
}

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

test('two-level: tap SELECTS a cell, then a face — writes go through the panel seam', async ({ page }) => {
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
  // The orbit glides in on the opened cell; wait for it, then STEP so the render
  // camera actually moves there (specs drive the engine manually — the rAF ease
  // only writes orbit state; castRayFromCamera reads the rendered camera).
  await waitRadius(page, 'below', 10.55); // ORBIT_CELL converged
  await stepEngine(page, 3);
  await page.screenshot({ path: 'test-results/sandbox-selected.png' });

  // (2) Second tap → SELECTS the face it enters (config panel opens). Still no edit.
  const pick = await page.evaluate(() => (window as any).loader.sandboxClick(0, 0));
  expect(pick.kind).toBe('face');
  expect(await page.evaluate(() => (window as any).loader.sandboxSelectedFace)).toBe(pick.face);
  expect(changedCells((await sandboxState(page)).faces, before.faces), 'selecting a face must not edit it').toHaveLength(0);

  // (3) Apply an option from the library → exactly the open cell changes.
  expect(await page.evaluate(() => (window as any).loader.sandboxSetFace(1, 'doorway'))).toBe(true);
  await stepEngine(page, 4);
  const after = await sandboxState(page);
  expect(changedCells(after.faces, before.faces), 'exactly the open cell changed').toEqual([sel.cell]);
  expect(after.faces[sel.cell!][pick.face!]).toEqual([1, 'doorway']); // stable KEY, not an index
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

test('the face options ARE the live library — and follow a style swap', async ({ page }) => {
  test.setTimeout(90_000);
  await enter(page);

  await page.evaluate(() => {
    const L = (window as any).loader;
    L.sandboxSelectCell(4); L.sandboxSelectFace(3); // centre cell, North face
  });

  // The panel data lists exactly what the ACTIVE theme provides (basic), and
  // resolves the legacy numeric ref [1,0] to its stable key for highlighting.
  const fi = await page.evaluate(() => (window as any).loader.sandboxFaceOptions());
  expect(fi.theme).toBe('basic');
  expect(fi.closed.map((v: any) => v.key)).toEqual(['solid', 'doorway', 'window']);
  expect(fi.open.map((v: any) => v.key)).toEqual(['empty']);
  expect(fi.state).toBe(1);
  expect(fi.variantKey).toBe('solid');

  // Apply 'window' → the face holds the KEY and the geometry re-expands.
  const before = await sandboxState(page);
  expect(await page.evaluate(() => (window as any).loader.sandboxSetFace(1, 'window'))).toBe(true);
  await stepEngine(page, 4);
  const after = await sandboxState(page);
  expect(after.faces[4][3]).toEqual([1, 'window']);
  expect(after.walls).not.toBe(before.walls);

  // Swap the world style → the SAME panel now lists the garden library, and the
  // face's stable key still resolves (keys survive across packs; indices can't).
  await page.evaluate(() => (window as any).loader.setSppStyle('garden'));
  await stepEngine(page, 4);
  const fi2 = await page.evaluate(() => (window as any).loader.sandboxFaceOptions());
  expect(fi2.theme).toBe('garden');
  expect(fi2.closed[0].key).toBe('lattice');
  expect(fi2.variantKey).toBe('window');
});

test('opening a cell glides the orbit in on it; closing glides back out', async ({ page }) => {
  test.setTimeout(90_000);
  await enter(page);

  // Entry framing comes from the real setObserveOrbit API (overview radius 17).
  expect(await obsRadius(page)).toBeCloseTo(17, 0);

  await page.evaluate(() => (window as any).loader.sandboxSelectCell(0));
  await waitRadius(page, 'below', 10.55); // ORBIT_CELL converged
  // The orbit ANCHOR (frozen player) glided to cell 0's centre: SPP-local
  // [4,4,1] on block [2047,2049] → engine (32740, 1, −32772).
  const pos = await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const pid = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
    return [...w.getComponent(pid, 'TransformComponent').position];
  });
  expect(pos[0]).toBeCloseTo(32740, 0);
  expect(pos[1]).toBeCloseTo(1, 0);
  expect(pos[2]).toBeCloseTo(-32772, 0);

  await page.evaluate(() => (window as any).loader.sandboxDeselect());
  await waitRadius(page, 'above', 16.5); // eases back to the overview
});
