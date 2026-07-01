import { describe, it, expect } from 'vitest';
import { LocalDataSource, SceneProvider } from '../../src/core/services/LocalDataSource';
import { DraftStore, InMemoryDraftBackend } from '../../src/core/services/DraftStore';
import { BlockCas } from '../../src/core/services/BlockCas';
import { IpfsRouter, MemoryCasProvider } from '../../src/core/services/ipfs';

/**
 * LocalDataSource unifies the scene seed with the local draft overlay and serves
 * the streaming window synchronously (no I/O on the hot path). Content-addressing
 * is an explicit, off-hot-path op: publish() ingests a block into the CAS → CID
 * and records coord→cid in the world manifest (第三期).
 */

// A canonical seed: encodes its coords as a Box(162) instance [x,y], so a test
// can tell a seed-from-(x,y) apart from an overlaid draft. Canonical 5-slot.
const seedScene: SceneProvider = {
    block: (x, y) => [0, 1, [[162, [[x, y]]]], [], 0],
};

function makeDrafts(): DraftStore {
    return new DraftStore(new InMemoryDraftBackend());
}
function makeCas(): BlockCas {
    return new BlockCas(new IpfsRouter([new MemoryCasProvider()]));
}

describe('LocalDataSource · streaming seam', () => {
    it('returns the normalized scene seed when no draft exists', () => {
        const lds = new LocalDataSource(seedScene, makeDrafts(), 0);
        const b = lds.blockAt(2048, 2049);
        expect(b.isDraft).toBe(false);
        expect(b.raw).toEqual([0, 1, [[162, [[2048, 2049]]]], [], 0]);
    });

    it('overlays a local draft over the seed (draft wins, isDraft flagged)', () => {
        const drafts = makeDrafts();
        drafts.save(0, 2048, 2048, [9, 1, [[162, [['DRAFT']]]], [], 0]);
        const lds = new LocalDataSource(seedScene, drafts, 0);

        const edited = lds.blockAt(2048, 2048);
        expect(edited.isDraft).toBe(true);
        expect(edited.raw).toEqual([9, 1, [[162, [['DRAFT']]]], [], 0]);

        // A neighbour without a draft still comes from the seed.
        expect(lds.blockAt(2049, 2048).isDraft).toBe(false);
    });

    it('scopes drafts by worldIndex', () => {
        const drafts = makeDrafts();
        drafts.save(1, 2048, 2048, [9, 1, [[162, [['OTHER_WORLD']]]], [], 0]);
        const lds = new LocalDataSource(seedScene, drafts, 0);
        expect(lds.blockAt(2048, 2048).isDraft).toBe(false);
    });

    it('view() returns the full (2*ext+1)^2 neighbourhood window', () => {
        const lds = new LocalDataSource(seedScene, makeDrafts(), 0);
        const win = lds.view(2048, 2048, 2);
        expect(win).toHaveLength(25); // 5x5
        const keys = new Set(win.map((b) => `${b.x}_${b.y}`));
        expect(keys.has('2046_2046')).toBe(true);
        expect(keys.has('2050_2050')).toBe(true);
        expect(keys.has('2048_2048')).toBe(true);
    });

    it('view() applies the draft overlay per-cell', () => {
        const drafts = makeDrafts();
        drafts.save(0, 2048, 2048, [0, 1, [[162, [['EDITED']]]], [], 0]);
        const lds = new LocalDataSource(seedScene, drafts, 0);

        const win = lds.view(2048, 2048, 1);
        const centre = win.find((b) => b.x === 2048 && b.y === 2048)!;
        expect(centre.isDraft).toBe(true);
        expect(win.filter((b) => b.isDraft)).toHaveLength(1); // only the edited cell
    });
});

describe('LocalDataSource · publish to CAS (第三期)', () => {
    it('publish() content-addresses the effective block → CID + manifest', async () => {
        const cas = makeCas();
        const lds = new LocalDataSource(seedScene, makeDrafts(), 0, cas);

        expect(lds.cidOf(2048, 2049)).toBeUndefined(); // not published yet
        const cid = await lds.publish(2048, 2049);
        expect(cid).toMatch(/^bafy/);
        expect(lds.cidOf(2048, 2049)).toBe(cid);
        // reading that CID back yields the published (canonical) raw
        expect(await cas.get(cid!)).toEqual([0, 1, [[162, [[2048, 2049]]]], [], 0]);
        // and a subsequent blockAt now surfaces the manifest CID
        expect(lds.blockAt(2048, 2049).cid).toBe(cid);
    });

    it('publish() includes local draft edits (working copy → CAS)', async () => {
        const cas = makeCas();
        const drafts = makeDrafts();
        drafts.save(0, 7, 7, [2, 1, [[162, [['PUB']]]], [], 0]);
        const lds = new LocalDataSource(seedScene, drafts, 0, cas);

        const cid = await lds.publish(7, 7);
        expect(await cas.get(cid!)).toEqual([2, 1, [[162, [['PUB']]]], [], 0]);
    });

    it('identical content publishes to the same CID (dedup across coords)', async () => {
        const flat: SceneProvider = { block: () => [0, 1, [[162, [['X']]]], [], 0] };
        const lds = new LocalDataSource(flat, makeDrafts(), 0, makeCas());
        expect(await lds.publish(1, 1)).toBe(await lds.publish(2, 2));
    });

    it('publish() returns null when no CAS is wired', async () => {
        const lds = new LocalDataSource(seedScene, makeDrafts(), 0);
        expect(await lds.publish(1, 1)).toBeNull();
    });
});
