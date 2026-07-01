import { IpfsRouter } from './ipfs';
import {
    BlockRaw,
    canonicalBlockBytes,
    normalizeBlockRaw,
    validateBlockRaw,
} from '../protocol/BlockRaw';

/**
 * BlockCas — block CONTENT over the content-addressed store (第二期, spec
 * docs/plan/specs/mock-ipfs-block.md). The block-content counterpart to how
 * ResourceManager routes resource CIDs through the same IpfsRouter: a block's
 * authored raw is ingested into the CAS and later read back by its CID.
 *
 * A block's CID is `hash(canonicalBlockBytes(raw))`, so the SAME logical block
 * always lands at the SAME CID (dedup) and round-trips stably (第一期 guarantees
 * the canonical bytes). Coordinates are NOT part of the content — the coord→CID
 * mapping is a separate world manifest (LocalDataSource), so one authored block
 * can be reused at many coordinates.
 *
 * Write vs read asymmetry (mirrors IpfsRouter.get verifying the content hash):
 *   - put() NORMALIZES trusted, locally-authored content into canonical bytes.
 *   - get() VALIDATES on read-back — the CAS could, for a real IPFS provider,
 *     return corrupt/tampered bytes; the router already checks the hash, and
 *     validateBlockRaw is the structural gate on top.
 *
 * Pure core: no Three.js, no World import.
 */
export class BlockCas {
    constructor(private readonly ipfs: IpfsRouter) {}

    /**
     * Ingest an authored block into the CAS → its content id (CID). Idempotent
     * and deduped: same canonical block → same CID → stored once.
     */
    async put(raw: any): Promise<string> {
        return this.ipfs.put(canonicalBlockBytes(raw));
    }

    /**
     * Read a block back by CID → canonical BlockRaw. Throws ResourceError (no
     * provider has it) via the router, or ProtocolError if the stored bytes are
     * not a structurally valid block.
     */
    async get(cid: string): Promise<BlockRaw> {
        const bytes = await this.ipfs.get(cid);
        const parsed = JSON.parse(new TextDecoder().decode(bytes));
        validateBlockRaw(parsed);
        return normalizeBlockRaw(parsed);
    }
}
