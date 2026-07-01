/**
 * DraftStore — local-first draft persistence (P1).
 *
 * The engine's block-load and edit-save paths are SYNCHRONOUS hot paths, while
 * durable browser storage (IndexedDB) is async. This store bridges the two with
 * a write-behind in-memory cache:
 *
 *   hydrate(worldId)  — once at boot: load every draft for the world into the Map
 *   load()/list()     — sync, served from the Map (never blocks the frame)
 *   save()/remove()   — update the Map immediately, then flush to the backend
 *                       asynchronously; failed writes stay dirty and are retried
 *                       on the next mutation or flush()
 *
 * The durable layer is pluggable (IDraftBackend): browsers use IdbDraftBackend
 * (IndexedDB via `idb`), headless tests use InMemoryDraftBackend (or none).
 */
import { reportError, PersistenceError } from '../errors';

export interface BlockDraft {
    version: 1;
    timestamp: number;
    worldId: number;
    blockKey: string;           // "3_5" (block coords; worldId kept separately)
    raw: any[];                 // full block raw: [elevation, status, adjunctsRaw, animations]
}

export interface IDraftBackend {
    /** All drafts persisted for a world (boot hydrate). */
    hydrate(worldId: number): Promise<BlockDraft[]>;
    put(draft: BlockDraft): Promise<void>;
    remove(worldId: number, blockKey: string): Promise<void>;
    /** Wipe every draft AND metadata row for a world (RESET STATE). Optional. */
    clearWorld?(worldId: number): Promise<void>;
    /** World-scoped key/value metadata (player inventory, etc.). Optional. */
    loadMeta?(worldId: number, key: string): Promise<any>;
    saveMeta?(worldId: number, key: string, value: any): Promise<void>;
}

/** Trivial backend for headless boots and unit tests — durable for the process. */
export class InMemoryDraftBackend implements IDraftBackend {
    private rows = new Map<string, BlockDraft>();
    private meta = new Map<string, any>();
    async hydrate(worldId: number): Promise<BlockDraft[]> {
        return [...this.rows.values()].filter(d => d.worldId === worldId);
    }
    async put(draft: BlockDraft): Promise<void> {
        this.rows.set(`${draft.worldId}:${draft.blockKey}`, draft);
    }
    async remove(worldId: number, blockKey: string): Promise<void> {
        this.rows.delete(`${worldId}:${blockKey}`);
    }
    async clearWorld(worldId: number): Promise<void> {
        const pfx = `${worldId}:`;
        for (const k of [...this.rows.keys()]) if (k.startsWith(pfx)) this.rows.delete(k);
        for (const k of [...this.meta.keys()]) if (k.startsWith(pfx)) this.meta.delete(k);
    }
    async loadMeta(worldId: number, key: string): Promise<any> {
        return this.meta.get(`${worldId}:${key}`);
    }
    async saveMeta(worldId: number, key: string, value: any): Promise<void> {
        this.meta.set(`${worldId}:${key}`, value);
    }
}

type PendingOp = { op: 'put'; draft: BlockDraft } | { op: 'remove'; worldId: number; blockKey: string };

export class DraftStore {
    private cache = new Map<string, BlockDraft>();   // `${worldId}:${blockKey}` → draft
    private backend: IDraftBackend | null;

    /** Mutations not yet durably written, keyed like the cache (last op wins). */
    private dirty = new Map<string, PendingOp>();
    private flushing: Promise<void> | null = null;

    /** In-flight meta writes (player/inventory/session). Tracked so flush() can
     *  await them too — saveMeta is fire-and-forget, but tests/exit paths need a
     *  way to know the last write landed. */
    private metaWrites = new Set<Promise<void>>();

    constructor(backend: IDraftBackend | null = null) {
        this.backend = backend;
    }

    private static key(worldId: number, blockKey: string): string {
        return `${worldId}:${blockKey}`;
    }

    /**
     * Load every persisted draft for a world into the sync cache. Call ONCE at
     * boot, BEFORE the first block is injected (BlockSystem reads sync).
     */
    public async hydrate(worldId: number): Promise<void> {
        if (!this.backend) return;
        const drafts = await this.backend.hydrate(worldId);
        for (const d of drafts) {
            const k = DraftStore.key(d.worldId, d.blockKey);
            // A save() that raced ahead of hydrate wins over the stored copy.
            if (!this.cache.has(k) && !this.dirty.has(k)) this.cache.set(k, d);
        }
        console.log(`[DraftStore] hydrated ${drafts.length} draft(s) for world ${worldId}`);
    }

    // ── sync facade (hot paths) ────────────────────────────────────────────────

    public load(worldId: number, bx: number, by: number): BlockDraft | null {
        return this.cache.get(DraftStore.key(worldId, `${bx}_${by}`)) ?? null;
    }

    public hasDraft(worldId: number, bx: number, by: number): boolean {
        return this.cache.has(DraftStore.key(worldId, `${bx}_${by}`));
    }

    public list(worldId: number): BlockDraft[] {
        return [...this.cache.values()].filter(d => d.worldId === worldId);
    }

