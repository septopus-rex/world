import { test, expect } from '@playwright/test';

// The FULL boot chain (protocol/cn|en/boot-chain.md), dev rehearsal (§5): a real
// browser loads the shim from the gateway and walks every normative step —
//   anchor (name-index stand-in) → ROOT_CID → gateway fetch → CID re-hash
//   integrity → envelope validation (envelope→format→version) → loader executes
//   with page authority → pulls the world config by CID.
// Same bytes + same algorithm as a mainnet boot; only the anchor source differs.

const GW = 'http://127.0.0.1:7789';

test('全链启动彩排:锚 → ROOT loader → 封套验证 → 执行 → 拉取世界配置', async ({ page, request }) => {
    test.setTimeout(60_000);

    // The seeded anchor resolves and carries the micro-format fields (§2).
    const { cid: anchorCid } = await (await request.get(`${GW}/v0/name/anchor:world`)).json();
    const anchor = await (await request.get(`${GW}/ipfs/${anchorCid}`)).json();
    expect(anchor.p).toBe('septopus');
    expect(anchor.cid).toMatch(/^bafk/);

    // Drive the shim in a real browser: the whole chain must complete.
    await page.goto(`${GW}/boot`);
    await expect(page.locator('#world')).toContainText('SEPTOPUS BOOT CHAIN OK', { timeout: 15_000 });

    // The shim's own step log shows integrity + envelope validation happened.
    const log = await page.locator('#log').textContent();
    expect(log).toContain('ROOT fetched + CID re-hash verified');
    expect(log).toContain('envelope OK: septopus.loader v1');

    // The loader (executed from CAS bytes) pulled the world config by CID.
    await expect(page.locator('#world')).toContainText('config: block=64');
    await page.screenshot({ path: 'test-results/boot-chain.png' });

    // Negative: a tampered anchor source (bogus name) must not boot.
    await page.goto(`${GW}/boot?name=nonexistent`);
    await expect(page.locator('#log')).toContainText('HALT', { timeout: 10_000 });
});
