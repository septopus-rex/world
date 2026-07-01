import { describe, it, expect, vi } from 'vitest';
import { ResourceManager } from '../../src/render/ResourceManager';
import { IpfsRouter } from '../../src/core/services/ipfs/IpfsRouter';
import { MemoryCasProvider } from '../../src/core/services/ipfs/MemoryCasProvider';
import { flushAsync } from '../helpers/fake-resources';

// Audio as a first-class, BOUNDED resource: dedup by id, dedicated channel with
// module fallback, direct URL/CID, and an LRU cap that revokes the router-cached
// blob: URL bytes on eviction (audio is play-and-forget → no refcount, so the cap
// is what keeps it from growing forever — the old audioUrls leak).

const bytes = (s: string) => new TextEncoder().encode(s);
const audRec = (raw: string) => ({ type: 'audio', format: 'wav', raw });

/** A source that counts channel hits; `audio` is present only when asked for. */
function source(records: Record<string, any>, withAudioChannel: boolean) {
    const src: any = {
        moduleCalls: 0,
        audioCalls: 0,
        async world() { return {}; },
        async view() { return null; },
        async texture() { return {}; },
        async module(ids: number[]) {
            src.moduleCalls++;
            const out: Record<string, any> = {};
            for (const id of ids) if (records[String(id)]) out[String(id)] = records[String(id)];
            return out;
        },
    };
    if (withAudioChannel) {
        src.audio = async (ids: number[]) => {
            src.audioCalls++;
            const out: Record<string, any> = {};
            for (const id of ids) if (records[String(id)]) out[String(id)] = records[String(id)];
            return out;
        };
    }
    return src;
}

describe('ResourceManager — audio resolution & channel', () => {
    it('dedups by id: a burst of getAudioUrl() hits the source ONCE', async () => {
        const src = source({ '31': audRec('/assets/ding.wav') }, false);
        const rm = new ResourceManager(src, {});
        const urls = await Promise.all(Array.from({ length: 10 }, () => rm.getAudioUrl(31)));
        expect(urls.every(u => u === '/assets/ding.wav')).toBe(true);
        expect(src.moduleCalls).toBe(1);
    });

    it('prefers the dedicated audio() channel, falling back to module()', async () => {
        const withCh = source({ '31': audRec('/a.wav') }, true);
        await new ResourceManager(withCh, {}).getAudioUrl(31);
        expect(withCh.audioCalls).toBe(1);
        expect(withCh.moduleCalls).toBe(0);

        const noCh = source({ '31': audRec('/a.wav') }, false);
        await new ResourceManager(noCh, {}).getAudioUrl(31);
        expect(noCh.moduleCalls).toBe(1);
    });

    it('resolves a direct URL (http/data/blob/file/CID) without consulting the source', async () => {
        const src = source({}, false);
        const url = await new ResourceManager(src, {}).getAudioUrl('https://cdn.example/horn.wav');
        expect(url).toBe('https://cdn.example/horn.wav');
        expect(src.moduleCalls).toBe(0);
    });
});

describe('ResourceManager — audio LRU cap reclaims blob: URLs', () => {
    it('evicts the least-recently-used entry past the cap and revokes its CID', async () => {
        const cas = new MemoryCasProvider();
        const c1 = await cas.put(bytes('sound-a'));
        const c2 = await cas.put(bytes('sound-b'));
        const c3 = await cas.put(bytes('sound-c'));
        const router = new IpfsRouter([cas]);
        const revoke = vi.spyOn(router, 'revoke');

        // CIDs are direct locators → the source is never consulted.
        const rm = new ResourceManager(source({}, false), { ipfsRouter: router, maxAudioUrls: 2 });

        await rm.getAudioUrl(c1);
        await rm.getAudioUrl(c2);
        expect(rm.getStats().audioUrls).toBe(2);
        expect(revoke).not.toHaveBeenCalled();

        await rm.getAudioUrl(c3);        // over cap → evict c1 (LRU head)
        await flushAsync();

        expect(rm.getStats().audioUrls).toBe(2);
        expect(revoke).toHaveBeenCalledWith(c1);
    });

    it('a cache hit refreshes LRU order so the hot entry survives eviction', async () => {
        const cas = new MemoryCasProvider();
        const c1 = await cas.put(bytes('a'));
        const c2 = await cas.put(bytes('b'));
        const c3 = await cas.put(bytes('c'));
        const router = new IpfsRouter([cas]);
        const revoke = vi.spyOn(router, 'revoke');
        const rm = new ResourceManager(source({}, false), { ipfsRouter: router, maxAudioUrls: 2 });

        await rm.getAudioUrl(c1);
        await rm.getAudioUrl(c2);
        await rm.getAudioUrl(c1);         // touch c1 → now c2 is LRU
        await rm.getAudioUrl(c3);         // evicts c2, not c1
        await flushAsync();

        expect(revoke).toHaveBeenCalledWith(c2);
        expect(revoke).not.toHaveBeenCalledWith(c1);
    });
});