    public save(worldId: number, bx: number, by: number, raw: any[]): void {
        const draft: BlockDraft = {
            version: 1,
            timestamp: Date.now(),
            worldId,
            blockKey: `${bx}_${by}`,
            raw,
        };
        this.put(draft);
    }

    /** Insert a fully-formed draft (import path — preserves its timestamp). */
    public put(draft: BlockDraft): void {
        const k = DraftStore.key(draft.worldId, draft.blockKey);
        this.cache.set(k, draft);
        this.dirty.set(k, { op: 'put', draft });
        this.kick();
    }

    public remove(worldId: number, bx: number, by: number): void {
        const blockKey = `${bx}_${by}`;
        const k = DraftStore.key(worldId, blockKey);
        this.cache.delete(k);
        this.dirty.set(k, { op: 'remove', worldId, blockKey });
        this.kick();
    }

    /**
     * Wipe ALL local edits + metadata for a world — a true "reset state". Clears
     * the sync cache and drops any pending write-behind ops for the world (so a
     * queued put can't resurrect a just-cleared block), then deletes the durable
     * rows. After this + a reload, hydrate finds nothing and blocks fall back to
     * the scene seed. Awaitable so the caller can reload only once IDB is wiped.
     */
    public async clearWorld(worldId: number): Promise<void> {
        const pfx = `${worldId}:`;
        for (const k of [...this.cache.keys()]) if (k.startsWith(pfx)) this.cache.delete(k);
        for (const k of [...this.dirty.keys()]) if (k.startsWith(pfx)) this.dirty.delete(k);
        if (this.backend?.clearWorld) {
            try { await this.backend.clearWorld(worldId); }
            catch (e) { reportError(e, { tag: '[DraftStore]', severity: 'warn', code: 'PERSIST_IDB', id: `clearWorld(${worldId})` }); }
        }
    }

    // ── world metadata (player inventory, etc.) ───────────────────────────────

    /** Read a world-scoped metadata value (boot restore). */
    public async loadMeta(worldId: number, key: string): Promise<any> {
        if (!this.backend?.loadMeta) return undefined;
        try {
            return await this.backend.loadMeta(worldId, key);
        } catch (e) {
            reportError(e, { tag: '[DraftStore]', severity: 'warn', code: 'PERSIST_IDB', id: `loadMeta(${worldId}, ${key})` });
            return undefined;
        }
    }

    /**
     * Persist a world-scoped metadata value (fire-and-forget). The value is
     * JSON-snapshotted so callers can keep mutating the live object.
     */
    public saveMeta(worldId: number, key: string, value: any): void {
        if (!this.backend?.saveMeta) return;
        let snapshot: any;
        try {
            snapshot = JSON.parse(JSON.stringify(value));
        } catch (e) {
            reportError(new PersistenceError(`saveMeta(${worldId}, ${key}): value not serializable, skipped`, { cause: e }), { tag: '[DraftStore]', severity: 'warn' });
            return;
        }
        const write: Promise<void> = this.backend.saveMeta(worldId, key, snapshot)
            .catch(e => { reportError(e, { tag: '[DraftStore]', severity: 'warn', code: 'PERSIST_IDB', id: `saveMeta(${worldId}, ${key})` }); })
            .finally(() => this.metaWrites.delete(write));
        this.metaWrites.add(write);
    }

    // ── write-behind ──────────────────────────────────────────────────────────

    /** Number of mutations not yet durably written (tests/diagnostics). */
    public get pendingWrites(): number {
        return this.dirty.size;
    }

    /**
     * Drain the dirty set to the backend. Each entry is attempted once per
     * flush; failures stay dirty (retried on the next mutation or flush) so a
     * transient storage error never loses an edit — and never blocks a frame.
     */
    public flush(): Promise<void> {
        if (!this.backend) { this.dirty.clear(); return Promise.resolve(); }
        if (this.flushing) return this.flushing;

        this.flushing = (async () => {
            // Round-based drain: ops enqueued DURING a round are picked up by the
            // next one, so a mutation landing mid-flush is never stranded. A round
            // with zero successes stops the loop (storage is down — entries stay
            // dirty and the next mutation/flush retries).
            while (this.dirty.size > 0) {
                const batch = [...this.dirty.entries()];
                let progressed = false;
                for (const [k, pending] of batch) {
                    try {
                        if (pending.op === 'put') await this.backend!.put(pending.draft);
                        else await this.backend!.remove(pending.worldId, pending.blockKey);
                        // Only clear if no newer mutation replaced this entry mid-write.
                        if (this.dirty.get(k) === pending) this.dirty.delete(k);
                        progressed = true;
                    } catch (e) {
                        // Kept dirty (retried next mutation/flush) — policy unchanged, now reported.
                        reportError(e, { tag: '[DraftStore]', severity: 'warn', code: 'PERSIST_IDB', id: `write-behind ${k}` });
                    }
                }
                if (!progressed) break;
            }
            // Drain in-flight meta writes too (loop: a write may enqueue another).
            while (this.metaWrites.size > 0) {
                await Promise.all([...this.metaWrites]);
            }
        })().finally(() => { this.flushing = null; });

        return this.flushing;
    }

    /** Fire-and-forget flush used by the mutation path. */
    private kick(): void {
        void this.flush();
    }
}
