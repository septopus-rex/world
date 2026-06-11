import 'fake-indexeddb/auto'; // registers globalThis.indexedDB for THIS suite only
import { describe, it, expect, afterEach } from 'vitest';
import { DraftStore, InMemoryDraftBackend, BlockDraft } from '../../src/core/services/DraftStore';
import { IdbDraftBackend } from '../../src/core/services/IdbDraftBackend';
import { ExportService } from '../../src/core/services/ExportService';
import { makeHeadlessEngineWith, stepN } from '../helpers/make-world';

// L3 — P1 acceptance criteria, fully in Node:
//   - write a draft → read back identical (sync, before the async write lands)
//   - re-open the same DB (simulated page refresh) → draft still present
//   - legacy localStorage drafts migrate into IndexedDB once
//   - write-behind keeps failed writes dirty and retries
//   - ExportService JSON round-trips
//   - BlockSystem builds a block from the hydrated draft

// Every IdbDraftBackend must be CLOSED before deleteDatabase, or the wipe
// blocks forever on the open connection (and so do later opens).
let liveBackends: IdbDraftBackend[] = [];
function idb(): IdbDraftBackend {
    const b = new IdbDraftBackend();
    liveBackends.push(b);
    return b;
}
async function cleanupIdb(): Promise<void> {
    for (const b of liveBackends) await b.close();
    liveBackends = [];
    await wipeDb();
}

function wipeDb(): Promise<void> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase('septopus');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
    });
}

function markerRaw(tag: number): any[] {
    // [elevation, status, adjunctsRaw, animations] with one identifiable box
    return [0, 1, [[0x00a2, [[[2, 2, 2], [8, 8, tag], [0, 0, 0], 3, [1, 1], 0, 0]]]], []];
}

/** Backend whose writes can be switched off (storage outage simulation). */
class FlakyBackend extends InMemoryDraftBackend {
    public failing = false;
    override async put(draft: BlockDraft): Promise<void> {
        if (this.failing) throw new Error('storage down');
        return super.put(draft);
    }
}

describe('DraftStore — write-behind cache', () => {
    it('reads its own write synchronously, before the backend write lands', () => {
        const store = new DraftStore(new InMemoryDraftBackend());
        store.save(0, 3, 5, markerRaw(1));
        const d = store.load(0, 3, 5);     // NOT awaited — sync hot path
        expect(d?.blockKey).toBe('3_5');
        expect(d?.raw).toEqual(markerRaw(1));
    });

    it('keeps failed writes dirty and retries once storage recovers', async () => {
        const backend = new FlakyBackend();
        const store = new DraftStore(backend);

        backend.failing = true;
        store.save(0, 1, 1, markerRaw(2));
        await store.flush();
        expect(store.pendingWrites).toBe(1);            // kept dirty, not lost
        expect(store.load(0, 1, 1)).not.toBeNull();     // cache still serves it

        backend.failing = false;
        await store.flush();
        expect(store.pendingWrites).toBe(0);
        expect((await backend.hydrate(0)).map(d => d.blockKey)).toEqual(['1_1']);
    });

    it('remove deletes from cache and backend', async () => {
        const backend = new InMemoryDraftBackend();
        const store = new DraftStore(backend);
        store.save(0, 2, 2, markerRaw(3));
        await store.flush();
        store.remove(0, 2, 2);
        expect(store.load(0, 2, 2)).toBeNull();
        await store.flush();
        expect(await backend.hydrate(0)).toEqual([]);
    });
});

describe('DraftStore — IndexedDB round-trip + refresh persistence', () => {
    afterEach(async () => { await cleanupIdb(); });

    it('persists a draft and survives a simulated page refresh', async () => {
        // Session 1: save + flush.
        const s1 = new DraftStore(idb());
        s1.save(7, 2048, 2049, markerRaw(4));
        await s1.flush();

        // Session 2: brand-new store + backend over the same DB (= reload).
        const s2 = new DraftStore(idb());
        expect(s2.load(7, 2048, 2049)).toBeNull();      // cold cache before hydrate
        await s2.hydrate(7);
        const d = s2.load(7, 2048, 2049);
        expect(d?.blockKey).toBe('2048_2049');
        expect(d?.worldId).toBe(7);
        expect(d?.raw).toEqual(markerRaw(4));
    });

    it('hydrate only loads the requested world', async () => {
        const s1 = new DraftStore(idb());
        s1.save(0, 1, 1, markerRaw(5));
        s1.save(9, 1, 1, markerRaw(6));
        await s1.flush();

        const s2 = new DraftStore(idb());
        await s2.hydrate(0);
        expect(s2.list(0)).toHaveLength(1);
        expect(s2.list(9)).toHaveLength(0);
    });

    it('migrates legacy localStorage drafts into IndexedDB once', async () => {
        const legacy: BlockDraft = {
            version: 1, timestamp: 123, worldId: 0, blockKey: '4_4', raw: markerRaw(7),
        };
        localStorage.setItem('sept:draft:0:4_4', JSON.stringify(legacy));

        const store = new DraftStore(idb());
        await store.hydrate(0);
        expect(store.load(0, 4, 4)?.raw).toEqual(markerRaw(7));
        expect(store.load(0, 4, 4)?.timestamp).toBe(123);          // preserved
        expect(localStorage.getItem('sept:draft:0:4_4')).toBeNull(); // one-shot

        // A later session sees it from IDB, not localStorage.
        const again = new DraftStore(idb());
        await again.hydrate(0);
        expect(again.list(0)).toHaveLength(1);
    });
});

