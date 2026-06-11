/**
 * ExportService — JSON export/import of a world's local drafts (P1).
 *
 * Export and on-chain publish are the SAME serialization seam: this `.json`
 * format carries the block raw arrays verbatim (what CollapseCodec.encode will
 * consume for the P4 SPP-binary flavor). Round-trip: share a world, restore a
 * backup, or feed drafts to a publisher.
 */
import { BlockDraft, DraftStore } from './DraftStore';

export const EXPORT_FORMAT = 'septopus.world.drafts';
export const EXPORT_VERSION = 1 as const;

export interface WorldExportFile {
    format: typeof EXPORT_FORMAT;
    version: typeof EXPORT_VERSION;
    worldId: number;
    exportedAt: number;
    drafts: BlockDraft[];
}

export class ExportService {
    constructor(private store: DraftStore) {}

    /** Serialize every draft of a world. Flushes write-behind first so the file
     *  can never miss an edit that is still in memory. */
    public async exportWorld(worldId: number): Promise<string> {
        await this.store.flush();
        const file: WorldExportFile = {
            format: EXPORT_FORMAT,
            version: EXPORT_VERSION,
            worldId,
            exportedAt: Date.now(),
            drafts: this.store.list(worldId),
        };
        return JSON.stringify(file, null, 2);
    }

    /**
     * Validate and import an export file: drafts land in the store (cache +
     * write-behind) with their original timestamps. Returns the import count.
     * Existing drafts for the same blocks are overwritten (file wins) — callers
     * wanting merge semantics can filter beforehand.
     */
    public async importWorld(json: string): Promise<{ worldId: number; imported: number }> {
        let file: WorldExportFile;
        try {
            file = JSON.parse(json);
        } catch {
            throw new Error('[ExportService] not valid JSON');
        }
        if (file?.format !== EXPORT_FORMAT) {
            throw new Error(`[ExportService] unrecognized format: ${String(file?.format)}`);
        }
        if (file.version !== EXPORT_VERSION) {
            throw new Error(`[ExportService] unsupported version: ${String(file.version)}`);
        }
        if (!Array.isArray(file.drafts)) {
            throw new Error('[ExportService] drafts is not an array');
        }

        let imported = 0;
        for (const d of file.drafts) {
            if (!d || typeof d.blockKey !== 'string' || !Array.isArray(d.raw)) continue; // skip corrupt rows
            this.store.put({
                version: 1,
                timestamp: d.timestamp ?? Date.now(),
                worldId: d.worldId ?? file.worldId,
                blockKey: d.blockKey,
                raw: d.raw,
            });
            imported++;
        }
        await this.store.flush();
        return { worldId: file.worldId, imported };
    }
}
