import { test, expect } from '@playwright/test';
import { bootDeterministic, stepEngine } from './helpers';

// End-to-end UI verification of the hybrid chain architecture (protocol land.md):
//   · Bitcoin anchor + IPFS gateway serve the world config (`land` section)
//   · Solana `septopus_land` program on localnet (:8899) holds block ownership,
//     32-byte content CID digests, and marketplace listings
//   · Alice connects a wallet, claims an unminted block, edits it in 3D,
//     publishes the block to IPFS + Solana, and lists it for sale
//   · Alice disconnects and wipes her local drafts/wallet; Bob connects a new
//     wallet on the same block, sees Alice's published 3D content streamed from
//     Solana → IPFS, buys the block on chain, and becomes the new owner.

const RPC = 'http://127.0.0.1:8899';

async function rpcHealthy(): Promise<boolean> {
    try {
        const r = await fetch(RPC, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
        });
        const j = await r.json();
        return j?.result === 'ok';
    } catch {
        return false;
    }
}

test('Solana 产权合约 UI 全链路: 连接钱包 → 认领铸造 → 3D 编辑发布 CID 上链 → 挂单 → 买家跨钱包同步与购买', async ({ page }) => {
    test.setTimeout(180_000);
    test.skip(!(await rpcHealthy()), 'solana-test-validator not running — run: bash deploy/chain-localnet.sh');

    await bootDeterministic(page);
    const landEnabled = await page.evaluate(() => !!(window as any).loader?.landEnabled);
    test.skip(!landEnabled, 'client built without SEPTOPUS_LAND=solana');

    // Pick a unique coordinate inside [1..4096, 1..4096] far from authored demo blocks
    // so every test run starts on a guaranteed unminted block.
    const bx = 3100 + Math.floor((Date.now() / 1000) % 800);
    const by = 3100 + Math.floor(Math.random() * 800);

    await page.evaluate(async ([x, y]) => {
        const l = (window as any).loader;
        l.teleportSeptopus([x, y], [8, 8, 2]);
        await l.landRefresh();
    }, [bx, by]);
    await stepEngine(page, 20);

    // 1. Open the Land panel; verify the block is unminted and Edit mode is gated off.
    const pill = page.getByTestId('land-toggle');
    await expect(pill).toBeVisible();
    await expect(page.getByTestId('land-coord')).toHaveText(`[${bx}, ${by}]`);
    await expect(page.getByTestId('land-status-pill')).toContainText('UNMINTED');

    const editRefused = await page.evaluate(() => (window as any).loader.setMode('edit'));
    expect(editRefused, 'unminted block refuses Edit mode').toBe(false);

    await pill.click();
    await expect(page.getByTestId('land-panel')).toBeVisible();

    // 2. Alice connects her wallet (auto-funded burner on localnet).
    await page.getByTestId('land-connect').click();
    await expect(page.getByTestId('land-wallet')).toBeVisible({ timeout: 20_000 });
    const aliceAddr = await page.evaluate(() => (window as any).loader.landSnapshot().wallet);
    expect(aliceAddr).toBeTruthy();

    // 3. Alice mints the block on Solana → becomes owner → Edit mode unlocks.
    await page.getByTestId('land-mint').click();
    await expect(page.getByTestId('land-status')).toHaveText('owned', { timeout: 20_000 });
    await expect(page.getByTestId('land-status-pill')).toContainText('OWNED');
    const canEditNow = await page.evaluate(() => (window as any).loader.canEditBlock());
    expect(canEditNow, 'owner can edit her minted block').toBe(true);

    // 4. Alice stamps the test scene onto her block (creates a local draft) and
    //    publishes it to IPFS + Solana.
    await page.getByTestId('stamp-scene').click();
    await stepEngine(page, 10);
    await expect(page.getByTestId('land-draft')).toContainText('有未上链修改');

    await page.getByTestId('land-publish').click();
    await expect(page.getByTestId('land-cid')).toContainText('bafk', { timeout: 20_000 });
    await expect(page.getByTestId('land-draft')).toHaveText('无');

    const publishedCid = await page.evaluate(() => (window as any).loader.landSnapshot().block?.cid);
    expect(publishedCid).toMatch(/^bafk[a-z2-7]+$/);

    // 5. Alice lists the block for 0.4 SOL; while listed, Edit is locked (no bait-and-switch).
    await page.getByTestId('land-list-price').fill('0.4');
    await page.getByTestId('land-list').click();
    await expect(page.getByTestId('land-status')).toHaveText('listed', { timeout: 20_000 });
    expect(await page.evaluate(() => (window as any).loader.canEditBlock())).toBe(false);

    await page.screenshot({ path: 'test-results/solana-land-alice-listed.png' });

    // 6. Switch to Bob: disconnect Alice, wipe local burner key + in-memory CAS/draft
    //    caches so the block MUST resolve from Solana CID → HTTP IPFS gateway, then
    //    connect Bob's wallet and buy the block through the UI.
    await page.getByTestId('land-disconnect').click();
    await page.evaluate(async ([x, y]) => {
        localStorage.removeItem('septopus.land.burner.localnet');
        const l = (window as any).loader;
        await l.engine.clearDrafts(0);
        l.land.onChainRaw.clear();
        l.land.blocks.clear();
        await l.landRefresh();
        return l.content.blockAt(x, y)?.raw?.[2]?.length ?? 0;
    }, [bx, by]);

    await expect(page.getByTestId('land-status')).toHaveText('listed', { timeout: 15_000 });
    await expect(page.getByTestId('land-cid')).toContainText(publishedCid.slice(0, 10));

    const bobBlockAdjuncts = await page.evaluate(([x, y]) => {
        const raw = (window as any).loader.content.blockAt(x, y)?.raw;
        return Array.isArray(raw?.[2]) ? raw[2].length : 0;
    }, [bx, by]);
    expect(bobBlockAdjuncts, 'Bob resolved Alice’s published block content via Solana CID → IPFS').toBeGreaterThan(0);

    await page.getByTestId('land-connect').click();
    await expect(page.getByTestId('land-wallet')).toBeVisible({ timeout: 20_000 });
    const bobAddr = await page.evaluate(() => (window as any).loader.landSnapshot().wallet);
    expect(bobAddr).not.toBe(aliceAddr);

    // 7. Bob sees the "立即购买" button, clicks it, and becomes the new on-chain owner.
    await expect(page.getByTestId('land-buy')).toBeVisible();
    await page.getByTestId('land-buy').click();
    await expect(page.getByTestId('land-status')).toHaveText('owned', { timeout: 20_000 });
    await expect(page.getByTestId('land-status-pill')).toContainText('OWNED');

    const bobOwns = await page.evaluate(() => {
        const s = (window as any).loader.landSnapshot();
        return s.block?.owner === s.wallet && s.canEdit === true;
    });
    expect(bobOwns, 'Bob is now the on-chain owner and can edit').toBe(true);

    await page.screenshot({ path: 'test-results/solana-land-bob-bought.png' });
});
