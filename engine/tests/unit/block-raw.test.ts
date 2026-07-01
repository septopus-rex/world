import { describe, it, expect } from 'vitest';
import {
    normalizeBlockRaw,
    validateBlockRaw,
    canonicalBlockString,
    canonicalBlockBytes,
    CANONICAL_BLOCK_ARITY,
} from '../../src/core/protocol/BlockRaw';
import { MemoryCasProvider } from '../../src/core/services/ipfs/MemoryCasProvider';

// 第一期「干净数据」: pin the canonical block-content envelope so a block can be
// content-addressed (CID = hash(bytes) ⇒ same logical block ⇒ same bytes). These
// tests lock the three cleanliness fixes (spec docs/plan/specs/mock-ipfs-block.md):
//   D1 arity drift · D2 wrapper · D3 non-deterministic group order.

describe('BlockRaw · normalize (D1 arity)', () => {
    it('pads a 4-slot (no game) block to canonical 5-slot with game=0', () => {
        const out = normalizeBlockRaw([2, 1, [], []]);
        expect(out).toHaveLength(CANONICAL_BLOCK_ARITY);
        expect(out[4]).toBe(0); // game slot always present
    });

    it('fills defaults for a sparse block (status→1, animations→[], game→0)', () => {
        const out = normalizeBlockRaw([5]);
        expect(out).toEqual([5, 1, [], [], 0]);
    });

    it('drops a 6th+ slot (clamps to canonical arity)', () => {
        const out = normalizeBlockRaw([0, 1, [], [], 0, 'junk', 42]);
        expect(out).toHaveLength(CANONICAL_BLOCK_ARITY);
        expect(out).toEqual([0, 1, [], [], 0]);
    });

    it('is idempotent', () => {
        const once = normalizeBlockRaw([3, 1, [[2, [['a']]], [1, [['b']]]], [], 1]);
        const twice = normalizeBlockRaw(once);
        expect(twice).toEqual(once);
    });

    it('coerces a non-array into an empty canonical block', () => {
        expect(normalizeBlockRaw(null as any)).toEqual([0, 1, [], [], 0]);
        expect(normalizeBlockRaw('nope' as any)).toEqual([0, 1, [], [], 0]);
    });
});

describe('BlockRaw · deterministic group order (D3)', () => {
    it('sorts adjunct groups by typeId ascending, regardless of input order', () => {
        const a = normalizeBlockRaw([0, 1, [[5, [['x']]], [1, [['y']]], [2, [['z']]]], [], 0]);
        const b = normalizeBlockRaw([0, 1, [[2, [['z']]], [5, [['x']]], [1, [['y']]]], [], 0]);
        expect(a[2].map((g) => g[0])).toEqual([1, 2, 5]);
        expect(a).toEqual(b);
    });

    it('PRESERVES instance order within a group (adjunctId index is load-bearing)', () => {
        const out = normalizeBlockRaw([0, 1, [[1, [['first'], ['second'], ['third']]]], [], 0]);
        expect(out[2][0][1]).toEqual([['first'], ['second'], ['third']]);
    });
});

describe('BlockRaw · canonical bytes → CID', () => {
    it('same logical block (different group order / arity) → identical bytes', () => {
        const authored = [0, 1, [[2, [['b']]], [1, [['a']]]], []]; // 4-slot, unsorted
        const roundTripped = [0, 1, [[1, [['a']]], [2, [['b']]]], [], 0]; // 5-slot, sorted
        expect(canonicalBlockString(authored)).toBe(canonicalBlockString(roundTripped));
        expect(canonicalBlockBytes(authored)).toEqual(canonicalBlockBytes(roundTripped));
    });

    it('sorts object keys recursively so key insertion order does not move the CID', () => {
        const clipA = { name: 'spin', duration: 2000, loops: 0 };
        const clipB = { loops: 0, name: 'spin', duration: 2000 };
        expect(canonicalBlockString([0, 1, [], [clipA], 0]))
            .toBe(canonicalBlockString([0, 1, [], [clipB], 0]));
    });

    it('folds -0 to 0', () => {
        expect(canonicalBlockString([-0, 1, [], [], 0]))
            .toBe(canonicalBlockString([0, 1, [], [], 0]));
    });

    it('different content → different bytes (no false dedup)', () => {
        expect(canonicalBlockString([0, 1, [[1, [['a']]]], [], 0]))
            .not.toBe(canonicalBlockString([0, 1, [[1, [['b']]]], [], 0]));
    });

    it('ingests into the mock CAS at a stable CID (same block → same CID)', async () => {
        const cas = new MemoryCasProvider();
        const raw = [0, 1, [[2, [['b']]], [1, [['a']]]], []];
        const cid1 = await cas.put(canonicalBlockBytes(raw));
        const cid2 = await cas.put(canonicalBlockBytes([0, 1, [[1, [['a']]], [2, [['b']]]], [], 0]));
        expect(cid1).toBe(cid2);
        expect(cas.size()).toBe(1); // deduped
        // round-trips back to the canonical raw
        const got = await cas.get(cid1);
        expect(JSON.parse(new TextDecoder().decode(got!))).toEqual(normalizeBlockRaw(raw));
    });
});

describe('BlockRaw · validate (strict gate)', () => {
    it('accepts canonical and short-but-well-formed blocks', () => {
        expect(() => validateBlockRaw([0, 1, [[1, [['a']]]], [], 0])).not.toThrow();
        expect(() => validateBlockRaw([0, 1])).not.toThrow(); // trailing slots optional
    });

    it('rejects a non-array', () => {
        expect(() => validateBlockRaw({ x: 1 } as any)).toThrow(/not an array/);
    });

    it('rejects an over-long array', () => {
        expect(() => validateBlockRaw([0, 1, [], [], 0, 'extra'])).toThrow(/canonical arity/);
    });

    it('rejects a malformed adjunct group', () => {
        expect(() => validateBlockRaw([0, 1, [['not-a-number', []]]])).toThrow(/adjunct group/);
        expect(() => validateBlockRaw([0, 1, [[1, 'not-an-array']]])).toThrow(/adjunct group/);
    });

    it('rejects non-number scalar slots', () => {
        expect(() => validateBlockRaw(['high', 1, [], [], 0])).toThrow(/elevation/);
        expect(() => validateBlockRaw([0, 1, [], [], 'yes'])).toThrow(/game/);
    });
});
