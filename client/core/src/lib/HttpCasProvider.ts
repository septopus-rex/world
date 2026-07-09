import type { IpfsProvider } from '@engine/core/services/ipfs/IpfsProvider';
import { HttpChannel } from '../net/HttpChannel';

/**
 * HttpCasProvider — the NETWORK tier of the content stack: a read/write
 * IpfsProvider over the dev IPFS gateway (services/ipfs, port 7789), or any
 * real IPFS gateway with the same route shape. Registered into the world's
 * IpfsRouter at LOWEST priority (router.addProvider), so the in-process
 * MemoryCasProvider stays the local node/cache (local-first, offline PWA
 * fallback) and only MISSES fall through to the network — exactly a real
 * IPFS node+gateway shape. The router integrity-checks every get() by
 * re-hashing (both sides share the engine Cid.ts algorithm, zero drift).
 *
 * Transport rides a net/HttpChannel (probe/timeout/status policy lives THERE;
 * this class is only the IpfsProvider adaptation over it).
 */
export class HttpCasProvider implements IpfsProvider {
    public readonly name: string;
    private readonly channel: HttpChannel;

    /** `writable=false` = a REAL public IPFS gateway (ipfs.io / dweb.link / a
     *  pinning service's gateway): read-only, standard `/ipfs/<cid>` path. Our
     *  CIDs are real CIDv1(raw, sha2-256) — engine Cid.ts, verified against the
     *  multiformats reference — so content pinned there resolves verbatim and
     *  the router's re-hash integrity check holds across ANY gateway. */
    constructor(channel: HttpChannel | string, writable = true) {
        this.channel = typeof channel === 'string' ? new HttpChannel(channel) : channel;
        this.name = `http-cas(${this.channel.base})`;
        if (!writable) (this as any).put = undefined; // read-only tier: router skips it for writes
    }

    /** Quiet reachability probe — delegates to the channel's cached probe. */
    static async probe(channel: HttpChannel, timeoutMs = 800): Promise<boolean> {
        return channel.probe(timeoutMs);
    }

    /** Bytes by CID, or null on any miss/failure — the router falls through. */
    async get(cid: string): Promise<Uint8Array | null> {
        return this.channel.getBytes(`/ipfs/${encodeURIComponent(cid)}`);
    }

    async put(bytes: Uint8Array): Promise<string> {
        const data = await this.channel.postBytes('/v0/add', bytes);
        if (!data?.cid) throw new Error(`[http-cas] add failed on ${this.channel.base}`);
        return data.cid as string;
    }

    /** Name → CID via the gateway's name index (the network ContentResolver seam). */
    async resolveName(name: string): Promise<string | null> {
        try {
            return (await this.channel.getJson(`/v0/name/${encodeURIComponent(name)}`))?.cid ?? null;
        } catch { return null; }
    }
}
