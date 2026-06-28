import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine } from './helpers';

// Full live pipeline, end to end, in the REAL client:
//   (simulated) WebSocket → ILiveSource → LiveSystem → world.events
//     → DesktopLoader handler → motif re-textures via IPFS → image updates.
// A 'panel' motif is an image board whose picture is an IPFS hash; pushing a new
// hash over the socket swaps the image live.

async function ingest(page: any, src: string): Promise<string> {
  return page.evaluate(async (s: string) => {
    const router = (window as any).loader.engine.ipfs;
    const bytes = new Uint8Array(await (await fetch(s)).arrayBuffer());
    return router.put(bytes); // → CID (content hash)
  }, src);
}

// The motif's single derived panel box: its texture hash + whether a map loaded.
async function panelState(page: any, motifId: string) {
  return page.evaluate((srcId: string) => {
    const w = (window as any).loader.engine.getWorld();
    for (const eid of w.getEntitiesWith(['AdjunctComponent'])) {
      const a = w.getComponent(eid, 'AdjunctComponent');
      if (a?.stdData?.derivedFrom === srcId) {
        const mc = w.getComponent(eid, 'MeshComponent');
        let hasMap = false;
        mc?.handle?.traverse?.((o: any) => {
          const m = o.material;
          if (m && (Array.isArray(m) ? m.some((x: any) => x && x.map) : m.map)) hasMap = true;
        });
        return { texture: a.stdData.material?.texture, hasMap };
      }
    }
    return null;
  }, motifId);
}

async function waitForTexture(page: any, motifId: string, cid: string, maxLoops = 40) {
  let s = await panelState(page, motifId);
  for (let i = 0; i < maxLoops && !(s && s.texture === cid && s.hasMap); i++) {
    await stepEngine(page, 2);
    s = await panelState(page, motifId);
  }
  return s;
}

test('live: WebSocket hash → motif image update via IPFS', async ({ page }) => {
  await bootDeterministic(page);

  // The injected transport is the (simulated) WebSocket source.
  expect(await page.evaluate(() => (window as any).loader.engine.live?.kind)).toBe('websocket');

  // Two images → two content hashes (CIDs) in IPFS.
  const cidForest = await ingest(page, '/assets/ground-forest.png');
  const cidMoon = await ingest(page, '/assets/ground-moon.png');
  expect(cidForest).toMatch(/^bafy/);
  expect(cidMoon).not.toBe(cidForest);

  // Place a 'panel' motif (image board) on the spawn block, initial image = forest.
  const motifId = await page.evaluate((cid: string) => {
    const w = (window as any).loader.engine.getWorld();
    const bs = w.systems.findSystemByName('BlockSystem');
    let blockEid = w.getEntitiesWith(['BlockComponent'])[0];
    for (const b of w.getEntitiesWith(['BlockComponent'])) {
      const c = w.getComponent(b, 'BlockComponent');
      if (c?.x === 2048 && c?.y === 2048) { blockEid = b; break; }
    }
    const eid = bs.spawnAdjunct(w, blockEid, 0x00c2, [[8, 11, 0.2], 'panel', 1, { texture: cid }]);
    return w.getComponent(eid, 'AdjunctComponent').adjunctId;
  }, cidForest);
  expect(motifId).toBeTruthy();

  // BEFORE: the board shows the forest hash, loaded through IPFS.
  const before = await waitForTexture(page, motifId, cidForest);
  expect(before?.texture, 'panel textured with the forest hash').toBe(cidForest);
  expect(before?.hasMap, 'forest image loaded via IPFS').toBe(true);
  await page.evaluate(() => (window as any).loader.engine.getWorld().renderEngine.setMainCameraRotation(0, 0, 0));
  await stepEngine(page, 2);
  await page.screenshot({ path: 'test-results/live-motif-before.png' });

  // PUSH a new hash over the (simulated) WebSocket on the 'motif' topic.
  await page.evaluate(([id, cid]: [string, string]) => {
    (window as any).loader.engine.live.simulateServerMessage('motif', { adjunctId: id, hash: cid });
  }, [motifId, cidMoon] as [string, string]);

  // One step delivers it (LiveSystem polls → world.events → handler re-expands).
  await stepEngine(page, 2);

  // AFTER: the same board now shows the moon hash — image updated live.
  const after = await waitForTexture(page, motifId, cidMoon);
  expect(after?.texture, 'panel re-textured with the pushed hash').toBe(cidMoon);
  expect(after?.hasMap, 'moon image loaded via IPFS after the live push').toBe(true);
  await page.screenshot({ path: 'test-results/live-motif-after.png' });

  console.log('LIVE-MOTIF', JSON.stringify({ cidForest, cidMoon, before, after }));
});
