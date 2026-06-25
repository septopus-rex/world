import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine } from './helpers';

// The SECOND game, same flow as mahjong — proof the "world hosts external apps"
// pattern generalises: a different table block, a different Game Setting, a
// different HUD, all through the same engine runtime + the client game registry /
// API router. Entering pool must reach the POOL backend (the router dispatches by
// game name; the mahjong backend would throw on game !== 'mahjong').

const POOL_BLOCK: [number, number] = [2048, 2049];

async function settle(page: any, rounds = 12) {
  for (let i = 0; i < rounds; i++) await stepEngine(page, 3);
}
async function pumpUntil(page: any, cond: () => Promise<boolean>, maxRounds = 40): Promise<boolean> {
  for (let i = 0; i < maxRounds; i++) { await stepEngine(page, 3); if (await cond()) return true; }
  return false;
}

test('enter the pool table zone, play via the external-API runtime, leave', async ({ page }) => {
  test.setTimeout(90_000);
  await bootDeterministic(page);

  // Walk onto the pool block (raw[4] = POOL_GAME_ID → playable zone).
  await page.evaluate((b) => (window as any).loader.teleportSpp(b, [3, 3, 3]), POOL_BLOCK);
  await settle(page, 20);
  expect(await page.evaluate(() => (window as any).loader.engine.getWorld().gameZoneActive)).toBe(true);

  // Enter Game → engine resolves the POOL Game Setting + calls the whitelisted
  // start, routed to the pool backend. Pump until the client board arrives.
  await page.getByTestId('enter-game').click();
  expect(await pumpUntil(page, async () =>
    page.evaluate(() => (window as any).loader.activeGame === 'pool'))).toBe(true);

  await expect(page.getByTestId('pool-hud')).toBeVisible();
  // Mahjong HUD must NOT be up — the dispatch picked pool by game name.
  await expect(page.getByTestId('mahjong-hud')).toBeHidden();

  const session = await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    return {
      game: w.gameSetting?.game,
      started: !!w.gameRuntime?.started,
      allowsShoot: !!w.gameRuntime?.allows('shoot'),
      allowsDiscard: !!w.gameRuntime?.allows('discard'), // a mahjong method — NOT in pool's whitelist
      balls: (window as any).loader.gameState?.balls?.length,
    };
  });
  expect(session).toMatchObject({ game: 'pool', started: true, allowsShoot: true, allowsDiscard: false });
  expect(session.balls).toBeGreaterThan(1); // cue + object balls dealt by the pool backend

  // Whitelist still gates the transport: 'shoot' is allowed, a mahjong 'discard' is not.
  const discardRefused = await page.evaluate(async () => {
    try { await (window as any).loader.engine.getWorld().gameRuntime.call('discard', [0]); return 'sent'; }
    catch { return 'refused'; }
  });
  expect(discardRefused).toBe('refused');

  await page.screenshot({ path: 'test-results/pool-board.png' });

  // Take a shot (angle 0°, power 60) → the server/mock advances; shots increments.
  await page.getByTestId('pool-shoot').click();
  expect(await pumpUntil(page, async () =>
    page.evaluate(() => (window as any).loader.gameState?.shots >= 1))).toBe(true);

  // Leave → exit Game → engine calls the whitelisted `end`; HUD closes.
  await page.getByTestId('pool-leave').click();
  expect(await pumpUntil(page, async () =>
    page.evaluate(() => (window as any).loader.activeGame === null
      && (window as any).loader.currentMode === 'normal'))).toBe(true);
  await expect(page.getByTestId('pool-hud')).toBeHidden();
});
