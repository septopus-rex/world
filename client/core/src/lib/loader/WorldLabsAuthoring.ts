import type { Engine } from '@engine/Engine';
import { EditTaskExecutor } from '@engine/core/EditTaskExecutor';
import { AdjunctType } from '@engine/core/types/AdjunctType';
import type { EditTask } from '@engine/core/types/EditTask';
import { saveBlockDraft } from '@engine/core/utils/BlockSerializer';
import type { ServiceHub } from '../../net/ServiceHub';

/**
 * WorldLabsAuthoring — the "AI-generated 3D world" demo (gallery exhibit ㉑,
 * `client/core/src/levels/gallery.level.json` block [2000,1020]). Mirrors
 * AiAuthoring's split-out-collaborator shape, but there is no GenerationDoc to
 * compile here: the external service (services/worldlabs, a thin gateway over
 * World Labs' Marble World API — docs.worldlabs.ai/api) returns a Gaussian-
 * splat file, which becomes the `resource` of a single a4 module adjunct.
 *
 * Placement prefers CONTENT-ADDRESSED form: the service ingests the finished
 * splat into the CAS gateway (services/ipfs) and returns its CID alongside the
 * URL, and the pedestal's resource becomes `<cid>.<ext>` — bytes route through
 * the world's IpfsRouter, so the reference is durable data, not a pointer into
 * one dev process's disk. When no CID came back (gateway down) placement falls
 * back to the direct URL — visible now, but session-only.
 *
 * Persistence mirrors AiAuthoring's preview→build split: placement itself is a
 * live ECS entity (EditTaskExecutor 'add'/'set', same mechanism as the palette
 * editor — nothing saved), and an explicit saveToWorld() serializes the exhibit
 * block into the DraftStore (saveBlockDraft — the editor's own choke point), so
 * the generated world survives reload like any player edit. Save is only
 * offered for CID-form placements: a draft row pointing at a mutable localhost
 * URL would rot.
 */

/** The gallery exhibit this demo lives in (see levels/gallery.level.json). */
const EXHIBIT_BLOCK: [number, number] = [2000, 1020];
/** A clear corner of the exhibit's 16×16 floor — away from the sign (8,3) and
 *  the two existing test-splat placements (8,8 / 12.5,13). */
const SLOT_POS: [number, number, number] = [3, 3, 1.3];
/** The existing synthetic test splat (id 39, demo.manifest.json) — shown on
 *  the pedestal until the player generates something of their own. */
const PLACEHOLDER_RESOURCE = 39;

export interface WorldLabsJobResult {
    done: boolean;
    status?: string;
    error?: string;
    splatUrl?: string;
    thumbnailUrl?: string;
    /** CID of the splat bytes in the CAS gateway (absent = gateway was down —
     *  placement still works via splatUrl but cannot be persisted). */
    cid?: string;
    /** The resource string actually placed: `<cid>.<ext>` when cid is present,
     *  else the absolute splatUrl. */
    resource?: string;
    /** Set once placeResult() has swapped the pedestal to this result. */
    placed?: boolean;
}

export class WorldLabsAuthoring {
    constructor(private engine: () => Engine | null, private net: ServiceHub) { }

    private readonly executor = new EditTaskExecutor();
    /** The live pedestal entity, once created (see ensureSlot). */
    private slotEntityId: number | null = null;
    /** The last generated resource string (`<cid>.<ext>` or absolute URL) —
     *  kept so the panel can retry placement / save without re-threading it. */
    private lastResource: string | null = null;
    /** Whether lastResource is content-addressed (CID-form) — the save gate. */
    private lastIsCid = false;

    /** Start a generation job. Returns the opaque job id to poll, or an error. */
    public async generate(prompt: string): Promise<{ jobId?: string; error?: string }> {
        try {
            const { ok, status, data } = await this.net.http('worldlabs').postJsonFull(
                '/v0/generate', { prompt }, { timeoutMs: 10_000 },
            );
            if (!ok || data?.error) return { error: String(data?.error ?? status) };
            return { jobId: data.jobId };
        } catch (e: any) {
            return { error: e?.message ?? String(e) };
        }
    }

