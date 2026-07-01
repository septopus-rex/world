import { describe, it, expect } from 'vitest';
import { BlockCas } from '../../src/core/services/BlockCas';
import { IpfsRouter, MemoryCasProvider } from '../../src/core/services/ipfs';
import { canonicalBlockBytes, normalizeBlockRaw } from '../../src/core/protocol/BlockRaw';

// 第二期 CAS block pipeline: a block's authored raw ↔ its CID over the same
// mock-IPFS router as resources. put() normalizes trusted local content; get()
// validates untrusted read-back (spec docs/plan/specs/mock-ipfs-block.md).

function makeCas() {
    const router = new IpfsRouter([new MemoryCasProvider()]);
    return { cas: new BlockCas(router), router };
}
const bytes = (s: string) => new TextEncoder().encode(s);

describe('BlockCas · put/get round-trip', () => {
    it('put → get returns the canonical block raw', async () => {
        const { cas } = makeCas();
        const raw = [3, 1, [[2, [['b']]], [1, [['a']]]], [], 1]; // groups out of order
        const cid = await cas.put(raw);
        expect(await cas.get(cid)).toEqual(normalizeBlockRaw(raw)); // sorted + canonical
    });

    it('same logical block (arity/order variants) → same CID (dedup)', async () => {
        const { cas } = makeCas();
        const c1 = await cas.put([0, 1, [[2, [['b']]], [1, [['a']]]], []]);   // 4-slot, unsorted
        const c2 = await cas.put([0, 1, [[1, [['a']]], [2, [['b']]]], [], 0]); // 5-slot, sorted
        expect(c1).toBe(c2);
    });

    it('different content → different CID', async () => {
        const { cas } = makeCas();
        const a = await cas.put([0, 1, [[1, [['a']]]], [], 0]);
        const b = await cas.put([0, 1, [[1, [['b']]]], [], 0]);
        expect(a).not.toBe(b);
    });

    it('put ingests exactly canonicalBlockBytes (game/order normalized)', async () => {
        const { cas, router } = makeCas();
        const cid = await cas.put([0, 1, [], []]); // 4-slot
        expect(await router.get(cid)).toEqual(canonicalBlockBytes([0, 1, [], [], 0]));
    });
});

describe('BlockCas · get validation (untrusted read-back)', () => {
    it('throws on stored non-block bytes', async () => {
        const { cas, router } = makeCas();
        const cid = await router.put(bytes(JSON.stringify({ not: 'a block' })));
        await expect(cas.get(cid)).rejects.toThrow(/not an array/);
    });

    it('throws on a structurally invalid block (malformed group)', async () => {
        const { cas, router } = makeCas();
        const cid = await router.put(bytes(JSON.stringify([0, 1, [[1, 'bad']]])));
        await expect(cas.get(cid)).rejects.toThrow(/adjunct group/);
    });

    it('rejects an unknown CID (router miss)', async () => {
        const { cas } = makeCas();
        await expect(cas.get('bafyunknown')).rejects.toThrow();
    });
});
