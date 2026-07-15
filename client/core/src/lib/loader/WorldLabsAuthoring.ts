import type { Engine } from '@engine/Engine';
import { EditTaskExecutor } from '@engine/core/EditTaskExecutor';
import { AdjunctType } from '@engine/core/types/AdjunctType';
import type { EditTask } from '@engine/core/types/EditTask';
import type { ServiceHub } from '../../net/ServiceHub';

/**
 * WorldLabsAuthoring — the "AI-generated 3D world" demo (gallery exhibit ㉑,
 * `client/core/src/levels/gallery.level.json` block [2000,1020]). Mirrors
 * AiAuthoring's split-out-collaborator shape, but there is no GenerationDoc to
 * compile here: the external service (services/worldlabs, a thin gateway over
 * World Labs' Marble World API — docs.worldlabs.ai/api) returns a plain URL to
 * a Gaussian-splat file, which becomes the `resource` of a single a4 module
 * adjunct via `ResourceManager.getModel`'s direct-URL bypass (no static
 * manifest entry needed — see ResourceManager.ts).
 *
 * Session-only: the pedestal it creates is a live ECS entity via
 * EditTaskExecutor's 'add'/'set' actions — same mechanism as the palette editor
 * — never a draft, never persisted. A reload puts the exhibit back to its
 * authored default (the synthetic test splat).
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
    /** Set once placeResult() has swapped the pedestal to this result. */
    placed?: boolean;
}

export class WorldLabsAuthoring {
    constructor(private engine: () => Engine | null, private net: ServiceHub) { }

    private readonly executor = new EditTaskExecutor();
    /** The live pedestal entity, once created (see ensureSlot). */
    private slotEntityId: number | null = null;

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
            result.placed = this.placeResult(result.splatUrl);
        }
        return result;
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
    private ensureSlot(): number | null {
        const w: any = this.engine()?.getWorld();
        if (!w) return null;
        if (this.slotEntityId != null && w.getComponent(this.slotEntityId, 'AdjunctComponent')) {
            return this.slotEntityId;
        }

        const blockEid = w.getEntitiesWith(['BlockComponent']).find((eid: any) => {
            const b = w.getComponent(eid, 'BlockComponent');
            return b?.x === EXHIBIT_BLOCK[0] && b?.y === EXHIBIT_BLOCK[1];
        });
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
     * Swap the pedestal's resource to a freshly-generated splat URL. Public —
     * pollAndPlace calls it as soon as a job completes, but placement can also
     * fail there because the exhibit block isn't loaded yet (the player is
     * elsewhere — a real generation takes ~5 minutes, plenty of time to wander
     * off). The panel keeps the last splatUrl and can call this again once the
     * player has walked over.
     */
    public placeResult(url: string): boolean {
        const w = this.engine()?.getWorld();
        const eid = this.ensureSlot();
        if (!w || eid == null) return false;
        const result = this.executor.execute(w, {
            entityId: eid, adjunct: 'module', action: 'set', param: { resource: url },
        });
        return result.success;
    }

    /** Where the demo pedestal lives, for the panel to point the player at. */
    public exhibitBlock(): [number, number] { return EXHIBIT_BLOCK; }
}
