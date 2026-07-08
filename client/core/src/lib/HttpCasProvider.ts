import type { IpfsProvider } from '@engine/core/services/ipfs/IpfsProvider';

/**
 * HttpCasProvider — the NETWORK tier of the content stack: a read/write
 * IpfsProvider over the dev IPFS gateway (services/ipfs, port 7789), or any
 * real IPFS gateway with the same route shape. Registered into the world's
 * IpfsRouter at LOWEST priority (router.addProvider), so the in-process
 * MemoryCasProvider stays the local node/cache (local-first, offline PWA
 * fallback) and only MISSES fall through to the network — exactly a real
 * IPFS node+gateway shape. The router integrity-checks every get() by
 * re-hashing (both sides share the engine Cid.ts algorithm, zero drift).
 */
export class HttpCasProvider implements IpfsProvider {
    public readonly name: string;
    /** `writable=false` = a REAL public IPFS gateway (ipfs.io / dweb.link / a
     *  pinning service's gateway): read-only, standard `/ipfs/<cid>` path. Our
     *  CIDs are real CIDv1(raw, sha2-256) — engine Cid.ts, verified against the
     *  multiformats reference — so content pinned there resolves verbatim and
     *  the router's re-hash integrity check holds across ANY gateway. */
    constructor(private readonly base: string, writable = true) {
        this.name = `http-cas(${base})`;
        if (!writable) (this as any).put = undefined; // read-only tier: router skips it for writes
    }

    /** Quiet reachability probe (short timeout) — callers add the provider only
     *  when the gateway is actually up, so an absent service costs nothing. */
    static async probe(base: string, timeoutMs = 800): Promise<boolean> {
        try {
            const res = await fetch(`${base}/v0/health`, { signal: AbortSignal.timeout(timeoutMs) });
            return res.ok && (await res.json())?.ok === true;
        } catch { return false; }
    }

    async get(cid: string): Promise<Uint8Array | null> {
        try {
            const res = await fetch(`${this.base}/ipfs/${encodeURIComponent(cid)}`);
            if (!res.ok) return null;                       // miss → router falls through
            return new Uint8Array(await res.arrayBuffer());
        } catch { return null; }                             // network error = miss, never throw
    }

    async put(bytes: Uint8Array): Promise<string> {
        const res = await fetch(`${this.base}/v0/add`, { method: 'POST', body: bytes as any });
        if (!res.ok) throw new Error(`[http-cas] add failed: ${res.status}`);
        return (await res.json()).cid as string;
    }

    /** Name → CID via the gateway's name index (the network ContentResolver seam). */
    async resolveName(name: string): Promise<string | null> {
        try {
            const res = await fetch(`${this.base}/v0/name/${encodeURIComponent(name)}`);
            if (!res.ok) return null;
            return (await res.json()).cid ?? null;
        } catch { return null; }
    }
}
