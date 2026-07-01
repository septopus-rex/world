import { describe, it, expect, vi } from 'vitest';
import { ResourceManager } from '../../src/render/ResourceManager';
import { IpfsRouter } from '../../src/core/services/ipfs/IpfsRouter';
import { MemoryCasProvider } from '../../src/core/services/ipfs/MemoryCasProvider';
import { FakeModelLoader, CountingDataSource } from '../helpers/fake-resources';

// Regression: a router-cached object URL (blob:/data:) keeps the fetched bytes
// alive until the router drops it. ResourceManager refcounts by resource-id and
// the router caches by CID, so the reclaim has to be driven from release() —
// and only when the LAST id backed by that CID is gone.

const bytes = (s: string) => new TextEncoder().encode(s);
const modRec = (raw: string) => ({ type: 'module', format: 'glb', raw });

describe('IpfsRouter.revoke', () => {
    it('drops the cached object URL so a later resolve re-fetches; no-op on unknown cid', async () => {
        const cas = new MemoryCasProvider();
        const cid = await cas.put(bytes('model-bytes'));
        const router = new IpfsRouter([cas]);

        const first = router.toObjectUrl(cid);
        expect(router.toObjectUrl(cid)).toBe(first);   // cached: same promise

        router.revoke(cid);

        expect(router.toObjectUrl(cid)).not.toBe(first); // cache dropped → re-created
        expect(() => router.revoke('bafyunknowncidnothere')).not.toThrow(); // safe on miss
    });
});

describe('ResourceManager — IPFS blob-URL reclaim on release', () => {
    it('revokes the CID exactly once, only after the last instance is released', async () => {
        const cas = new MemoryCasProvider();
        const cid = await cas.put(bytes('robot.glb'));
        const router = new IpfsRouter([cas]);
        const revoke = vi.spyOn(router, 'revoke');

        const ds = new CountingDataSource({ '27': modRec(cid) }, {});
        const rm = new ResourceManager(ds as any, { loader: new FakeModelLoader(), ipfsRouter: router });

        await rm.getModel('27');
        rm.instance('27'); rm.instance('27');

        rm.release('27');
        expect(revoke, 'not revoked while a clone remains').not.toHaveBeenCalled();

        rm.release('27');
        expect(revoke).toHaveBeenCalledTimes(1);
        expect(revoke).toHaveBeenCalledWith(cid);
    });

    it('does NOT revoke while another resource id still resolves to the same CID', async () => {
        const cas = new MemoryCasProvider();
        const cid = await cas.put(bytes('shared.glb'));   // one CID, two ids (identical content)
        const router = new IpfsRouter([cas]);
        const revoke = vi.spyOn(router, 'revoke');

        const ds = new CountingDataSource({ '27': modRec(cid), '28': modRec(cid) }, {});
        const rm = new ResourceManager(ds as any, { loader: new FakeModelLoader(), ipfsRouter: router });

        await rm.getModel('27'); rm.instance('27');
        await rm.getModel('28'); rm.instance('28');

        rm.release('27');                                  // id 27 gone, but 28 still holds the cid
        expect(revoke, 'survivor keeps the CID alive').not.toHaveBeenCalled();

        rm.release('28');                                  // last user gone
        expect(revoke).toHaveBeenCalledTimes(1);
        expect(revoke).toHaveBeenCalledWith(cid);
    });

    it('non-CID sources (gateway/path) are never routed through revoke', async () => {
        const router = new IpfsRouter([]);
        const revoke = vi.spyOn(router, 'revoke');
        const ds = new CountingDataSource({ '27': modRec('models/plain.glb') }, {});
        const rm = new ResourceManager(ds as any, { loader: new FakeModelLoader(), ipfsRouter: router });

        await rm.getModel('27');
        rm.instance('27');
        rm.release('27');
        expect(revoke).not.toHaveBeenCalled();
    });
});
