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
 * Synchronous on purpose: drafts live in DraftStore's in-memory write-behind
 * cache (hydrated at boot) and the built-in scene providers are pure generators,
 * so there is no I/O on the block hot path. A future networked/chain source can
 * make this async without changing the seam's shape.
 */
import { DraftStore } from './DraftStore';

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
}

export class LocalDataSource {
    constructor(
        private readonly scene: SceneProvider,
        private readonly drafts: DraftStore,
        private readonly worldIndex: number = 0,
    ) {}

    /** Effective content for one block: local draft if present, else the seed. */
    public blockAt(x: number, y: number): MergedBlock {
        const draft = this.drafts.load(this.worldIndex, x, y);
        if (draft) return { x, y, raw: draft.raw, isDraft: true };
        return { x, y, raw: this.scene.block(x, y), isDraft: false };
    }

    /**
     * A square (2*ext+1)² neighbourhood window centred on (cx,cy) — the streaming
     * view the loader injects (and evicts the complement of). Wires the previously
     * dead `IDataSource.view()` seam.
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
}
