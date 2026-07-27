import { reportError, ProtocolError } from '../errors';

/**
 * WorldMetrics — the world's GEOMETRY, read from the world document.
 *
 * WHY THIS EXISTS (2026-07-27, world-schema-through):
 * Grid extent and block size used to be engine constants (`GlobalConfig.world`)
 * that a World copied into a MUTABLE STATIC (`Coords.BLOCK_SIZE`). Two things
 * were wrong with that:
 *   1. A class static is process-global — every extra World (vitest cases, the
 *      block-preview loader, the stylepack editor) overwrote the previous one's
 *      geometry, so whichever constructed last won.
 *   2. Nothing could ever come from DATA: a chain-served world document had no
 *      way to declare its own grid, which is exactly what Septopus world
 *      configuration management needs.
 * So geometry is now an immutable per-World OBJECT built from `config.world`.
 * Engine code must never hardcode 4096 / 16 again — go through `world.metrics`.
 *
 * PROTOCOL: `range`/`block`/`diff` are per-world MUTABLE config (world.md §1);
 * the constants below are only the defaults a document may omit. `max` (96
 * worlds) stays a metaverse-level constant in GlobalConfig — it is not a
 * property of any single world.
 */

/** Septopus axis order: [East(X), North(Y), Alt(Z)]. */
export type Vec3 = [number, number, number];

/** Protocol DEFAULTS — what a world document that declares nothing gets. */
export const PROTOCOL_DEFAULT_RANGE: [number, number] = [4096, 4096];
export const PROTOCOL_DEFAULT_BLOCK: Vec3 = [16, 16, 16];
export const PROTOCOL_DEFAULT_DIFF = 0.1;

/**
 * Sanity bounds. NOT protocol semantics — these only stop a corrupt or hostile
 * document (chain-served config is untrusted input) from producing NaN
 * coordinates or an allocation-sized grid. Values outside fall back to the
 * protocol default and are reported.
 */
const MAX_RANGE_PER_AXIS = 1 << 20;   // 1,048,576 blocks/axis
const MIN_BLOCK_METRES = 0.01;
const MAX_BLOCK_METRES = 1024;

export interface WorldGeometryInit {
    /** Block count per axis [East, North]; blocks are numbered from [1,1]. */
    range?: [number, number];
    /** One block's size in metres, Septopus axis order [East, North, Alt]. */
    block?: Vec3;
    /** Height granularity in metres. */
    diff?: number;
}

export class WorldMetrics {
    /** Block count per axis [East, North]. */
    readonly range: readonly [number, number];
    /** Block size in metres [East, North, Alt]. */
    readonly block: readonly [number, number, number];
    /** Height granularity in metres. */
    readonly diff: number;

    /** East–west extent of one block (metres) — engine X. */
    get blockWidth(): number { return this.block[0]; }
    /** North–south extent of one block (metres) — engine Z. */
    get blockLength(): number { return this.block[1]; }
    /** Vertical extent of one block (metres) — engine Y. */
    get blockHeight(): number { return this.block[2]; }

    constructor(init: WorldGeometryInit = {}) {
        this.range = validateRange(init.range);
        this.block = validateBlock(init.block);
        this.diff = validateDiff(init.diff, this.block[2]);
    }

    /** Build from a world document's `world` section (extra fields ignored). */
    static from(worldSection: any): WorldMetrics {
        return new WorldMetrics({
            range: worldSection?.range,
            block: worldSection?.block,
            diff: worldSection?.diff,
        });
    }

    /**
     * Septopus (Z-up, block-relative) → Engine (Y-up).
     * Septopus: [X=East, Y=North, Z=Alt] within block [bx, by], origin at the
     * block's SOUTH-WEST corner. Engine: [X=East, Y=Alt, Z=-North].
     *
     * Each horizontal axis uses ITS OWN block extent — the old static used the
     * width for both, which silently mislocated every block on a non-square grid.
     */
    septopusToEngine(septopusPos: Vec3, septopusBlock: [number, number]): Vec3 {
        return [
            (septopusBlock[0] - 1) * this.blockWidth + septopusPos[0],
            septopusPos[2],
            -((septopusBlock[1] - 1) * this.blockLength + septopusPos[1]),
        ];
    }

