/**
 * LocalDataSource — the single block-data seam that unifies the world's *base*
 * content sources (mock / parkour / coaster / demo) behind one provider and
 * overlays local edits on top.
 *
 * Before this, the client dispatched three base generators inline (an if/else
 * chain in DesktopLoader.fetchBlock) and the `IDataSource.view()` seam was dead
 * code. This converges them:
 *
 *   SceneProvider.block(x,y)  →  seed (authored/procedural) raw for one block
 *   DraftStore                →  the player's local edits (IndexedDB-backed)
 *   LocalDataSource           →  effective block = draft overlay OVER the seed
 *
 * The seed side is pluggable (one SceneProvider per scene: normal/parkour/…);
 * the draft side is the existing write-behind store. `view()` returns the
 * streaming neighbourhood window the loader injects.
 *
 * Layering note — the draft overlay is applied HERE *and* (independently) in
 * `BlockSystem` on inject. That is deliberate, not redundant duplication:
 *   • BlockSystem's overlay is an ENGINE invariant — "inject a block and a draft
 *     exists → the draft wins" — guarded by draft-store.test and honoured for
 *     ANY injector (tests, future callers), not just this data source.
 *   • LocalDataSource's overlay is the DATA-SOURCE contract — `view()` must
 *     return effective (edited) blocks, since that is what "read the world here"
 *     means once the player has local edits.
 * The two are consistent by construction (both return `draft.raw ?? seed`), so
 * the loader injecting an already-merged block is idempotent through BlockSystem.
 *
 * Synchronous on the streaming hot path (第二/三期): drafts live in DraftStore's
 * in-memory write-behind cache and the built-in scene providers are pure
 * generators, so `blockAt/view` serve the canonical raw with NO I/O — block
 * streaming stays a tight synchronous pass (deferring the per-block injectBlock
 * behind an await would batch it into one post-frame burst → a stall).
 *
 * Content-addressing is an EXPLICIT, off-hot-path operation: `publish(x,y)`
 * ingests a block into the content-addressed store (BlockCas) → its CID. That is
 * the 第三期「发布块到 CAS」seam — how an authored/edited block becomes
 * content-addressed and shareable. Eagerly routing every code-generated mock
 * SEED through the CAS buys nothing (the seed is already in hand) and only adds
 * cost; that routing belongs when seeds are themselves real CAS content, at
 * which point `blockAt` becomes async (the `Promise`-shaped `view()` seam and
 * BlockCas.get are already in place for it).
 */
import { DraftStore } from './DraftStore';
import { BlockCas } from './BlockCas';
import { normalizeBlockRaw } from '../protocol/BlockRaw';

/** Full block raw: `[elevation, status, adjunctsRaw, animations, game?]`. */
export type BlockRaw = any[];

/** The seed (base) content layer — one implementation per scene. */
export interface SceneProvider {
    /** Authored / procedural raw for a block, BEFORE local drafts are applied. */
    block(x: number, y: number): BlockRaw;
}

/** An effective block: the seed with any local draft overlaid. */
export interface MergedBlock {
    x: number;
    y: number;
    raw: BlockRaw;
    /** True when a local draft replaced the seed (mirrors BlockComponent.isDraft). */
    isDraft: boolean;
    /** Content id of the seed in the CAS (present only for non-draft blocks routed
     *  through BlockCas). The coord→cid entry of the world manifest. */
    cid?: string;
}

export class LocalDataSource {
    /**
     * The authored world manifest: coord "x_y" → block CID, populated by publish().
     * This is the "world = coord → blockId" index kept apart from block content
     * (coords are not in the CID); today it records local publishes, tomorrow it
     * can be a fetched manifest that drives reads without changing the seam.
     */
    private readonly manifest = new Map<string, string>();

    constructor(
        private readonly scene: SceneProvider,
        private readonly drafts: DraftStore,
        private readonly worldIndex: number = 0,
        /** When present, non-draft seeds are routed through the content-addressed
         *  store (第二/三期). When absent, seeds are served directly (normalized). */
        private readonly cas?: BlockCas,
    ) {}

    /** Effective content for one block: local draft if present, else the canonical
     *  seed. Synchronous — the streaming hot path does no I/O. */
    public blockAt(x: number, y: number): MergedBlock {
        const draft = this.drafts.load(this.worldIndex, x, y);
        // Draft overlay is local mutable state — served as-is (the editor "publish"
        // action is the deliberate path into the CAS).
        if (draft) return { x, y, raw: draft.raw, isDraft: true, cid: this.manifest.get(`${x}_${y}`) };
        return { x, y, raw: normalizeBlockRaw(this.scene.block(x, y)), isDraft: false, cid: this.manifest.get(`${x}_${y}`) };
    }

    /**
     * A square (2*ext+1)² neighbourhood window centred on (cx,cy) — the streaming
     * view the loader injects (and evicts the complement of).
     */
    public view(cx: number, cy: number, ext: number): MergedBlock[] {
        const out: MergedBlock[] = [];
        for (let dx = -ext; dx <= ext; dx++) {
            for (let dy = -ext; dy <= ext; dy++) {
                out.push(this.blockAt(cx + dx, cy + dy));
            }
        }
        return out;
    }

    /**
     * Publish the CURRENT effective block (draft edits included) to the CAS →
     * its CID (第三期「发布块到 CAS」primitive). Returns null when no CAS is wired.
     * This is how a locally-authored/edited block becomes content-addressed and
     * shareable; DraftStore stays the local working copy. Records coord→cid in the
     * world manifest.
     */
    public async publish(x: number, y: number): Promise<string | null> {
        if (!this.cas) return null;
        const cid = await this.cas.put(this.blockAt(x, y).raw);
        this.manifest.set(`${x}_${y}`, cid);
        return cid;
    }

    /** The manifest CID for a coord, if it has been published. */
    public cidOf(x: number, y: number): string | undefined {
        return this.manifest.get(`${x}_${y}`);
    }
}
