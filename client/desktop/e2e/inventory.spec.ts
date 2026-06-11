import { test, expect } from '@playwright/test';
import { bootDeterministic, waitForWorldReady, stepEngine, worldFlags } from './helpers';

// Local-first inventory (P0–P2) in the real browser:
//   1. pick a gem → bag panel shows it → reload → bag restored from IndexedDB
//      AND the gem stays gone from the world (block draft) → DROP puts it back.
//   2. the key door only opens when the key item is carried (JSONLogic
//      inventory.* condition through the live trigger pipeline).

/** Settle a freshly-(re)loaded page: stop rAF, step until adjuncts are built. */
async function settle(page: any) {
  await waitForWorldReady(page);
  await page.evaluate(() => (window as any).loader.engine.stop());
  await stepEngine(page, 30);
}

/** Entity ids of live world items matching a predicate on ItemComponent. */
async function findItem(page: any, match: Partial<{ templateId: number; seed: number }>) {
  return page.evaluate((m: any) => {
    const w = (window as any).loader.engine.getWorld();
    for (const eid of w.queryEntities('ItemComponent')) {
      const it = w.getComponent(eid, 'ItemComponent');
      if (it && (m.templateId === undefined || it.templateId === m.templateId)
             && (m.seed === undefined || it.seed === m.seed)) return eid;
    }
    return null;
  }, match);
}

/** Pick an item up the way a click lands (interact event, sourced to the player). */
async function pickUp(page: any, entityId: number) {
  await page.evaluate((eid: number) => {
    const w = (window as any).loader.engine.getWorld();
    const player = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
    w.emitSimple('interact', { entityId: eid, distance: 2 }, player);
  }, entityId);
  await stepEngine(page, 2);
}

/** The player's live bag contents. */
async function bagItems(page: any) {
  return page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const player = w.queryEntities('InventoryComponent', 'InputStateComponent')[0];
    return [...(w.getComponent(player, 'InventoryComponent')?.items ?? [])];
  });
}

test('pickup → bag UI → reload persistence (IDB) → drop back into the world', async ({ page }) => {
  await bootDeterministic(page);

  // The demo gem (seed 9347) exists in the world; the bag starts empty.
  const gem = await findItem(page, { templateId: 1, seed: 9347 });
  expect(gem).not.toBeNull();
  expect(await bagItems(page)).toHaveLength(0);

  await pickUp(page, gem!);

  // Bag credited + panel renders the gem (rarity/attrs derive from the seed).
  expect(await bagItems(page)).toEqual([
    { id: 'itm_1_9347', quantity: 1, metadata: { templateId: 1, seed: 9347 } },
  ]);
  await expect(page.locator('[data-testid="bag-item-itm_1_9347"]')).toBeVisible();

  // Let the write-behind land (block draft + inventory meta), then REAL reload.
  await page.evaluate(async () => {
    const w = (window as any).loader.engine.getWorld();
    await w.draftStore.flush();
    await new Promise(r => setTimeout(r, 50)); // saveMeta is fire-and-forget
  });
  await page.reload();
  await settle(page);

  // Durable on both sides: bag restored, gem still gone from the world.
  expect(await bagItems(page)).toEqual([
    { id: 'itm_1_9347', quantity: 1, metadata: { templateId: 1, seed: 9347 } },
  ]);
  expect(await findItem(page, { seed: 9347 })).toBeNull();
  await expect(page.locator('[data-testid="bag-item-itm_1_9347"]')).toBeVisible();

  // DROP via the panel button: bag → world, atomically.
  await page.locator('[data-testid="bag-item-itm_1_9347"] button').click();
  await stepEngine(page, 3);
  expect(await bagItems(page)).toHaveLength(0);
  expect(await findItem(page, { seed: 9347 })).not.toBeNull();
});

test('key door: denied empty-handed, opens once the key is carried', async ({ page }) => {
  await bootDeterministic(page);

  // Locate the key-door trigger volume (the one conditioned on inventory.tpl_2)
  // and the door it moves, straight from live components.
  const probe = await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    for (const eid of w.queryEntities('TriggerComponent')) {
      const t = w.getComponent(eid, 'TriggerComponent');
      const cond = JSON.stringify(t?.events?.[0]?.conditions ?? {});
      if (cond.includes('inventory.tpl_2')) {
        const pos = w.getComponent(eid, 'TransformComponent').position;
        return { pad: [pos[0], pos[1], pos[2]] };
      }
    }
    return null;
  });
  expect(probe).not.toBeNull();

  const teleport = async (offset: number) => {
    await page.evaluate(([x, y, z, dx]: number[]) => {
      const w = (window as any).loader.engine.getWorld();
      const player = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
      const t = w.getComponent(player, 'TransformComponent');
      t.position[0] = x + dx; t.position[1] = y; t.position[2] = z;
    }, [...probe!.pad, offset]);
    await stepEngine(page, 3);
  };

  // 1. Walk in empty-handed → fallback only, door stays shut.
  await teleport(0);
  expect((await worldFlags(page)).demo_key_door).toBeUndefined();

  // 2. Step out (STAY in the spawn block — +100m would cross the streaming
  //    window and evict/rebuild the block mid-test), pick up the key,
  //    re-enter → the door opens (oneTime consumed only now — the earlier
  //    denied entry must not have eaten it).
  await teleport(5);
  const key = await findItem(page, { templateId: 2 });
  expect(key).not.toBeNull();
  await pickUp(page, key!);
  await teleport(0);

  expect((await worldFlags(page)).demo_key_door).toBe(true);
});
