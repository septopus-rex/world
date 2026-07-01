import { ProtocolError } from '../errors';

/**
 * BlockRaw — the canonical, content-addressable block-content envelope.
 * (Spec: docs/plan/specs/mock-ipfs-block.md, 第一期「干净数据」.)
 *
 * A block's content is the ORDERED array below. Before this module, "a block"
 * had three cleanliness defects that block content-addressing (CID = hash(bytes),
 * so the SAME logical block MUST produce the SAME bytes):
 *
 *   D1 arity drift  — mocks emit 4 slots (no `game`), serializeBlockToRaw emits 5.
 *   D2 wrapper drift — some sources return `{x,y,raw}`, others a bare array.
 *   D3 group order  — serializeBlockToRaw groups adjuncts through a Map whose
 *                     iteration order = entity-iteration order (not deterministic
 *                     across loads) → two serializations differ → CID drifts.
 *
 * This module pins ONE canonical form and one deterministic byte encoding, so a
 * block can be hashed into a CID and round-trip stably.
 *
 * NOT in the canonical envelope, by design:
 *   - Block COORDINATES (x,y): the addressing key ("where the block lives"),
 *     external to content — so the same content can be reused at many coords and
 *     it does NOT enter the CID.
 *   - DERIVED content: the auto ground plate (`ground_*`) and SPP expansion
 *     products (`derivedFrom`) — canonical raw holds AUTHORED content only.
 *
 * Pure core: no Three.js, no World import, no I/O.
 */

/** Canonical block-raw arity: [elevation, status, adjuncts, animations, game]. */
export const CANONICAL_BLOCK_ARITY = 5;

/** One adjunct type-group: [typeId, per-instance raw rows]. */
export type AdjunctGroup = [number, any[]];

/**
 * The canonical block-content array. Fixed 5-slot; `game` (raw[4]) is always
 * present (default 0), killing D1.
 */
export type BlockRaw = [
    number,          // [0] elevation — block base altitude
    number,          // [1] status — 1 = active
    AdjunctGroup[],  // [2] adjunct groups (authored only), sorted by typeId asc
    any[],           // [3] animation library — block-shared clips
    number,          // [4] game — game-zone gate flag (0 = not playable)
];

/**
 * Coerce ANY loosely-shaped block raw into THE canonical 5-slot form.
 * Wide-in: pads missing slots with defaults (status→1, animations→[], game→0),
 * drops any 6th+ slot, and sorts adjunct groups by typeId ascending (D3 fix).
 *
 * INSTANCE ORDER WITHIN A GROUP IS PRESERVED — it is load-bearing: BlockSystem
 * derives `adj_{x}_{y}_{typeId}_{idx}` from the instance's position in its group,
 * and triggers/references address adjuncts by that id. Only GROUP order (which
 * type-group comes first) is normalized, and group order does not affect `idx`.
 *
 * Idempotent: normalize(normalize(r)) deep-equals normalize(r).
 * Never throws — validateBlockRaw is the strict gate; this is the coercer.
 */
export function normalizeBlockRaw(raw: any): BlockRaw {
    const arr = Array.isArray(raw) ? raw : [];

    const elevation = typeof arr[0] === 'number' ? arr[0] : 0;
    const status = typeof arr[1] === 'number' ? arr[1] : 1;

    const groupsIn = Array.isArray(arr[2]) ? arr[2] : [];
    const groups: AdjunctGroup[] = groupsIn
        .filter((g: any) => Array.isArray(g) && g.length >= 2)
        .map((g: any): AdjunctGroup => [Number(g[0]), Array.isArray(g[1]) ? g[1] : []])
        // Group order is non-semantic; sort by typeId for a deterministic CID.
        .sort((a, b) => a[0] - b[0]);

    const animations = Array.isArray(arr[3]) ? arr[3] : [];
    const game = typeof arr[4] === 'number' ? arr[4] : 0;

    return [elevation, status, groups, animations, game];
}

/**
 * Strict structural gate for the CAS / import boundary. Throws ProtocolError
 * (`code: 'PROTOCOL_BLOCK'`) on shapes that would corrupt a CID or a load.
 * Narrow-out: rejects non-arrays, over-long arrays, and malformed adjunct groups.
 * Missing trailing slots are NOT errors (normalize fills them).
 */
export function validateBlockRaw(raw: any): void {
    if (!Array.isArray(raw)) {
        throw new ProtocolError('[block] raw is not an array', { code: 'PROTOCOL_BLOCK' });
    }
    if (raw.length > CANONICAL_BLOCK_ARITY) {
        throw new ProtocolError(
            `[block] raw has ${raw.length} slots, canonical arity is ${CANONICAL_BLOCK_ARITY}`,
            { code: 'PROTOCOL_BLOCK' },
        );
    }
    if (raw[0] != null && typeof raw[0] !== 'number') {
        throw new ProtocolError('[block] elevation (raw[0]) must be a number', { code: 'PROTOCOL_BLOCK' });
    }
    if (raw[1] != null && typeof raw[1] !== 'number') {
        throw new ProtocolError('[block] status (raw[1]) must be a number', { code: 'PROTOCOL_BLOCK' });
    }
    if (raw[2] != null) {
        if (!Array.isArray(raw[2])) {
            throw new ProtocolError('[block] adjuncts (raw[2]) must be an array', { code: 'PROTOCOL_BLOCK' });
        }
        for (const g of raw[2]) {
            if (!Array.isArray(g) || g.length < 2 || typeof g[0] !== 'number' || !Array.isArray(g[1])) {
                throw new ProtocolError('[block] each adjunct group must be [typeId:number, instances:array]', { code: 'PROTOCOL_BLOCK' });
            }
        }
    }
    if (raw[3] != null && !Array.isArray(raw[3])) {
        throw new ProtocolError('[block] animations (raw[3]) must be an array', { code: 'PROTOCOL_BLOCK' });
    }
    if (raw[4] != null && typeof raw[4] !== 'number') {
        throw new ProtocolError('[block] game (raw[4]) must be a number', { code: 'PROTOCOL_BLOCK' });
    }
}

/**
 * Deterministic string form: canonical JSON with recursively SORTED object keys.
 * Arrays keep order (block/adjunct/instance order is meaningful); only object
 * key order is normalized (animation clips and object-shaped instance rows have
 * keys whose insertion order is otherwise non-deterministic). `-0` folds to `0`
 * via JSON.stringify. This is the exact string whose UTF-8 bytes hash to the CID.
 */
export function canonicalBlockString(raw: any): string {
    return stableStringify(normalizeBlockRaw(raw));
}

/**
 * The bytes that get content-addressed: `canonicalBlockString` as UTF-8. Feed
 * straight into `world.ipfs.put(bytes)` to ingest a block into the CAS (第二期).
 * Same logical block → same string → same bytes → same CID.
 */
export function canonicalBlockBytes(raw: any): Uint8Array {
    return new TextEncoder().encode(canonicalBlockString(raw));
}

/** JSON.stringify with object keys sorted recursively (arrays keep order). */
function stableStringify(v: any): string {
    if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
    if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
    const keys = Object.keys(v).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}
