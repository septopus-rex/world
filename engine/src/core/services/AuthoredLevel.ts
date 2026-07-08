import { SceneProvider, BlockRaw } from './LocalDataSource';
import { validateBlockRaw } from '../protocol/BlockRaw';
import { ProtocolError } from '../errors';

/**
 * AuthoredLevel — an authored level as pure DATA: a set of block raws keyed by
 * coordinate + a spawn point + optional metadata. This is engine VOCABULARY;
 * the levels themselves (parkour / coaster JSON) are host content and live with
 * the client (`client/desktop/src/levels/*.level.json`), NOT in engine core.
 *
 * Replaces the old `core/levels/*.ts` generator modules, which were authored
 * CONTENT compiled into the engine — the "data is logic" violation the audit
 * flagged. A level is now a document any engine can load; the TS generators are
 * gone (their one-shot output was frozen into the JSON).
 *
 * Fits the block pipeline unchanged: `levelSceneProvider(level)` is a plain
 * SceneProvider (coord → raw with empty-block fallback), so LocalDataSource
 * overlays drafts / CAS publish works on level blocks like any other seed.
 */
export interface AuthoredLevel {
    format: 'septopus.world.level';
    version: 1;
    name: string;
    /** Player spawn for this level (Septopus block + block-local position/rotation). */
    start: {
        block: [number, number];
        position: [number, number, number];
        rotation: [number, number, number];
    };
    /** Optional: the globalFlags key the level's finish trigger sets. */
    completeFlag?: string;
    /** Authored blocks (absolute coords): inline `raw` OR a content reference
     *  `ref` (name/CID, resolved by the host's ContentResolver — P7). Anything
     *  off-list serves `fallback` (when declared) else the empty block. */
    blocks: Array<{ x: number; y: number; raw?: BlockRaw; ref?: string }>;
    /**
     * FALLBACK block template (P7): the block served for every coordinate this
     * level does NOT author — the "infinite standard ground" of an open world,
     * DECLARED in data instead of synthesized by host code (the retired
     * MockBlockData path). Inline raw or a `{ref}`; must be position-independent
     * (block-relative rule). Served as a fresh clone per coordinate. Absent →
     * the canonical empty block (previous behavior).
     */
    fallback?: BlockRaw | { ref: string };
    /**
     * COMPOSITION (full-data-migration.md P1 / (c)): pull OTHER level documents in
     * at an offset, and optionally merge extra adjunct groups into them. This makes
     * "hub + demo + relocated xianjian behind portals" (worldHubScene) pure DATA
     * instead of a TS builder. Own `blocks` win over includes; includes resolve in
     * order. RELIES on block-relative references (`adj_~_~_…`, block-local pos): the
     * offset only shifts the block KEYS, it does NOT rewrite content — so included
     * content must be position-independent (the relocatability contract).
     */
    include?: LevelInclude[];
}

/** One composition entry: a sub-level (resolved object OR a `ref` for the host
 *  ContentResolver), shifted by `offset`, with optional per-block overlay. */
export interface LevelInclude {
    /** The resolved sub-level document (alternative to `ref`). */
    level?: AuthoredLevel;
    /** Content reference (name/CID) to a sub-level, resolved by the host (P7). */
    ref?: string;
    /** Shift every sub-level block coord by [dx, dy]. Default [0, 0]. */
    offset?: [number, number];
    /** Extra adjunct groups merged into a block, keyed by POST-OFFSET `"x_y"`.
     *  Value = adjunct groups `[[typeId, rows], …]` appended to that block's raw[2]
     *  (e.g. an arrival anchor + a return portal). */
    overlay?: Record<string, Array<[number, any[]]>>;
}

/**
 * ContentResolver (P7) — the host's ref→content lookup: a name or CID resolves to
 * a level document or a block raw. Local-first hosts back it with imported JSON;
 * a networked host backs it with the CAS/IPFS router. The ENGINE never fetches —
 * refs are resolved eagerly at provider construction (deterministic, fails fast).
 */
export type ContentResolver = (ref: string) => AuthoredLevel | BlockRaw | null | undefined;

/** Canonical empty block served for any coordinate the level does not author. */
const EMPTY_BLOCK: BlockRaw = [0, 1, [], [], 0];

/**
 * Structural gate for level documents (import/boot boundary). Throws
 * ProtocolError on shapes that would corrupt a load; per-block raws are
 * checked with the canonical block validator.
 */
