import type { Page } from '@playwright/test';

/** Wait until the shared core loader booted a world (same contract as desktop e2e). */
export async function waitForWorldReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const l = (window as any).loader;
    return !!(l && l.engine && l.engine.getWorld() && typeof l.getLoadedBlockCount === 'function' && l.getLoadedBlockCount() > 0);
  }, undefined, { timeout: 60_000 });
}

/** Deterministic engine stepping (the rAF loop is stopped by the caller). */
export async function stepEngine(page: Page, n = 60): Promise<void> {
  await page.evaluate((count) => {
    const engine = (window as any).loader.engine;
    for (let i = 0; i < count; i++) engine.step(1 / 60);
  }, n);
}
