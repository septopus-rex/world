import { test, expect } from '@playwright/test';
import { bootDeterministic, waitForWorldReady, stepEngine } from './helpers';

// The creator loop + moving-platform carry in the real browser:
//   1. Edit mode → arm the palette → click places a box → survives reload (draft).
//   2. Standing on the demo lift ball while it rises (trigger moveZ) carries
//      the player up with it.

async function settle(page: any) {
  await waitForWorldReady(page);
  await page.evaluate(() => (window as any).loader.engine.stop());
  await stepEngine(page, 30);
}

test('palette placement: armed type + click → adjunct placed, persisted across reload', async ({ page }) => {
  await bootDeterministic(page);

  // Enter Edit mode through the real switcher and let the session bind.
  await page.locator('[data-testid="mode-edit"]').click();
  await stepEngine(page, 10);

  // The palette renders as DOM buttons (DefaultUIProvider).
  await expect(page.locator('.sept-ui-group button', { hasText: 'Box' })).toBeVisible();

  const placed = await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const before = w.queryEntities('AdjunctComponent').length;

    // Arm the palette (same state the Box button sets), then click a surface
    // point inside the active block the way the raycast reports it.
    const editSys: any = w.systems.findSystemByName('EditSystem');
    editSys.placingTypeId = 0x00a2;

    const blockEid = w.activeEditBlockId;
    const block = w.getComponent(blockEid, 'BlockComponent');
    // Engine coords of SPP (6, 6, 0) in the active block.
    const ex = (block.x - 1) * 16 + 6;
    const ez = -((block.y - 1) * 16 + 6);
    w.events.emit('interact.primary',
      { metadata: {}, distance: 5, point: [ex, 0, ez] },
      { target: blockEid, actor: w.queryEntities('TransformComponent', 'InputStateComponent')[0] });
    for (let i = 0; i < 3; i++) (window as any).loader.engine.step(1 / 60);

    return {
      delta: w.queryEntities('AdjunctComponent').length - before,
      blockX: block.x, blockY: block.y,
    };
  });
  expect(placed.delta).toBe(1);

  // Exit Edit (saves the draft), flush, reload — the placed box must persist.
  await page.locator('[data-testid="mode-normal"]').click();
  await stepEngine(page, 5);
  await page.evaluate(async () => {
    await (window as any).loader.engine.getWorld().draftStore.flush();
  });
  await page.reload();
  await settle(page);

  const survived = await page.evaluate(([bx, by]: number[]) => {
    const w = (window as any).loader.engine.getWorld();
    const draft = w.draftStore.load(0, bx, by);
    const boxes = draft?.raw?.[2]?.find((g: any[]) => g[0] === 0x00a2)?.[1] ?? [];
    return boxes.some((row: any[]) => row[1][0] === 6 && row[1][1] === 6);
  }, [placed.blockX, placed.blockY]);
  expect(survived, 'placed box persisted into the block draft').toBe(true);
});

test('moving platform: the lift ball carries a standing player upward', async ({ page }) => {
  await bootDeterministic(page);

  const result = await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const e = (window as any).loader.engine;
    const player = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
    const pTrans = w.getComponent(player, 'TransformComponent');

    // The demo lift ball (stop=1, standable).
    let ballTrans: any = null;
    for (const eid of w.queryEntities('AdjunctComponent')) {
      const a = w.getComponent(eid, 'AdjunctComponent');
      if (a?.adjunctId === 'adj_2048_2048_167_0') {
        ballTrans = w.getComponent(eid, 'TransformComponent');
        break;
      }
    }
    if (!ballTrans) return { error: 'ball not found' };

    // Stand on the ball and settle.
    pTrans.position[0] = ballTrans.position[0];
    pTrans.position[1] = ballTrans.position[1] + 0.5 + 1.2;
    pTrans.position[2] = ballTrans.position[2];
    for (let i = 0; i < 40; i++) e.step(1 / 60);
    const yBefore = pTrans.position[1];

    // Raise the ball exactly like the hold-pad trigger does (actuator moveZ).
    w.actuator.execute(
      { type: 'adjunct', target: 'adj_2048_2048_167_0', method: 'moveZ', params: [0.8] },
      { world: w, playerId: player, mode: w.mode });
    for (let i = 0; i < 10; i++) e.step(1 / 60);

    return { yBefore, yAfter: pTrans.position[1] };
  });

  expect((result as any).error).toBeUndefined();
  expect((result as any).yAfter).toBeGreaterThan((result as any).yBefore + 0.6);
});
