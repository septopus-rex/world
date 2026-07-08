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
    /** Authored blocks (absolute coords). Anything off-list is an empty block. */
    blocks: Array<{ x: number; y: number; raw: BlockRaw }>;
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

/** One composition entry: a resolved sub-level, shifted by `offset`, with optional
 *  per-block overlay. The HOST resolves `ref`/CID → the level document (the engine
 *  holds no content), exactly as DesktopLoader imports xianjianLevelJson. */
export interface LevelInclude {
    /** The resolved sub-level document (host resolves name/CID → this). */
    level: AuthoredLevel;
    /** Shift every sub-level block coord by [dx, dy]. Default [0, 0]. */
    offset?: [number, number];
    /** Extra adjunct groups merged into a block, keyed by POST-OFFSET `"x_y"`.
     *  Value = adjunct groups `[[typeId, rows], …]` appended to that block's raw[2]
     *  (e.g. an arrival anchor + a return portal). */
    overlay?: Record<string, Array<[number, any[]]>>;
}

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
        validateBlockRaw(b.raw);
    }
    for (const inc of level.include ?? []) {
        if (!inc || typeof inc !== 'object' || inc.level == null) {
            throw new ProtocolError('[level] each include needs a resolved `level`', { code: 'PROTOCOL_BLOCK' });
        }
        validateAuthoredLevel(inc.level); // recursive (host composes acyclic docs)
    }
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
        for (const b of level.blocks) own.set(`${b.x}_${b.y}`, b.raw);
        maps.set(level, own);
    }
    const hit = own.get(`${x}_${y}`);
    if (hit) return hit;
    for (const inc of level.include ?? []) {
        const [dx, dy] = inc.offset ?? [0, 0];
        const sub = findLevelBlock(inc.level, x - dx, y - dy, maps);
        if (sub) {
            const ov = inc.overlay?.[`${x}_${y}`];
            return ov && ov.length ? mergeGroups(sub, ov) : sub;
        }
    }
    return null;
}

/**
 * A SceneProvider over a level document: authored raw for authored coords (own +
 * composed `include`s), empty block elsewhere. Validates once up front.
 */
export function levelSceneProvider(level: AuthoredLevel): SceneProvider {
    validateAuthoredLevel(level);
    const maps = new WeakMap<AuthoredLevel, Map<string, BlockRaw>>();
    return {
        block: (x: number, y: number) => findLevelBlock(level, x, y, maps) ?? EMPTY_BLOCK,
    };
}
