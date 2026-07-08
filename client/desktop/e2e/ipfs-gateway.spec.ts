import { test, expect } from '@playwright/test';
import { waitForWorldReady } from './helpers';

// The content NETWORK tier (services/ipfs): a file-CAS gateway whose CIDs are
// computed by the SAME engine Cid.ts. The client quiet-probes it at boot and
// registers HttpCasProvider into the world's IpfsRouter at lowest priority —
// in-process CAS stays tier-1 (offline-first), misses fall through to HTTP,
// and the router integrity-checks every fetched blob by re-hashing.
//
// This drives the REAL cross-process chain: gateway seed (fs bytes) → name →
// CID → router.get in the browser → HTTP fetch → re-hash equals CID.

const GW = 'http://127.0.0.1:7789';

test('IPFS 网关:探测挂载 → 名字→CID → 跨进程取回 → 引擎侧完整性校验通过', async ({ page, request }) => {
    test.setTimeout(120_000);

    // Gateway is up (playwright webServer) and seeded with the shared content tree.
    const health = await (await request.get(`${GW}/v0/health`)).json();
    expect(health.ok).toBe(true);
    expect(health.names).toBeGreaterThanOrEqual(10);

    // Resolve a seeded name → CID (the garden stylepack JSON).
    const { cid } = await (await request.get(`${GW}/v0/name/stylepack:garden`)).json();
    expect(cid).toMatch(/^bafy[a-z2-7]{20,}$/);

    // Boot the real client; the loader's quiet probe must have added the tier.
    await page.goto('/');
    await waitForWorldReady(page);
    const tiers = await page.evaluate(() =>
        ((window as any).loader.engine.getWorld().ipfs as any).providers.map((p: any) => p.name));
    expect(tiers.some((n: string) => n.startsWith('http-cas')), `router tiers: ${tiers}`).toBe(true);

    // Cross-process fetch THROUGH the router: memory tier misses this CID (the
    // bundled stylepack was never put() as bytes), so the HTTP tier serves it and
    // the router re-hashes — a mismatch would throw. Bytes must parse back to
    // the garden pack.
    const fetched = await page.evaluate(async (cid: string) => {
        const bytes = await (window as any).loader.engine.getWorld().ipfs.get(cid);
        return { len: bytes.length, id: JSON.parse(new TextDecoder().decode(bytes)).id };
    }, cid);
    expect(fetched.len).toBeGreaterThan(100);
    expect(fetched.id).toBe('garden');

    // A bogus CID misses every tier → the router throws (no silent garbage).
    const missed = await page.evaluate(async () => {
        try {
            await (window as any).loader.engine.getWorld().ipfs.get('bafy' + 'x'.repeat(52));
            return 'returned';
        } catch { return 'threw'; }
    });
    expect(missed).toBe('threw');

    // Write path: put() bytes from the browser through the registered provider
    // → gateway stores them under the same CID scheme → read back verbatim.
    const put = await page.evaluate(async () => {
        const router = (window as any).loader.engine.getWorld().ipfs as any;
        const http = router.providers.find((p: any) => p.name.startsWith('http-cas'));
        const bytes = new TextEncoder().encode('septopus-ipfs-e2e-fixed');
        const cid = await http.put(bytes);
        const back = await http.get(cid);
        return { cid, echoed: new TextDecoder().decode(back) };
    });
    expect(put.cid).toMatch(/^bafy/);
    expect(put.echoed).toBe('septopus-ipfs-e2e-fixed');
});
