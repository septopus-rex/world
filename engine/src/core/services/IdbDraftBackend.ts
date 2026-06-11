/**
 * IdbDraftBackend — IndexedDB durability for DraftStore (P1).
 *
 * DB "septopus" v1 (see docs/plan/STANDALONE_ENGINE_ROADMAP.md §3.2):
 *   ├── drafts  keyPath "key" (`${worldId}:${bx}_${by}`)  indexes: byWorld, byTime
 *   ├── assets  keyPath "id"      (imported models/textures — reserved, P1 schema)
 *   └── worlds  keyPath "worldId" (world-level meta — reserved, P1 schema)
 *
 * Also migrates any pre-P1 localStorage drafts (`sept:draft:{worldId}:{bx}_{by}`)
 * into IndexedDB once, on first hydrate, then deletes the old keys.
 */
import { openDB, IDBPDatabase } from 'idb';
import { BlockDraft, IDraftBackend } from './DraftStore';

const DB_NAME = 'septopus';
const DB_VERSION = 1;
const LEGACY_PREFIX = 'sept:draft:';

type DraftRow = BlockDraft & { key: string };

export class IdbDraftBackend implements IDraftBackend {
    private db: Promise<IDBPDatabase> | null = null;

    /** Lazy open — the backend is constructed synchronously (World constructor). */
    private open(): Promise<IDBPDatabase> {
        if (!this.db) {
            this.db = openDB(DB_NAME, DB_VERSION, {
                upgrade(db) {
                    if (!db.objectStoreNames.contains('drafts')) {
                        const drafts = db.createObjectStore('drafts', { keyPath: 'key' });
                        drafts.createIndex('byWorld', 'worldId');
                        drafts.createIndex('byTime', 'timestamp');
                    }
                    if (!db.objectStoreNames.contains('assets')) {
                        db.createObjectStore('assets', { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('worlds')) {
                        db.createObjectStore('worlds', { keyPath: 'worldId' });
                    }
                },
            });
        }
        return this.db;
    }

    async hydrate(worldId: number): Promise<BlockDraft[]> {
        await this.migrateLegacyLocalStorage();
        const db = await this.open();
        const rows: DraftRow[] = await db.getAllFromIndex('drafts', 'byWorld', worldId);
        return rows.map(({ key: _key, ...draft }) => draft as BlockDraft);
    }

    async put(draft: BlockDraft): Promise<void> {
        const db = await this.open();
        const row: DraftRow = { ...draft, key: `${draft.worldId}:${draft.blockKey}` };
        await db.put('drafts', row);
    }

    async remove(worldId: number, blockKey: string): Promise<void> {
        const db = await this.open();
        await db.delete('drafts', `${worldId}:${blockKey}`);
    }

    /** Close the underlying connection (tests / teardown — an open connection
     *  blocks deleteDatabase and version upgrades). */
    async close(): Promise<void> {
        if (!this.db) return;
        const db = await this.db;
        db.close();
        this.db = null;
    }

    /**
     * One-shot import of pre-P1 localStorage drafts. Old keys are deleted after
     * a successful put so the migration never runs twice (and the ~5MB sync
     * store stops accumulating).
     */
    private async migrateLegacyLocalStorage(): Promise<void> {
        if (typeof localStorage === 'undefined') return;
        const legacyKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(LEGACY_PREFIX)) legacyKeys.push(k);
        }
        if (legacyKeys.length === 0) return;

        let migrated = 0;
        for (const k of legacyKeys) {
            try {
                const draft = JSON.parse(localStorage.getItem(k)!) as BlockDraft;
                if (!draft?.blockKey || !Array.isArray(draft.raw)) continue;
                await this.put(draft);
                localStorage.removeItem(k);
                migrated++;
            } catch (e) {
                console.warn(`[IdbDraftBackend] failed to migrate legacy draft ${k}`, e);
            }
        }
        if (migrated > 0) console.log(`[IdbDraftBackend] migrated ${migrated} legacy localStorage draft(s) to IndexedDB`);
    }
}

/** True when this environment can persist via IndexedDB. */
export function hasIndexedDB(): boolean {
    return typeof indexedDB !== 'undefined';
}
