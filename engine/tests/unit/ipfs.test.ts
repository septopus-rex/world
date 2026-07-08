import { describe, it, expect } from 'vitest';
import { cidForBytes, isCid } from '../../src/core/services/ipfs/Cid';
import { MemoryCasProvider } from '../../src/core/services/ipfs/MemoryCasProvider';
import { IpfsRouter } from '../../src/core/services/ipfs/IpfsRouter';
import type { IpfsProvider } from '../../src/core/services/ipfs/IpfsProvider';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('CID', () => {
    it('is deterministic — same content → same cid', async () => {
        const a = await cidForBytes(bytes('hello world'));
        const b = await cidForBytes(bytes('hello world'));
        expect(a).toBe(b);
        expect(a).toMatch(/^bafk[a-z2-7]+$/); // real CIDv1(raw, sha2-256)
    });

    it('is content-sensitive — different content → different cid', async () => {
        const a = await cidForBytes(bytes('hello world'));
        const b = await cidForBytes(bytes('hello worle'));
        expect(a).not.toBe(b);
    });

    it('isCid recognises our bafy cids and v0 Qm; rejects paths/urls', async () => {
        expect(isCid(await cidForBytes(bytes('x')))).toBe(true);
        expect(isCid('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')).toBe(true);
        expect(isCid('/assets/checker.png')).toBe(false);
        expect(isCid('https://example.com/a.glb')).toBe(false);
    });
});

describe('MemoryCasProvider', () => {
    it('put → get round-trips the exact bytes, keyed by content cid', async () => {
        const cas = new MemoryCasProvider();
        const data = bytes('the quick brown fox');
        const cid = await cas.put(data);
        expect(cid).toBe(await cidForBytes(data));
        const got = await cas.get(cid);
        expect(got && new TextDecoder().decode(got)).toBe('the quick brown fox');
    });

    it('get returns null on miss', async () => {
        const cas = new MemoryCasProvider();
        expect(await cas.get('bafymissing')).toBeNull();
    });

    it('dedupes identical content (one blob)', async () => {
        const cas = new MemoryCasProvider();
        await cas.put(bytes('dup'));
        await cas.put(bytes('dup'));
        expect(cas.size()).toBe(1);
    });
});

describe('IpfsRouter', () => {
    it('put writes to the first writable provider; get reads it back', async () => {
        const router = new IpfsRouter([new MemoryCasProvider()]);
        const cid = await router.put(bytes('payload'));
        const got = await router.get(cid);
        expect(new TextDecoder().decode(got)).toBe('payload');
    });

    it('routing falls through providers until one HAS the cid', async () => {
        const empty = new MemoryCasProvider();          // writable but empty
        const backing = new MemoryCasProvider();
        const cid = await backing.put(bytes('over here'));
        // empty is first; router must fall through to backing.
        const router = new IpfsRouter([empty, backing]);
        const got = await router.get(cid);
        expect(new TextDecoder().decode(got)).toBe('over here');
    });

    it('throws when no provider has the cid', async () => {
        const router = new IpfsRouter([new MemoryCasProvider()]);
        await expect(router.get('bafynope')).rejects.toThrow(/no provider has/);
    });

    it('verifies integrity — rejects bytes that do not hash to the cid', async () => {
        const liar: IpfsProvider = { name: 'liar', async get() { return bytes('tampered'); } };
        const router = new IpfsRouter([liar]);
        await expect(router.get('bafyclaimed')).rejects.toThrow(/integrity/);
    });

    it('put throws when there is no writable provider', async () => {
        const readOnly: IpfsProvider = { name: 'ro', async get() { return null; } };
        const router = new IpfsRouter([readOnly]);
        await expect(router.put(bytes('x'))).rejects.toThrow(/no writable provider/);
    });

    it('a read-only provider serves content put into a writable one behind it', async () => {
        const cas = new MemoryCasProvider();
        const cid = await cas.put(bytes('shared'));
        // Read-only gateway-like provider in front that always misses.
        const gateway: IpfsProvider = { name: 'gw', async get() { return null; } };
        const router = new IpfsRouter([gateway, cas]);
        expect(new TextDecoder().decode(await router.get(cid))).toBe('shared');
    });
});
