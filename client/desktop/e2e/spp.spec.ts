import { test, expect } from '@playwright/test';
import { bootDeterministic, waitForWorldReady, stepEngine, worldFlags, walkUntil } from './helpers';

// SPP M2 in the real browser: the b6 string-particle hut expands through the
// live pipeline — real WebGL meshes, REAL collision (doorway passable, solid
// wall blocking), a working interior trigger, and serialization fidelity
// across a genuine reload (only the b6 source persists in the draft).
//
// Demo hut (DesktopLoader): origin [1, 2.5, 0], two 4m cells E1–9 / N2.5–6.5;
// cell B (E5–9) has a north-facing DOORWAY at E6.2–7.8 and an interior 'in'
// trigger that sets flags.spp_hut. Cell A's north face is a SOLID wall.

async function settle(page: any) {
  await waitForWorldReady(page);
  await page.evaluate(() => (window as any).loader.engine.stop());
  await stepEngine(page, 30);
}

/** Counts of SPP source rows and derived (expanded) entities. */
async function sppCensus(page: any) {
  return page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    let source = 0, derived = 0, derivedSolid = 0;
    for (const eid of w.queryEntities('AdjunctComponent')) {
      const adj = w.getComponent(eid, 'AdjunctComponent');
      if (adj?.stdData?.typeId === 0x00b6) source++;
      if (adj?.stdData?.derivedFrom) {
        derived++;
        if (w.getComponent(eid, 'SolidComponent')) derivedSolid++;
      }
    }
    return { source, derived, derivedSolid };
  });
}

/** Teleport the player to SPP (e, n) at altitude `alt` and settle physics. */
async function teleportSpp(page: any, e: number, n: number, alt = 1.2) {
  await page.evaluate(([se, sn, sa]: number[]) => {
    const w = (window as any).loader.engine.getWorld();
    const player = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
    const t = w.getComponent(player, 'TransformComponent');
    t.position[0] = (2048 - 1) * 16 + se;
    t.position[1] = sa;
    t.position[2] = -((2048 - 1) * 16 + sn);
  }, [e, n, alt]);
  await stepEngine(page, 12); // land + settle
}

/** The player's current SPP northing (N). */
async function sppN(page: any): Promise<number> {
  return page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const player = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
    return -w.getComponent(player, 'TransformComponent').position[2] - (2048 - 1) * 16;
  });
}

test('the hut expands: one b6 source, 14 derived pieces, walls are solid', async ({ page }) => {
  await bootDeterministic(page);
  const census = await sppCensus(page);
  expect(census.source).toBe(1);
  // A: roof+window(4)+north+west = 7 · B: roof+south+doorway(3)+east = 6 + trigger = 7
  expect(census.derived).toBe(14);
  expect(census.derivedSolid).toBe(13);   // every wall collides; the trigger doesn't
});

test('doorway is passable and fires the interior trigger', async ({ page }) => {
  await bootDeterministic(page);

  // Through the doorway (E≈7): walk south from outside, end up inside + flagged.
  await teleportSpp(page, 7, 8.5);
  expect((await worldFlags(page)).spp_hut).toBeUndefined();
  const entered = await walkUntil(page, [0, -1],
    async () => (await worldFlags(page)).spp_hut === true, 100);
  expect(entered, 'walked through the doorway into the trigger cell').toBe(true);
  expect(await sppN(page)).toBeLessThan(6.6);
});

test("cell A's solid north wall blocks the player outside", async ({ page }) => {
  await bootDeterministic(page);
  await teleportSpp(page, 3, 8.5);
  await walkUntil(page, [0, -1], async () => false, 40); // push south for ~0.7s sim
  expect(await sppN(page), 'solid wall keeps the player outside').toBeGreaterThan(6.55);
  expect((await worldFlags(page)).spp_hut).toBeUndefined();
});

test('reload fidelity: draft keeps only the b6 source; expansion is identical', async ({ page }) => {
  await bootDeterministic(page);
  const before = await sppCensus(page);

  // Persist the spawn block the normal way: pick up a gem (atomic pickup
  // re-serializes the block into the draft store).
  await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const player = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
    for (const eid of w.queryEntities('ItemComponent')) {
      const item = w.getComponent(eid, 'ItemComponent');
      if (item?.templateId === 1) {
        w.events.emit('interact.primary', { metadata: {}, distance: 2, point: [0, 0, 0] },
          { target: eid, actor: player });
        break;
      }
    }
  });
  await stepEngine(page, 3);
  await page.evaluate(async () => {
    await (window as any).loader.engine.getWorld().draftStore.flush();
  });

  await page.reload();
  await settle(page);

  // The draft carries the b6 source and did NOT bake the expansion: the only
  // a1 rows are the three authored court doors.
  const draftShape = await page.evaluate(() => {
    const draft = (window as any).loader.engine.getWorld().draftStore.load(0, 2048, 2048);
    const group = (id: number) => draft?.raw?.[2]?.find((g: any[]) => g[0] === id)?.[1] ?? [];
    return { b6: group(0x00b6).length, a1: group(0x00a1).length };
  });
  expect(draftShape.b6).toBe(1);
  expect(draftShape.a1).toBe(3);

  // And the world rebuilt from that draft expands identically.
  const after = await sppCensus(page);
  expect(after).toEqual(before);
});
