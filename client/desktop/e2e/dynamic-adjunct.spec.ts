import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine } from './helpers';

// Dynamic adjuncts, end-to-end through the REAL app: at boot the loader runs a
// tiny declarative adjunct file inside the AdjunctSandbox (Web Worker) and
// registers it under type-id 0xf001. The showcase block [2049,2047] authors three
// instances of 0xf001 in plain raw — with ZERO engine code knowing "monolith".
// We prove they (1) resolve to the DYNAMIC definition, (2) build meshes, (3) take
// collision, and (4) actually stop the player who walks into one.

const DYN_BLOCK: [number, number] = [2049, 2047];
const DYN_TYPE = 0xf001;

async function pumpUntil(page: any, cond: () => Promise<boolean>, maxRounds = 80): Promise<boolean> {
  for (let i = 0; i < maxRounds; i++) { await stepEngine(page, 4); if (await cond()) return true; }
  return false;
}

/** All entities of the dynamic type on the showcase block, with their resolved
 *  logic-module name + whether they have a mesh and a solid collider. */
async function monoliths(page: any) {
  return page.evaluate((type: number) => {
    const w = (window as any).loader.engine.getWorld();
    const out: Array<{ name: string; mesh: boolean; solid: boolean }> = [];
    for (const eid of w.queryEntities('AdjunctComponent')) {
      const a = w.getComponent(eid, 'AdjunctComponent');
      if (a?.stdData?.typeId !== type) continue;
      out.push({
        name: a.logicModule?.hooks?.reg?.().name ?? '?',
        mesh: !!w.getComponent(eid, 'MeshComponent'),
        solid: !!w.getComponent(eid, 'SolidComponent'),
      });
    }
    return out;
  }, DYN_TYPE);
}

/** Player position in SPP-local coords of the showcase block. */
async function localPos(page: any): Promise<[number, number, number]> {
  return page.evaluate((b: [number, number]) => {
    const w = (window as any).loader.engine.getWorld();
    const t = w.getComponent(w.queryEntities('TransformComponent', 'InputStateComponent')[0], 'TransformComponent');
    return [t.position[0] - (b[0] - 1) * 16, -t.position[2] - (b[1] - 1) * 16, t.position[1]];
  }, DYN_BLOCK);
}

async function walk(page: any, intent: [number, number], done: () => Promise<boolean>, maxSteps = 96): Promise<boolean> {
  await page.evaluate(([x, y]) => (window as any).loader.setPlayerMoveIntent(x, y), intent);
  let ok = false;
  for (let s = 0; s < maxSteps && !ok; s += 12) { await stepEngine(page, 12); ok = await done(); }
  await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 0));
  await stepEngine(page, 3);
  return ok;
}

test('dynamic declarative adjunct: loads, renders, collides — driven through the app', async ({ page }) => {
  test.setTimeout(180_000);
  await bootDeterministic(page);

  // (1) Click the real HUD button to teleport to the showcase block.
  await expect(page.getByTestId('goto-dynamic')).toBeVisible();
  await page.getByTestId('goto-dynamic').click();

  // (2) The three dynamic instances materialize. Each must resolve to the DYNAMIC
  //     definition (name 'monolith' — proof the sandbox-loaded code was registered
  //     and dispatch reached it, NOT a built-in fallback), build a mesh, and be solid.
  expect(await pumpUntil(page, async () => {
    const m = await monoliths(page);
    return m.length >= 3 && m.every((x) => x.mesh);
  })).toBe(true);

  const m = await monoliths(page);
  expect(m).toHaveLength(3);
  expect(m.every((x) => x.name === 'monolith'), 'all resolved to the dynamic def, not a fallback box').toBe(true);
  expect(m.every((x) => x.solid), 'stop=1 in authored raw → SolidComponent on every instance').toBe(true);
  expect(m.every((x) => x.mesh), 'AdjunctSystem built a mesh for every instance').toBe(true);
  await page.screenshot({ path: 'test-results/dynamic-1-rendered.png' });

  // (3) COLLISION: drop the player south of the centre monolith (local 8,8) and
  //     walk NORTH into it. The solid must hold the player short of the monolith.
  await page.evaluate((b) => (window as any).loader.teleportSeptopus(b, [8, 2.5, 1]), DYN_BLOCK);
  await stepEngine(page, 8); // land + settle
  const startY = (await localPos(page))[1];
  await walk(page, [0, 1], async () => (await localPos(page))[1] > 7.4, 96);
  const blockedY = (await localPos(page))[1];
  expect(blockedY, 'advanced north toward the monolith').toBeGreaterThan(startY + 1.5);
  expect(blockedY, 'but the solid monolith blocked passage (did not reach its centre y=8)').toBeLessThan(7.4);
  await page.screenshot({ path: 'test-results/dynamic-2-blocked.png' });
});
