import { test, expect } from '@playwright/test';
import { bootDeterministic, waitForWorldReady, stepEngine } from './helpers';

/** After a reload: wait for injection, stop rAF, then step so BlockSystem's
 *  budgeted initializeBlock actually runs (isDraft is set there). */
async function settleAfterReload(page: any) {
  await waitForWorldReady(page);
  await page.evaluate(() => (window as any).loader.engine.stop());
  await stepEngine(page, 30);
}

// P1 local-first persistence, in the REAL browser IndexedDB:
//   1. save a draft → reload the page → the block is built from the draft
//   2. export JSON → wipe the DB → import → drafts restored durably
//
// The draft used here replaces the spawn block's mock content with a single
// marker box, so "loaded from draft" is observable as block.isDraft plus a
// drastically different adjunct census.

/** One marker box at a recognizable altitude tag. */
function markerRaw(tag: number): any[] {
  return [0, 1, [[0x00a2, [[[2, 2, 2], [8, 8, tag], [0, 0, 0], 3, [1, 1], 0, 0]]]], []];
}

/** Snapshot of the spawn block's draft state + its adjunct altitude tags. */
async function spawnBlockState(page: any) {
  return page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    for (const eid of w.queryEntities('BlockComponent')) {
      const b = w.getComponent(eid, 'BlockComponent');
      if (b?.x === 2048 && b?.y === 2048) {
        const tags = w.queryEntities('AdjunctComponent')
          .map((id: number) => w.getComponent(id, 'AdjunctComponent'))
          .filter((a: any) => a?.parentBlockEntityId === eid)
          .map((a: any) => a.stdData.oz);
        return { isDraft: !!b.isDraft, adjunctCount: tags.length, tags };
      }
    }
    return null;
  });
}

/** The local player's SPP location {block, position, rotation} from the engine. */
async function playerSpp(page: any) {
  return page.evaluate(() => (window as any).loader.engine.getPlayerSeptopusLocation());
}

test('player location survives a reload (engine meta channel)', async ({ page }) => {
  await bootDeterministic(page);
  const spawn = await playerSpp(page);

  // Walk the player to a clear lane east of spawn (between the west gems and the
  // east key, north of the south stop-wall), settle, so CharacterController
  // persists the spot to the 'player' meta channel.
  await page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const eid = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
    const t = w.getComponent(eid, 'TransformComponent');
    // SPP [10.5, 8, 1.5] → engine, in the spawn block (2048,2048).
    t.position[0] = (2048 - 1) * 16 + 10.5;
    t.position[1] = 1.5;
    t.position[2] = -((2048 - 1) * 16 + 8);
    t.dirty = true;
  });
  await stepEngine(page, 30); // settle on ground + emit/persist
  const moved = await playerSpp(page);

  // The persisted meta matches where the player actually is (engine-owned).
  const saved = await page.evaluate(async () => {
    const w = (window as any).loader.engine.getWorld();
    await w.draftStore.flush();                       // flush now drains meta writes too
    return w.draftStore.loadMeta(0, 'player');
  });
  expect(saved?.version).toBe(1);
  expect(saved.block).toEqual(moved.block);
  expect(saved.position[0]).toBeCloseTo(moved.position[0], 0); // within ~0.5m (emit gate)
  expect(Math.abs(moved.position[0] - spawn.position[0]))      // genuinely moved off spawn
    .toBeGreaterThan(2);

  // Real reload: a new page + new engine — only IndexedDB carries the location.
  await page.reload();
  await settleAfterReload(page);

  const restored = await playerSpp(page);
  // Restored to the saved spot, NOT the fallback spawn.
  expect(restored.block).toEqual(saved.block);
  expect(restored.position[0]).toBeCloseTo(saved.position[0], 0);
  expect(restored.position[1]).toBeCloseTo(saved.position[1], 0);
  expect(Math.abs(restored.position[0] - spawn.position[0]),
    'restored east is far from the spawn east (not a fallback)').toBeGreaterThan(2);
});

test('a saved draft survives a page reload (IndexedDB)', async ({ page }) => {
  await bootDeterministic(page);

  const before = await spawnBlockState(page);
  expect(before?.isDraft).toBe(false);                     // mock content, no draft

  // Save a draft for the spawn block and wait for the write-behind to land.
  await page.evaluate(async (raw) => {
    const w = (window as any).loader.engine.getWorld();
    w.draftStore.save(0, 2048, 2048, raw);
    await w.draftStore.flush();
  }, markerRaw(77));

  // Real reload: new page, new engine — only IndexedDB carries the draft over.
  await page.reload();
  await settleAfterReload(page);

  const after = await spawnBlockState(page);
  expect(after?.isDraft, 'block should rebuild from the persisted draft').toBe(true);
  expect(after?.tags).toContain(77);                       // marker box made it
  expect(after!.adjunctCount).toBeLessThan(before!.adjunctCount); // mock content replaced
});

test('export → wipe → import restores the world durably', async ({ page }) => {
  await bootDeterministic(page);

  // Draft + export.
  const json = await page.evaluate(async (raw) => {
    const loader = (window as any).loader;
    loader.engine.getWorld().draftStore.save(0, 2048, 2048, raw);
    return loader.exportWorldJson(0);                      // flushes before export
  }, markerRaw(55));
  expect(JSON.parse(json).drafts).toHaveLength(1);

  // Wipe the durable store (close our connection first), then reload:
  // the draft must be GONE — mock content back.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('septopus');
    req.onsuccess = () => resolve();
    req.onblocked = () => resolve(); // engine connection stays open; reload finishes the delete
    req.onerror = () => reject(req.error);
  }));
  await page.reload();
  await settleAfterReload(page);
  expect((await spawnBlockState(page))?.isDraft).toBe(false);

  // Import the file, reload again: the draft is back and durable.
  await page.evaluate(async (data) => {
    await (window as any).loader.importWorldJson(data);
  }, json);
  await page.reload();
  await settleAfterReload(page);

  const restored = await spawnBlockState(page);
  expect(restored?.isDraft, 'imported draft should persist across reload').toBe(true);
  expect(restored?.tags).toContain(55);
});
