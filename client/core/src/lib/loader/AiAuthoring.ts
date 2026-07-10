import type { Engine } from '@engine/Engine';
import { validateGenerationDoc, compileGenerationDoc } from '@engine/core/protocol/GenerationDoc';
import { Coords } from '@engine/core/utils/Coords';
import type { WorldContent } from './WorldContent';

/**
 * AiAuthoring — the AI-造物 preview/build flow (spec ai-authoring.md §4E-G),
 * extracted from DesktopLoader (2026-07 god-object split). Its dependency on the
 * content core is EXPLICIT: target picking must not clobber authored level
 * coords (content.authoredCoord), cancel restores the seed+draft merge
 * (content.blockAt), and previews keep the resident-window bookkeeping honest
 * (content.markLoaded).
 */
export class AiAuthoring {
    constructor(private engine: () => Engine | null, private content: WorldContent) {}

    /** The active AI proposal: compiled + injected as a PREVIEW (never touches
     *  the draft until aiBuild). Cancel restores the block's original content. */
    private aiPending: { block: [number, number]; raw: any[] } | null = null;

    /** Pick the AI build target: the nearest block (ring 0..3 around the
     *  player) with no authored scene, no draft and no pending preview. */
    public aiTargetBlock(): [number, number] | null {
        const w = this.engine()?.getWorld();
        if (!w) return null;
        const ids = w.getEntitiesWith(['TransformComponent', 'InputStateComponent']);
        const t = w.getComponent(ids[0], 'TransformComponent') as any;
        const { block } = Coords.engineToSeptopus([t.position[0], t.position[1], t.position[2]]);
        for (let r = 0; r <= 3; r++) {
            for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                const bx = block[0] + dx, by = block[1] + dy;
                if (this.content.authoredCoord(bx, by)) continue;             // authored level coord
                if (w.draftStore.load(0, bx, by)) continue;                   // player edits
                if (this.aiPending && this.aiPending.block[0] === bx && this.aiPending.block[1] === by) continue;
                return [bx, by];
            }
        }
        return null;
    }

    /** Compile a VALIDATED GenerationDoc and inject it as a runtime PREVIEW
     *  (replaces the block's streamed content; nothing persisted). */
    public aiPreview(doc: any): boolean {
        const engine = this.engine();
        if (!engine) return false;
        const errors = validateGenerationDoc(doc);
        if (errors.length) {                                                  // never trust the wire
            console.warn('[Loader] aiPreview rejected:', errors);
            return false;
        }
        if (this.aiPending) this.aiCancel();                                  // one proposal at a time
        const [bx, by] = doc.target.block;
        const raw = compileGenerationDoc(doc);
        engine.removeBlock(bx, by);
        engine.injectBlock({ x: bx, y: by, adjuncts: raw, elevation: raw[0] });
        this.content.markLoaded(bx, by);
        this.aiPending = { block: [bx, by], raw };
        return true;
    }

    /** Commit the previewed proposal: persist as a draft (same channel as the
     *  editor — reload-durable, exportable, publishable via publishBlock). */
    public aiBuild(): boolean {
        const engine = this.engine();
        if (!engine || !this.aiPending) return false;
        const { block: [bx, by], raw } = this.aiPending;
        engine.getWorld()!.draftStore.save(0, bx, by, raw);
        this.aiPending = null;
        console.log(`[Loader] AI build committed to block ${bx}_${by} (draft)`);
        return true;
    }

    /** Drop the preview and restore the block's original (seed+draft) content. */
    public aiCancel(): void {
        const engine = this.engine();
        if (!engine || !this.aiPending) return;
        const [bx, by] = this.aiPending.block;
        this.aiPending = null;
        engine.removeBlock(bx, by);
        const merged = this.content.blockAt(bx, by);
        if (merged) {
            engine.injectBlock({ x: bx, y: by, adjuncts: merged.raw, elevation: merged.raw[0] });
        }
    }
}
