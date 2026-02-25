/**
 * DraftStorage
 * Manages localStorage-based draft persistence for edited blocks.
 * 
 * Key format: sept:draft:{worldId}:{blockX}_{blockY}
 * 
 * Multiple blocks can have unsaved drafts simultaneously.
 * Each draft is independent and identified by world + block coordinates.
 */

export interface BlockDraft {
    version: 1;
    timestamp: number;
    worldId: number;
    blockKey: string;           // "3_5"
    raw: any[];                 // full block raw: [elevation, status, adjunctsRaw, animations]
}

const DRAFT_PREFIX = 'sept:draft';

export class DraftStorage {
    private static key(worldId: number, bx: number, by: number): string {
        return `${DRAFT_PREFIX}:${worldId}:${bx}_${by}`;
    }

    /**
     * Save a draft for a specific block.
     */
    public save(worldId: number, bx: number, by: number, raw: any[]): void {
        const draft: BlockDraft = {
            version: 1,
            timestamp: Date.now(),
            worldId,
            blockKey: `${bx}_${by}`,
            raw
        };
        try {
            localStorage.setItem(DraftStorage.key(worldId, bx, by), JSON.stringify(draft));
            console.log(`[DraftStorage] Saved draft for block ${bx}_${by}`);
        } catch (e) {
            console.error(`[DraftStorage] Failed to save draft`, e);
        }
    }

    /**
     * Load a draft for a specific block, or null if none exists.
     */
    public load(worldId: number, bx: number, by: number): BlockDraft | null {
        try {
            const data = localStorage.getItem(DraftStorage.key(worldId, bx, by));
            if (!data) return null;
            return JSON.parse(data) as BlockDraft;
        } catch (e) {
            console.error(`[DraftStorage] Failed to load draft`, e);
            return null;
        }
    }

    /**
     * Check if a draft exists for a specific block.
     */
    public hasDraft(worldId: number, bx: number, by: number): boolean {
        return localStorage.getItem(DraftStorage.key(worldId, bx, by)) !== null;
    }

    /**
     * List all drafts for a given world.
     */
    public list(worldId: number): BlockDraft[] {
        const prefix = `${DRAFT_PREFIX}:${worldId}:`;
        const drafts: BlockDraft[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                try {
                    drafts.push(JSON.parse(localStorage.getItem(key)!));
                } catch (e) { /* skip corrupt entries */ }
            }
        }
        return drafts;
    }

    /**
     * Remove a draft after successful upload.
     */
    public remove(worldId: number, bx: number, by: number): void {
        localStorage.removeItem(DraftStorage.key(worldId, bx, by));
        console.log(`[DraftStorage] Removed draft for block ${bx}_${by}`);
    }
}
