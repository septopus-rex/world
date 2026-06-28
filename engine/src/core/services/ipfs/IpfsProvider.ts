/**
 * IpfsProvider — a source that can serve (and optionally store) content by CID.
 * The whole resource backend is a list of these behind an IpfsRouter: mock CAS,
 * a local gateway, real IPFS/OSS — each is one provider.
 *
 * Two operations, by design (see specs/mock-ipfs-resource.md):
 *   - READ is universal: every provider implements `get`.
 *   - WRITE is a capability: only writable providers (CAS / pinning) implement
 *     `put`; read-only gateways omit it.
 * `get` returns null on MISS so the router can fall through to the next provider
 * — which is why no separate `has(cid)` is needed.
 */
export interface IpfsProvider {
    /** Human-readable id for diagnostics / integrity errors. */
    readonly name: string;
    /** Bytes for a CID, or null if this provider does not have it (miss). */
    get(cid: string): Promise<Uint8Array | null>;
    /** Optional (writable providers only): store bytes, return their CID. */
    put?(bytes: Uint8Array): Promise<string>;
}
