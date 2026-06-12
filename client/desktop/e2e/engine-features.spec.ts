import { test, expect } from '@playwright/test';
import { bootDeterministic, waitForWorldReady, stepEngine, worldFlags } from './helpers';

// The "engine completeness" batch in the real browser: mode switcher UI +
// Ghost noclip, gameplay-session persistence across reload (flags + audio
// chain), HP/respawn through Game mode, and runtime block LOD.

async function settle(page: any) {
  await waitForWorldReady(page);
  await page.evaluate(() => (window as any).loader.engine.stop());
  await stepEngine(page, 30);
}

async function playerY(page: any): Promise<number> {
  return page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const id = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
    return w.getComponent(id, 'TransformComponent').position[1];
  });
}

test('mode switcher: Ghost flies and hides the avatar, Normal restores', async ({ page }) => {
  await bootDeterministic(page);

  await page.locator('[data-testid="mode-ghost"]').click();
  await stepEngine(page, 2);
  expect(await page.evaluate(() => (window as any).loader.engine.getMode())).toBe('ghost');

  // Space = ascend (jump flag is OR-merged each frame).
  const y0 = await playerY(page);
  await page.evaluate(() => {
    const e = (window as any).loader.engine;
    const w = e.getWorld();
    const id = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
    const input = w.getComponent(id, 'InputStateComponent');
    for (let i = 0; i < 30; i++) { input.jump = true; e.step(1 / 60); }
  });
  expect(await playerY(page)).toBeGreaterThan(y0 + 1);

  // Avatar is hidden while ghosting (third-person default would show it).
  const avatarVisible = await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const id = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
    return w.getComponent(id, 'AvatarComponent').handle.visible;
  });
  expect(avatarVisible).toBe(false);

  await page.locator('[data-testid="mode-normal"]').click();
  await stepEngine(page, 2);
  expect(await page.evaluate(() => (window as any).loader.engine.getMode())).toBe('normal');
});

test('touch button: sound action fires; session flags survive a reload', async ({ page }) => {
  await bootDeterministic(page);

  // Arm an audio counter, then "click" the cone's touch volume the way the
  // raycast would report it.
  const audioCount = await page.evaluate(async () => {
    const loader = (window as any).loader;
    const w = loader.engine.getWorld();
    let audio = 0;
    loader.engine.on('audio:played', () => audio++);

    let touchEid: number | null = null;
    for (const eid of w.queryEntities('TriggerComponent')) {
      const t = w.getComponent(eid, 'TriggerComponent');
      if (t?.events?.some((n: any) => n.type === 'touch')) { touchEid = eid; break; }
    }
    const player = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
    w.events.emit('interact.primary',
      { metadata: {}, distance: 2, point: [0, 0, 0] },
      { target: touchEid, actor: player });
    for (let i = 0; i < 3; i++) loader.engine.step(1 / 60);
    return audio;
  });
  expect(audioCount).toBeGreaterThan(0);
  expect((await worldFlags(page)).demo_touch).toBe(true);

  // Let the session write-behind land, then a REAL reload.
  await page.evaluate(async () => {
    await (window as any).loader.engine.getWorld().draftStore.flush();
    await new Promise(r => setTimeout(r, 50));
  });
  await page.reload();
  await settle(page);

  expect((await worldFlags(page)).demo_touch, 'session flags restored from IndexedDB').toBe(true);
});

test('Game mode: damage shows the HP bar; lethal damage respawns at spawn', async ({ page }) => {
  await bootDeterministic(page);
  await page.locator('[data-testid="mode-game"]').click();
  await stepEngine(page, 2);

  const damage = (n: number) => page.evaluate((amount: number) => {
    const w = (window as any).loader.engine.getWorld();
    const player = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
    w.actuator.execute(
      { type: 'player', target: '', method: 'damage', params: [amount] },
      { world: w, playerId: player, mode: w.mode });
  }, n);

  await damage(30);
  await stepEngine(page, 2);
  await expect(page.locator('[data-testid="health-bar"]')).toBeVisible();
  await expect(page.locator('[data-testid="health-bar"]')).toContainText('70 / 100');

  const spawnX = await page.evaluate(() => (window as any).loader.engine.getWorld().config.player.start.position[0]);
  await damage(999);
  await stepEngine(page, 2);

  const after = await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const id = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
    return {
      hp: w.getComponent(id, 'HealthComponent').hp,
      x: w.getComponent(id, 'TransformComponent').position[0],
    };
  });
  expect(after.hp).toBe(100);
  expect(after.x).toBeCloseTo(spawnX, 3);
  await expect(page.locator('[data-testid="health-bar"]')).toBeHidden(); // full again
});

test('block LOD: shrinking lodNear hides far adjunct meshes at runtime', async ({ page }) => {
  await bootDeterministic(page);

  const hiddenAt = (lodNear: number) => page.evaluate(async (near: number) => {
    const w = (window as any).loader.engine.getWorld();
    (w.config.world as any).performance = { lodNear: near };
    for (let i = 0; i < 40; i++) (window as any).loader.engine.step(1 / 60); // ≥2 LOD checks
    let hidden = 0;
    for (const eid of w.queryEntities('AdjunctComponent')) {
      const adj = w.getComponent(eid, 'AdjunctComponent');
      if (String(adj.adjunctId).startsWith('ground')) continue;
      const mesh = w.getComponent(eid, 'MeshComponent');
      if (mesh?.handle && mesh.handle.visible === false) hidden++;
    }
    return hidden;
  }, lodNear);

  // 5 m radius: everything outside the player's immediate bubble drops out.
  const hiddenNear5 = await hiddenAt(5);
  expect(hiddenNear5).toBeGreaterThan(0);

  // Huge radius: everything visible again (touch volumes stay invisible by design).
  const hiddenNear1000 = await hiddenAt(1000);
  expect(hiddenNear1000).toBeLessThan(hiddenNear5);
});