export function validateAuthoredLevel(level: any): asserts level is AuthoredLevel {
    if (level?.format !== 'septopus.world.level') {
        throw new ProtocolError(`[level] unrecognized format: ${String(level?.format)}`, { code: 'PROTOCOL_BLOCK' });
    }
    if (level.version !== 1) {
        throw new ProtocolError(`[level] unsupported version: ${String(level.version)}`, { code: 'PROTOCOL_BLOCK' });
    }
    if (!Array.isArray(level.blocks)) {
        throw new ProtocolError('[level] blocks is not an array', { code: 'PROTOCOL_BLOCK' });
    }
    const s = level.start;
    if (!s || !Array.isArray(s.block) || !Array.isArray(s.position)) {
        throw new ProtocolError('[level] start must carry block + position', { code: 'PROTOCOL_BLOCK' });
    }
    for (const b of level.blocks) {
        if (typeof b?.x !== 'number' || typeof b?.y !== 'number') {
            throw new ProtocolError('[level] each block needs numeric x/y', { code: 'PROTOCOL_BLOCK' });
        }
        // Unresolved ref form is tolerated here (resolveAuthoredLevel turns refs
        // into raws and re-validates); a block with NEITHER raw nor ref is broken.
        if (b.raw == null && typeof (b as any).ref !== 'string') {
            throw new ProtocolError('[level] each block needs `raw` or `ref`', { code: 'PROTOCOL_BLOCK' });
        }
        if (b.raw != null) validateBlockRaw(b.raw);
    }
    for (const inc of level.include ?? []) {
        if (!inc || typeof inc !== 'object' || (inc.level == null && typeof inc.ref !== 'string')) {
            throw new ProtocolError('[level] each include needs `level` or `ref`', { code: 'PROTOCOL_BLOCK' });
        }
        if (inc.level != null) validateAuthoredLevel(inc.level); // recursive (acyclic docs)
    }
    if (level.fallback != null && Array.isArray(level.fallback)) validateBlockRaw(level.fallback);
}

/**
 * Resolve every `ref` in a level document into a FULLY-RESOLVED copy (blocks,
 * includes — recursively — and the fallback), then validate it. Eager + one-shot:
 * refs are static content addresses; resolving up front keeps block serving
 * synchronous/deterministic and fails fast on a dangling ref. Ref'd sub-docs are
 * deep-cloned so shared registry entries are never aliased across levels.
 */
export function resolveAuthoredLevel(level: AuthoredLevel, resolve?: ContentResolver): AuthoredLevel {
    const need = (ref: string): any => {
        const hit = resolve?.(ref);
        if (hit == null) {
            throw new ProtocolError(`[level] unresolved content ref '${ref}'`, { code: 'PROTOCOL_BLOCK' });
        }
        return JSON.parse(JSON.stringify(hit));
    };
    const out: AuthoredLevel = {
        ...level,
        blocks: level.blocks.map((b) => (b.raw != null || b.ref == null)
            ? b
            : { x: b.x, y: b.y, raw: need(b.ref) as BlockRaw }),
        include: level.include?.map((inc) => ({
            ...inc,
            level: resolveAuthoredLevel((inc.level ?? need(inc.ref as string)) as AuthoredLevel, resolve),
        })),
        fallback: (level.fallback != null && !Array.isArray(level.fallback))
            ? (need((level.fallback as { ref: string }).ref) as BlockRaw)
            : level.fallback,
    };
    validateAuthoredLevel(out);
    return out;
}

/** Append adjunct groups into a CLONE of a block raw's raw[2], merging same-typeId
 *  groups (overlay: arrival anchor + return portal, etc.). Pure — never mutates the
 *  included source doc. */
function mergeGroups(raw: BlockRaw, groups: Array<[number, any[]]>): BlockRaw {
    const clone: any = JSON.parse(JSON.stringify(raw));
    const dst: any[] = Array.isArray(clone[2]) ? clone[2] : (clone[2] = []);
    for (const [typeId, rows] of groups) {
        const g = dst.find((grp: any) => grp[0] === typeId);
        if (g) g[1].push(...rows);
        else dst.push([typeId, rows]);
    }
    return clone;
}

/**
 * Resolve one block from a composed level: OWN blocks win, then each `include`
 * (sub-level shifted by `offset`, with optional per-block `overlay`). Recursion
 * lets a sub-level itself compose. Returns null when no doc authors the coord.
 * The offset only shifts block KEYS — content is carried verbatim, so it relies
 * on block-relative references to stay correct (P1).
 */
function findLevelBlock(
    level: AuthoredLevel, x: number, y: number,
    maps: WeakMap<AuthoredLevel, Map<string, BlockRaw>>,
): BlockRaw | null {
    let own = maps.get(level);
    if (!own) {
        own = new Map();
        for (const b of level.blocks) {
            if (b.raw != null) own.set(`${b.x}_${b.y}`, b.raw);
        }
        maps.set(level, own);
    }
    const hit = own.get(`${x}_${y}`);
    if (hit) return hit;
    for (const inc of level.include ?? []) {
        const [dx, dy] = inc.offset ?? [0, 0];
        const sub = findLevelBlock(inc.level as AuthoredLevel, x - dx, y - dy, maps);
        if (sub) {
            const ov = inc.overlay?.[`${x}_${y}`];
            return ov && ov.length ? mergeGroups(sub, ov) : sub;
        }
    }
    return null;
}

/**
 * A SceneProvider over a level document: authored raw for authored coords (own +
 * composed `include`s), the declared `fallback` template (fresh clone per coord)
 * elsewhere, else the canonical empty block. Refs are resolved eagerly via the
 * optional host ContentResolver; validates once up front.
 */
export function levelSceneProvider(level: AuthoredLevel, resolve?: ContentResolver): SceneProvider {
    const doc = resolveAuthoredLevel(level, resolve);
    const maps = new WeakMap<AuthoredLevel, Map<string, BlockRaw>>();
    const fallback = Array.isArray(doc.fallback) ? doc.fallback : null;
    return {
        block: (x: number, y: number) =>
            findLevelBlock(doc, x, y, maps)
            ?? (fallback ? (JSON.parse(JSON.stringify(fallback)) as BlockRaw) : EMPTY_BLOCK),
    };
}
