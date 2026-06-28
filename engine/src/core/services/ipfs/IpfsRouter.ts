import { IpfsProvider } from './IpfsProvider';
import { cidForBytes } from './Cid';

/** Base64-encode bytes (data: URL fallback when there is no DOM). */
function toBase64(bytes: Uint8Array): string {
    if (typeof btoa === 'function') {
        let s = '';
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return btoa(s);
    }
    const B = (globalThis as any).Buffer;
    return B ? B.from(bytes).toString('base64') : '';
}

/**
 * IpfsRouter — content routing over an ordered list of providers. `get(cid)` asks
 * each provider in turn until one HAS the cid (miss → next), then verifies the
 * bytes hash back to the cid (content-addressed integrity). This is routing by
 * "who has it", NOT by the cid's string shape — so a cid is location-independent
 * and any provider can serve any content.
 *
 * Deliberately thin: ordered try + verify. No DHT / routing policy / bitswap /
 * pin / gc — adding those would be re-implementing IPFS (see spec §3, §9).
 */
export class IpfsRouter {
    private providers: IpfsProvider[];
    private urlCache = new Map<string, Promise<string>>();

    constructor(providers: IpfsProvider[] = []) {
        this.providers = [...providers];
    }

    /** Register another provider (e.g. a local gateway or real IPFS) at lowest priority. */
    addProvider(p: IpfsProvider): void {
        this.providers.push(p);
    }

    /** Bytes for a cid: first provider that has it, verified. Throws if none do. */
    async get(cid: string): Promise<Uint8Array> {
        for (const p of this.providers) {
            const bytes = await p.get(cid);
            if (!bytes) continue;
            const actual = await cidForBytes(bytes);
            if (actual !== cid) {
                throw new Error(`[ipfs] integrity: provider '${p.name}' returned bytes for ${cid} that hash to ${actual}`);
            }
            return bytes;
        }
        throw new Error(`[ipfs] no provider has ${cid}`);
    }

    /** Store content in the first writable provider; returns its cid. */
    async put(bytes: Uint8Array): Promise<string> {
        for (const p of this.providers) {
            if (p.put) return p.put(bytes);
        }
        throw new Error('[ipfs] no writable provider to put content');
    }

    /** Semantic alias for put — "add this content to the store, get its cid". */
    ingest(bytes: Uint8Array): Promise<string> {
        return this.put(bytes);
    }

    /**
     * Resolve a cid to a URL a loader can fetch: get bytes → blob: URL (cached
     * per cid). Falls back to a data: URL where createObjectURL is unavailable
     * (non-DOM). Transport stays hidden behind the cid — callers only ever pass
     * a cid, never a path.
     */
    toObjectUrl(cid: string): Promise<string> {
        let url = this.urlCache.get(cid);
        if (!url) {
            url = (async () => {
                const bytes = await this.get(cid);
                const make = globalThis.URL?.createObjectURL as ((b: Blob) => string) | undefined;
                if (make) return make(new Blob([bytes as unknown as BlobPart]));
                return `data:application/octet-stream;base64,${toBase64(bytes)}`;
            })();
            this.urlCache.set(cid, url);
        }
        return url;
    }
}
