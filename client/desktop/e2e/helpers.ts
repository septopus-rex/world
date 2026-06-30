import { Page, expect } from '@playwright/test';

/**
 * Boot the client deterministically:
 *  1. load + wait for the world to be ready,
 *  2. STOP the rAF loop (headless Chromium throttles rAF, so it doesn't reliably
 *     advance the sim), and
 *  3. drive the simulation with engine.step(dt) instead — fully deterministic.
 * This is exactly what the step(dt) refactor enables.
 */
export async function bootDeterministic(page: Page): Promise<void> {
  await page.goto('/');
  await waitForWorldReady(page);
  await page.evaluate(() => (window as any).loader.engine.stop());
  await stepEngine(page, 90); // settle physics (land on ground) + render initial frames
}

/** Wait until window.loader is up and at least one block has loaded. */
export async function waitForWorldReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const l = (window as any).loader;
    return !!(l && l.engine && l.engine.getWorld() && typeof l.getLoadedBlockCount === 'function' && l.getLoadedBlockCount() > 0);
  }, undefined, { timeout: 30_000 });
}

/** Advance the simulation n fixed steps (deterministic). */
export async function stepEngine(page: Page, n = 60): Promise<void> {
  await page.evaluate((count) => {
    const e = (window as any).loader.engine;
    for (let i = 0; i < count; i++) e.step(1 / 60);
  }, n);
}

/** Live player engine-space position [x, y, z] from the ECS world. */
export async function playerPosition(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const ids = w.getEntitiesWith(['TransformComponent', 'InputStateComponent']);
    const t = w.getComponent(ids[0], 'TransformComponent');
    return [t.position[0], t.position[1], t.position[2]];
  });
}

/** Current camera/player yaw (radians). */
export async function cameraYaw(page: Page): Promise<number> {
  return page.evaluate(() => (window as any).loader.getPlayerRotationY());
}

/** The single main Three.js canvas (the page also has small minimap/HUD canvases). */
export function mainCanvas(page: Page) {
  return page.locator('canvas[data-engine]');
}

/** Live snapshot of world.globalFlags (the observable triggers write to). */
export async function worldFlags(page: Page): Promise<Record<string, any>> {
  return page.evaluate(() => ({ ...(window as any).loader.engine.getWorld().globalFlags }));
}

/**
 * Walk with a move intent, stepping in small deterministic chunks until `done`
 * returns true (or maxSteps elapse). Intent is cleared before returning so the
 * player stands still for the assertions that follow.
 */
export async function walkUntil(
  page: Page,
  intent: [number, number],
  done: () => Promise<boolean>,
  maxSteps = 600,
): Promise<boolean> {
  await page.evaluate(([x, y]) => (window as any).loader.setPlayerMoveIntent(x, y), intent);
  let ok = false;
  for (let stepped = 0; stepped < maxSteps && !ok; stepped += 10) {
    await stepEngine(page, 10);
    ok = await done();
  }
  await page.evaluate(() => (window as any).loader.setPlayerMoveIntent(0, 0));
  return ok;
}

/**
 * Teleport into a game zone and explicitly enter Game mode. Native in-world games
 * (pool/mahjong/shooting) are zone-gated: their pieces only spawn while you're in
 * Game mode inside the block. setMode('game') is refused outside a zone (the
 * game-mode-entry contract), so a true return also proves the zone gate fired.
 */
export async function enterGameAt(
  page: Page,
  block: [number, number],
  pos: [number, number, number],
): Promise<boolean> {
  await page.evaluate(([b, p]) => (window as any).loader.teleportSpp(b, p), [block, pos] as any);
  // Poll setMode: GameZoneSystem needs a frame or two to register the zone, and
  // setMode('game') is refused until it has — so retry until it sticks (tolerant
  // of variable software-WebGL frame pacing) rather than betting on a fixed wait.
  let entered = false;
  for (let i = 0; i < 24 && !entered; i++) {
    await stepEngine(page, 3);
    entered = await page.evaluate(() => {
      const l = (window as any).loader;
      return l.engine.getWorld().mode === 'game' ? true : l.setMode('game');
    });
  }
  await stepEngine(page, 3); // session spawns + meshes build
  return entered;
}