    /** Poll a job; once done with a splat URL, place it on the exhibit pedestal. */
    public async pollAndPlace(jobId: string): Promise<WorldLabsJobResult> {
        let result: WorldLabsJobResult;
        try {
            result = await this.net.http('worldlabs').getJson(`/v0/jobs/${jobId}`, { timeoutMs: 10_000 });
        } catch (e: any) {
            return { done: true, error: e?.message ?? String(e) };
        }
        if (result.done && result.splatUrl && !result.error) {
            // The service returns a path relative to ITSELF (e.g.
            // /assets/generated/<id>.spz) — resolve it to an absolute URL before
            // treating it as a resource id: ResourceManager.getModel's direct-
            // locator bypass only recognizes http(s)/data/blob/file schemes, a
            // bare path would otherwise be (mis)treated as a numeric id lookup.
            result.splatUrl = this.absoluteUrl(result.splatUrl);
            // Content-addressed when possible: `<cid>.<ext>` fetches the SAME
            // bytes through the world's CAS router and is the only form worth
            // persisting. The extension rides along because a model loader must
            // know its format up front (ResourceManager.getModel).
            const ext = result.splatUrl.split(/[?#]/)[0].split('.').pop()?.toLowerCase();
            this.lastIsCid = !!result.cid && !!ext;
            this.lastResource = this.lastIsCid ? `${result.cid}.${ext}` : result.splatUrl;
            result.resource = this.lastResource;
            result.placed = this.placeResult();
        }
        return result;
    }

    /**
     * Persist the placed generation: serialize the exhibit block's live entities
     * into the DraftStore (the editor's own save path), so the pedestal — and
     * its `<cid>.<ext>` module row — survives reload like any player edit. On
     * the next boot the draft overlays the authored block and the bytes resolve
     * through the CAS network tier.
     */
    public saveToWorld(): { ok: boolean; reason?: string } {
        if (!this.lastResource) return { ok: false, reason: 'nothing-generated' };
        if (!this.lastIsCid) return { ok: false, reason: 'no-cid' };
        const w = this.engine()?.getWorld();
        if (!w) return { ok: false, reason: 'no-world' };
        if (!this.placeResult()) return { ok: false, reason: 'block-not-loaded' };
        const blockEid = this.exhibitBlockEntity(w);
        if (blockEid == null) return { ok: false, reason: 'block-not-loaded' };
        return saveBlockDraft(w, blockEid)
            ? { ok: true }
            : { ok: false, reason: 'serialize-failed' };
    }

    /** Resolve a service-relative path against the worldlabs channel's base URL. */
    private absoluteUrl(url: string): string {
        if (/^(https?:|data:|blob:|file:)/.test(url)) return url;
        return this.net.http('worldlabs').base + url;
    }

    /**
     * Ensure the demo pedestal exists in the gallery exhibit's LIVE block (a
     * fresh a4 module entity, defaulting to the placeholder splat) — idempotent,
     * safe to call every time the panel is opened. Returns null if the exhibit
     * block isn't currently loaded (the player is elsewhere in the world).
     */
    /** The exhibit block's live entity, or null while it isn't streamed in. */
    private exhibitBlockEntity(w: any): number | null {
        const eid = w.getEntitiesWith(['BlockComponent']).find((eid: any) => {
            const b = w.getComponent(eid, 'BlockComponent');
            return b?.x === EXHIBIT_BLOCK[0] && b?.y === EXHIBIT_BLOCK[1];
        });
        return eid ?? null;
    }

    private ensureSlot(): number | null {
        const w: any = this.engine()?.getWorld();
        if (!w) return null;
        if (this.slotEntityId != null && w.getComponent(this.slotEntityId, 'AdjunctComponent')) {
            return this.slotEntityId;
        }

        const blockEid = this.exhibitBlockEntity(w);
        if (blockEid == null) return null; // exhibit not streamed in right now

        const raw = [[1.2, 1.2, 1.2], SLOT_POS, [0, 0, 0], PLACEHOLDER_RESOURCE, 0, 0];
        const task: EditTask = {
            entityId: 0, adjunct: 'module', action: 'add',
            param: { typeId: AdjunctType.Module, blockEntityId: blockEid, raw },
        };
        const result = this.executor.execute(w, task);
        if (!result.success) return null;
        this.slotEntityId = task.entityId; // executeAdd rewrites this in place
        return this.slotEntityId;
    }

    /**
     * Swap the pedestal's resource to the freshly-generated splat. Public —
     * pollAndPlace calls it as soon as a job completes, but placement can also
     * fail there because the exhibit block isn't loaded yet (the player is
     * elsewhere — a real generation takes ~5 minutes, plenty of time to wander
     * off). This class keeps the last resource, so the panel can call again
     * (no argument) once the player has walked over; an explicit argument
     * (legacy direct-URL path) still wins.
     */
    public placeResult(resource?: string): boolean {
        const res = resource ?? this.lastResource;
        if (!res) return false;
        const w = this.engine()?.getWorld();
        const eid = this.ensureSlot();
        if (!w || eid == null) return false;
        const result = this.executor.execute(w, {
            entityId: eid, adjunct: 'module', action: 'set', param: { resource: res },
        });
        return result.success;
    }

    /** Where the demo pedestal lives, for the panel to point the player at. */
    public exhibitBlock(): [number, number] { return EXHIBIT_BLOCK; }
}