    /** Engine (Y-up) → Septopus (Z-up): which block, and where inside it. */
    engineToSeptopus(enginePos: Vec3): { block: [number, number]; pos: Vec3 } {
        const bx = Math.floor(enginePos[0] / this.blockWidth) + 1;
        const septopusYGlobal = -enginePos[2];
        const by = Math.floor(septopusYGlobal / this.blockLength) + 1;

        return {
            block: [bx, by],
            pos: [
                enginePos[0] - (bx - 1) * this.blockWidth,
                septopusYGlobal - (by - 1) * this.blockLength,
                enginePos[1],
            ],
        };
    }

    /** Engine-space position of a block's SOUTH-WEST corner (its local origin). */
    blockOrigin(bx: number, by: number): Vec3 {
        return this.septopusToEngine([0, 0, 0], [bx, by]);
    }

    /** Engine-space horizontal centre of a block (Alt = 0). */
    blockCentre(bx: number, by: number): Vec3 {
        return this.septopusToEngine([this.blockWidth / 2, this.blockLength / 2, 0], [bx, by]);
    }

    /** Is [bx, by] inside the world grid? Blocks are 1-based, [1,1]..range. */
    containsBlock(bx: number, by: number): boolean {
        return Number.isInteger(bx) && Number.isInteger(by)
            && bx >= 1 && bx <= this.range[0]
            && by >= 1 && by <= this.range[1];
    }

    /** Block-space coordinate of the grid centre — the default map/spawn focus. */
    centreBlock(): [number, number] {
        return [Math.floor(this.range[0] / 2), Math.floor(this.range[1] / 2)];
    }
}

/** The protocol-default geometry — for tooling with no world in hand. */
export const DEFAULT_METRICS = new WorldMetrics();

// ── validation ───────────────────────────────────────────────────────────────

function warn(field: string, got: unknown, fallback: unknown): void {
    reportError(
        new ProtocolError(
            `world.${field} is invalid (${JSON.stringify(got)}) — falling back to ${JSON.stringify(fallback)}`,
            { code: 'PROTOCOL_BLOCK' }
        ),
        { tag: '[WorldMetrics]', severity: 'warn' }
    );
}

function validateRange(v: unknown): [number, number] {
    if (v === undefined) return [...PROTOCOL_DEFAULT_RANGE];
    const ok = Array.isArray(v) && v.length === 2
        && v.every((n) => Number.isInteger(n) && n >= 1 && n <= MAX_RANGE_PER_AXIS);
    if (!ok) { warn('range', v, PROTOCOL_DEFAULT_RANGE); return [...PROTOCOL_DEFAULT_RANGE]; }
    return [(v as number[])[0], (v as number[])[1]];
}

function validateBlock(v: unknown): Vec3 {
    if (v === undefined) return [...PROTOCOL_DEFAULT_BLOCK];
    const ok = Array.isArray(v) && v.length === 3
        && v.every((n) => Number.isFinite(n) && n >= MIN_BLOCK_METRES && n <= MAX_BLOCK_METRES);
    if (!ok) { warn('block', v, PROTOCOL_DEFAULT_BLOCK); return [...PROTOCOL_DEFAULT_BLOCK]; }
    return [(v as number[])[0], (v as number[])[1], (v as number[])[2]];
}

function validateDiff(v: unknown, blockHeight: number): number {
    if (v === undefined) return PROTOCOL_DEFAULT_DIFF;
    if (!Number.isFinite(v as number) || (v as number) <= 0 || (v as number) > blockHeight) {
        warn('diff', v, PROTOCOL_DEFAULT_DIFF);
        return PROTOCOL_DEFAULT_DIFF;
    }
    return v as number;
}
