import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine, worldFlags } from './helpers';

// Walk the player INTO the SPP structure at full scale (normal mode) and confirm
// the expanded adjuncts actually function: solid walls STOP the player (a1 stop=1
// collision), open doorways are passable, and a cell TRIGGER (b8) fires on entry.
// Block [2047,2049]; grid origin [2,2], 4 m cells. Cell (1,0) = local x[6,10] y[2,6].

const TAG = '2047_2049';
const SB: [number, number] = [2047, 2049];

async function pumpUntil(page: any, cond: () => Promise<boolean>, maxRounds = 60): Promise<boolean> {
  for (let i = 0; i < maxRounds; i++) { await stepEngine(page, 4); if (await cond()) return true; }
  return false;
}
/** Player position in SPP-local coords of the sandbox block. */
async function localPos(page: any): Promise<[number, number, number]> {
  return page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const t = w.getComponent(w.queryEntities('TransformComponent', 'InputStateComponent')[0], 'TransformComponent');
    return [t.position[0] - (2047 - 1) * 16, -t.position[2] - (2049 - 1) * 16, t.position[1]];
  });
}
/** Walk with a move intent until `done` or maxSteps; then stand still. Software
 *  WebGL renders every step, so keep the budget tight. */
async function walk(page: any, intent: [number, number], done: () => Promise<boolean>, maxSteps = 96): Promise<boolean> {
  await page.evaluate(([x, y]) => (window as any).loader.setPlayerMoveIntent(x, y), intent);
  let ok = false;
  for (let s = 0; s < maxSteps && !ok; s += 12) { await stepEngine(page, 12); ok = await done(); }
  await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 0));
  await stepEngine(page, 3);
  return ok;
}

test('walk into the SPP structure: solid wall stops, doorway passes + fires the trigger', async ({ page }) => {
  test.setTimeout(180_000);
  await bootDeterministic(page);

  // Stand the player on the sandbox block (normal mode → walkable, not Observe).
  await page.evaluate((b) => (window as any).loader.teleportSeptopus(b, [8, 0.4, 2]), SB);
  expect(await pumpUntil(page, async () => page.evaluate((tag: string) => {
    const w = (window as any).loader.engine.getWorld();
    return w.queryEntities('AdjunctComponent').some((e: any) => {
      const a = w.getComponent(e, 'AdjunctComponent');
      return a?.stdData?.typeId === 0x00b6 && String(a.adjunctId ?? '').includes(tag);
    });
  }, TAG))).toBe(true);

  // Deterministic test config on the live b6 source: cell (1,0) gets a south
  // DOORWAY + an interior TRIGGER; cell (0,0) keeps its solid south wall.
  await page.evaluate((tag: string) => {
    const w = (window as any).loader.engine.getWorld();
    let src: any = null, eid: any = null;
    for (const e of w.queryEntities('AdjunctComponent')) {
      const a = w.getComponent(e, 'AdjunctComponent');
      if (a?.stdData?.typeId === 0x00b6 && String(a.adjunctId ?? '').includes(tag)) { src = a.stdData; eid = e; break; }
    }
    src.cells[3].faces[2] = [1, 1]; // cell (1,0).Front → doorway
    src.cells[3].trigger = [{ type: 'in', actions: [{ type: 'flag', method: '', target: 'sandbox_heart', params: [true] }] }];
    src.cells[0].faces[2] = [1, 0]; // cell (0,0).Front → solid (the wall to bump)
    w.systems.findSystemByName('BlockSystem').reexpandParticle(w, eid);
  }, TAG);
  await stepEngine(page, 10);

  // ── STOP: walk NORTH into cell (0,0)'s SOLID south wall (at y≈2). Blocked.
  await page.evaluate((b) => (window as any).loader.teleportSeptopus(b, [4, 0.4, 1]), SB);
  await stepEngine(page, 8); // land + settle
  const startY = (await localPos(page))[1];
  await walk(page, [0, 1], async () => (await localPos(page))[1] > 2.2, 72); // try to cross the wall
  const blockedY = (await localPos(page))[1];
  expect(blockedY, 'pushed north but the solid wall held the player short of y=2').toBeLessThan(2.0);
  expect(blockedY, 'and the player did move toward the wall (not the wrong way)').toBeGreaterThan(startY + 0.3);
  expect((await worldFlags(page)).sandbox_heart, 'no trigger fired against a solid wall').toBeUndefined();
  await page.screenshot({ path: 'test-results/walk-1-blocked.png' });

  // ── PASS + TRIGGER: walk NORTH through cell (1,0)'s DOORWAY (gap x[7.2,8.8]).
  await page.evaluate((b) => (window as any).loader.teleportSeptopus(b, [8, 0.4, 1]), SB);
  await stepEngine(page, 8);
  const entered = await walk(page, [0, 1], async () =>
    (await localPos(page))[1] > 2.6 && (await worldFlags(page)).sandbox_heart === true, 108);
  const insideY = (await localPos(page))[1];
  expect(insideY, 'walked through the doorway into the cell').toBeGreaterThan(2.6);
  expect((await worldFlags(page)).sandbox_heart, 'the SPP cell trigger fired on entry').toBe(true);
  expect(entered).toBe(true);
  await page.screenshot({ path: 'test-results/walk-2-through-trigger.png' });
});