describe('ExportService — JSON export/import round-trip', () => {
    afterEach(async () => { await cleanupIdb(); });

    it('export → wipe → import restores identical drafts', async () => {
        const s1 = new DraftStore(idb());
        s1.save(0, 10, 10, markerRaw(8));
        s1.save(0, 11, 10, markerRaw(9));
        const json = await new ExportService(s1).exportWorld(0);   // flushes first

        await cleanupIdb();                                        // fresh world
        const s2 = new DraftStore(idb());
        await s2.hydrate(0);
        expect(s2.list(0)).toHaveLength(0);

        const res = await new ExportService(s2).importWorld(json);
        expect(res.imported).toBe(2);
        expect(s2.load(0, 10, 10)?.raw).toEqual(markerRaw(8));
        expect(s2.load(0, 11, 10)?.raw).toEqual(markerRaw(9));

        // ...and the import is durable (third session).
        const s3 = new DraftStore(idb());
        await s3.hydrate(0);
        expect(s3.list(0)).toHaveLength(2);
    });

    it('preserves original timestamps through the round-trip', async () => {
        const store = new DraftStore(new InMemoryDraftBackend());
        store.put({ version: 1, timestamp: 42, worldId: 0, blockKey: '1_2', raw: markerRaw(1) });
        const json = await new ExportService(store).exportWorld(0);

        const target = new DraftStore(new InMemoryDraftBackend());
        await new ExportService(target).importWorld(json);
        expect(target.load(0, 1, 2)?.timestamp).toBe(42);
    });

    it('rejects garbage and foreign formats, skips corrupt rows', async () => {
        const store = new DraftStore(new InMemoryDraftBackend());
        const svc = new ExportService(store);
        await expect(svc.importWorld('not json')).rejects.toThrow('not valid JSON');
        await expect(svc.importWorld('{"format":"something.else"}')).rejects.toThrow('unrecognized format');

        const mixed = JSON.stringify({
            format: 'septopus.world.drafts', version: 1, worldId: 0, exportedAt: 1,
            drafts: [
                { version: 1, timestamp: 1, worldId: 0, blockKey: '1_1', raw: markerRaw(1) },
                { version: 1, timestamp: 1, worldId: 0, blockKey: '2_2' },            // no raw
                null,
            ],
        });
        const res = await svc.importWorld(mixed);
        expect(res.imported).toBe(1);
    });
});

describe('BlockSystem — builds blocks from hydrated drafts', () => {
    it('an injected block with a draft present is built FROM the draft', async () => {
        // Explicit in-memory backend: keeps this test off the shared fake IDB.
        const { engine } = await makeHeadlessEngineWith({
            api: new (class {
                async world() { return JSON.parse(JSON.stringify((await import('../../src/core/mocks/WorldConfigs')).MockWorldNormal)); }
                async view() { return null; }
                async module() { return {}; }
                async texture() { return {}; }
            })(),
            draftBackend: new InMemoryDraftBackend(),
        });
        const world = engine.getWorld()!;

        // Simulate a hydrated draft for (2048,2048): one marker box.
        world.draftStore.save(0, 2048, 2048, markerRaw(9));

        engine.injectBlock({ x: 2048, y: 2048, world: 0, elevation: 0, adjuncts: [0, 1, [], []] });
        stepN(engine, 5);

        const blockEid = world.getEntitiesWith(['BlockComponent'])[0];
        const block = world.getComponent<any>(blockEid, 'BlockComponent');
        expect(block.isDraft).toBe(true);

        // Draft contents replaced the (empty) injected adjuncts: the marker box
        // is there, plus the auto-generated ground.
        const adjuncts = world.getEntitiesWith(['AdjunctComponent'])
            .map(id => world.getComponent<any>(id, 'AdjunctComponent'))
            .filter(a => a.parentBlockEntityId === blockEid);
        expect(adjuncts.some(a => a.stdData.oz === 9)).toBe(true);  // marker tag
    });
});
