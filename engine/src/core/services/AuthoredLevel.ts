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
    /** Player spawn for this level (SPP block + block-local position/rotation). */
    start: {
        block: [number, number];
        position: [number, number, number];
        rotation: [number, number, number];
    };
    /** Optional: the globalFlags key the level's finish trigger sets. */
    completeFlag?: string;
    /** Authored blocks (absolute coords). Anything off-list is an empty block. */
    blocks: Array<{ x: number; y: number; raw: BlockRaw }>;
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
}

/**
 * A SceneProvider over a level document: authored raw for authored coords,
 * empty block elsewhere. Validates once up front.
 */
export function levelSceneProvider(level: AuthoredLevel): SceneProvider {
    validateAuthoredLevel(level);
    const byCoord = new Map<string, BlockRaw>();
    for (const b of level.blocks) byCoord.set(`${b.x}_${b.y}`, b.raw);
    return {
        block: (x: number, y: number) => byCoord.get(`${x}_${y}`) ?? EMPTY_BLOCK,
    };
}
