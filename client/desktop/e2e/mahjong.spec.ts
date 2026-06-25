import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine } from './helpers';

// The "rich 3D app inside the world" loop, end to end through the real UI:
//   walk onto the mahjong table block (game zone) → Enter Game → the engine
//   resolves the block's Game Setting and calls the whitelisted `start` →
//   the mahjong board overlay appears → discard a tile (routed through the
//   methods whitelist) → Leave → the session `end`s and the board closes.
//
// The mahjong game itself is the standalone in-page mock; the engine only ever
// touches it through the Game Setting `methods` whitelist (game.md §3).

const MAHJONG_BLOCK: [number, number] = [2049, 2048];

/**
 * Settle the sim after a state change. The game lifecycle is async (start/end
 * round-trip through the IGameApi as microtasks), and a queued game.started only
 * reaches the client on a SUBSEQUENT step's boundary flush. Stepping in separate
 * page.evaluate calls lets those microtasks flush between steps, so the event
 * actually lands — a single big stepEngine() would resolve start only after it
 * returns, with no following step to flush it.
 */
async function settle(page: any, rounds = 12) {
  for (let i = 0; i < rounds; i++) await stepEngine(page, 3);
}

test('enter a playable zone, play mahjong via the external-API runtime, leave', async ({ page }) => {
  test.setTimeout(90_000);
  await bootDeterministic(page);

  // Teleport onto the table block (positioning is setup; the game flow is the
  // feature). The block's raw[4] = MAHJONG_GAME_ID makes it a playable zone.
  await page.evaluate((b) => (window as any).loader.teleportSpp(b, [3, 3, 3]), MAHJONG_BLOCK);
  await settle(page, 20);

  // GameZoneSystem derives the zone from block.game; the engine is the source
  // of truth. The "Enter Game" prompt appears only inside a zone.
  const onBlock = await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const ids = w.getEntitiesWith(['TransformComponent', 'InputStateComponent']);
    const t = w.getComponent(ids[0], 'TransformComponent');
    // engineToSpp inverse, BLOCK_SIZE 16: which block is the player on?
    const bx = Math.floor(t.position[0] / 16) + 1;
    const by = Math.floor(-t.position[2] / 16) + 1;
    return { bx, by, zone: w.gameZoneActive };
  });
  expect(onBlock).toMatchObject({ bx: MAHJONG_BLOCK[0], by: MAHJONG_BLOCK[1], zone: true });

  const enterBtn = page.getByTestId('enter-game');
  await expect(enterBtn).toBeVisible();
  await enterBtn.click();

  // Entering Game resolves the Game Setting + calls `start`; the board overlay
  // appears once game.started lands. Step to flush the async start + event.
  await settle(page, 10);
  const hud = page.getByTestId('mahjong-hud');
  await expect(hud).toBeVisible();

  // The engine resolved the mahjong Game Setting and opened a session.
  const session = await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    return {
      game: w.gameSetting?.game,
      started: !!w.gameRuntime?.started,
      allowsDiscard: !!w.gameRuntime?.allows('discard'),
      allowsHack: !!w.gameRuntime?.allows('hack'),
    };
  });
  expect(session).toEqual({ game: 'mahjong', started: true, allowsDiscard: true, allowsHack: false });

  // Opening hand is 14 tiles (self-drawn). Discard the first one — routed through
  // the whitelist — and the board advances (bots play, you draw again → 14).
  const handBefore = await page.locator('[data-testid^="mj-tile-"]').count();
  expect(handBefore).toBe(14);
  const wallBefore = await page.evaluate(() => (window as any).loader.mahjongState.wallRemaining);

  await page.locator('[data-testid^="mj-tile-"]').first().click();
  await settle(page, 6);

  const after = await page.evaluate(() => {
    const s = (window as any).loader.mahjongState;
    return { wall: s.wallRemaining, botDiscards: s.discards[1].length, hand: s.hand.length };
  });
  // Bots drew (wall shrank by your draw + 3 bot draws) and bot 1 has a discard.
  expect(after.wall).toBeLessThan(wallBefore);
  expect(after.botDiscards).toBeGreaterThan(0);
  expect(after.hand).toBe(14); // re-drew to 14, ready for the next discard

  // Evidence frame: the mahjong board mid-game, live inside the world.
  await page.screenshot({ path: 'test-results/mahjong-board.png' });

  // Leave the table → exit Game → the engine calls the whitelisted `end`.
  await page.getByTestId('mj-leave').click();
  await settle(page, 10);
  await expect(hud).toBeHidden();
  const ended = await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    return { runtime: w.gameRuntime, mode: (window as any).loader.currentMode };
  });
  expect(ended.runtime).toBeNull();
  expect(ended.mode).toBe('normal');

  // Evidence frame: the board mid-game (before leaving) is the money shot; grab a
  // shot of the world after leaving to confirm we're back in the 3D scene.
  await page.screenshot({ path: 'test-results/mahjong-after.png' });
});
