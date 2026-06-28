import { IpfsProvider } from './IpfsProvider';
import { cidForBytes } from './Cid';

/**
 * MemoryCasProvider — a writable, in-process content-addressed store (Map of
 * CID → bytes). The default "mock IPFS" provider: keeps the PWA backend-less
 * while making every resource content-addressed. Swappable later for a local
 * gateway or real IPFS without touching call sites (same CID + get/put contract).
 */
export class MemoryCasProvider implements IpfsProvider {
    readonly name = 'memory-cas';
    private store = new Map<string, Uint8Array>();

    async get(cid: string): Promise<Uint8Array | null> {
        return this.store.get(cid) ?? null;
    }

    async put(bytes: Uint8Array): Promise<string> {
        const cid = await cidForBytes(bytes);
        if (!this.store.has(cid)) this.store.set(cid, bytes);
        return cid;
    }

    /** Diagnostics: number of distinct blobs held. */
    size(): number { return this.store.size; }
}
