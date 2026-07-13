/**
 * BtcClock — the REAL chain-height clock (opt-in via `VITE_BTC_CLOCK`).
 * Sibling of `EnvClock` (the offline mock ticker): same `feed(height, hash,
 * intervalSeconds)` seam into `Engine.feedChainState`, but the numbers come
 * from the actual Bitcoin chain instead of a synthetic counter.
 *
 * Convention (protocol/{cn,en}/world.md §3.1): **1 Bitcoin block = 1 Septopus
 * day.** Mechanically this is just `intervalSeconds = 86400` fed at the
 * engine's default `speed = 1.0` (GlobalConfig untouched) — no per-world time
 * config is required, and nothing here touches the shared engine default, so
 * worlds that stay on the mock `EnvClock` keep today's ~2-minute demo day
 * unaffected. (Bitcoin's own real cadence, ~600s/block by design — difficulty
 * retargeted every 2016 blocks to hold that average — is background colour for
 * WHY "1 block = 1 day" reads as a nice legible pace; it is not wired through
 * a separate `speed` multiplier, since folding it directly into `interval`
 * keeps the wire contract to the one number the protocol actually needs.)
 *
 * Bitcoin was chosen over re-coupling to Solana (the OLD app's chain, now
 * fully decoupled) because it's already this project's anchor chain for boot
 * versioning (protocol/{cn,en}/boot-chain.md's `{p,name,version,cid}` anchor)
 * — one external dependency, not two — and its hash is a public,
 * permissionless, hard-to-manipulate randomness source reachable from any
 * light client with no account/RPC-key setup.
 *
 * Polls two independent public Esplora-compatible explorers (no API key, CORS
 * open, `cache-control: public, max-age=10` on both) for the current tip
 * height + hash; the first that answers wins the round. Never blocks boot,
 * never throws: a poll failure just retries next tick — world time freezes
 * rather than the client crashing (same "unreachable → degrade, world
 * unaffected" posture as the IPFS gateway / ai-gateway fallbacks elsewhere in
 * this codebase). Real-network behavior is smoke-tested manually, not in CI —
 * e2e specs never depend on live third-party APIs (see helpers.ts / the mock
 * EnvClock used under Playwright).
 */
export type ChainFeed = (height: number, hash: string, intervalSeconds: number) => void;

export class BtcClock {
    /** 1 Bitcoin block = 1 Septopus day, at the engine's default speed=1.0. */
    static readonly BLOCK_INTERVAL_SECONDS = 86400;

    private static readonly GATEWAYS = [
        'https://mempool.space/api',
        'https://blockstream.info/api',
    ];
    /** Blocks arrive ~10 real minutes apart — no need to poll faster than this. */
    private static readonly POLL_MS = 60_000;
    private static readonly FETCH_TIMEOUT_MS = 8_000;

    private timer: ReturnType<typeof setInterval> | null = null;
    private lastHeight = -1;
    private healthy = true; // tracks state transitions so failures log once, not every tick

    constructor(private feed: ChainFeed) {}

    public start(): void {
        if (this.timer) return;
        const tick = () => { this.poll(); };
        tick(); // kick once so time starts advancing from boot, not after the first delay
        this.timer = setInterval(tick, BtcClock.POLL_MS);
    }

    private async poll(): Promise<void> {
        for (const base of BtcClock.GATEWAYS) {
            const tip = await BtcClock.fetchTip(base);
            if (!tip) continue;
            if (!this.healthy) { console.log('[BtcClock] gateway reachable again'); this.healthy = true; }
            if (tip.height !== this.lastHeight) {
                this.lastHeight = tip.height;
                this.feed(tip.height, tip.hash, BtcClock.BLOCK_INTERVAL_SECONDS);
            }
            return; // first gateway that answers wins this round
        }
        if (this.healthy) {
            console.warn('[BtcClock] all gateways unreachable — world time frozen until the next poll');
            this.healthy = false;
        }
    }

    /** One gateway round: tip height + hash, or null on any failure/malformed
     *  reply. Exported logic shape (not just inline) so it stays easy to
     *  eyeball-verify against a real curl response. */
    static async fetchTip(base: string): Promise<{ height: number; hash: string } | null> {
        try {
            const [heightText, hashText] = await Promise.all([
                BtcClock.fetchText(`${base}/blocks/tip/height`),
                BtcClock.fetchText(`${base}/blocks/tip/hash`),
            ]);
            const height = parseInt(heightText.trim(), 10);
            const hash = hashText.trim().toLowerCase();
            // Real Bitcoin block hashes are exactly 64 hex chars; the protocol
            // wants a 0x-prefixed hex string (world.md §3.1).
            if (!Number.isFinite(height) || height <= 0 || !/^[0-9a-f]{64}$/.test(hash)) return null;
            return { height, hash: '0x' + hash };
        } catch {
            return null;
        }
    }

    private static async fetchText(url: string): Promise<string> {
        const res = await fetch(url, { signal: AbortSignal.timeout(BtcClock.FETCH_TIMEOUT_MS) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
    }
}
