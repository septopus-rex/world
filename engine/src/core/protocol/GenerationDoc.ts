/**
 * GenerationDoc v0 — the SHARED CONTRACT between the AI gateway and the client
 * for LLM-authored world content (spec docs/plan/specs/ai-authoring.md §3).
 *
 * An LLM never emits code and never emits final block raw: it emits THIS
 * document — a list of parameterized generator calls (compiled to c2 motif
 * source rows, whose expansion is deterministic and budget-exempt) plus a few
 * whitelisted direct adjunct rows. `compileGenerationDoc` turns a VALIDATED
 * doc into a canonical 5-slot block raw that goes through the exact same
 * inject chokepoints as human-authored content (finite gate, block.max,
 * scene-collision guard) — no side doors.
 *
 * This file is imported by BOTH the engine/client and services/ai-gateway, so
 * the two ends can never drift: one schema, one validator, two callers.
 * Pure data + functions — no Three.js, no network, no engine internals.
 */
import { AdjunctType } from '../types/AdjunctType';
import { getMotifTemplate } from '../motif/MotifTemplates';

export interface GenPieceGenerator {
    kind: 'generator';
    /** Motif template id — the AI-callable catalog (house / road / building / …). */
    name: string;
    /** SPP meters relative to the block origin (X east, Y north, Z up). */
    origin: [number, number, number];
    /** Optional per-piece seed; defaults to doc.seed + pieceIndex. */
    seed?: number;
    params?: Record<string, any> | null;
}

export interface GenPieceAdjunct {
    kind: 'adjunct';
    typeId: number;
    /** One standard raw row for that adjunct type. */
    raw: any[];
}

export type GenPiece = GenPieceGenerator | GenPieceAdjunct;

export interface GenerationDoc {
    version: 0;
    target: { world?: string; block: [number, number] };
    seed: number;
    /** One-sentence human summary — the plan card headline. */
    summary?: string;
    pieces: GenPiece[];
    /** block.game head flag (playable zone marker). */
    game?: 0 | 1;
}

export interface GenError { code: string; path: string; msg: string }

/** Direct-row types an LLM may emit. Sources that expand (b6/c2) and types
 *  needing external resources (module/track/audio/video) are excluded — the
 *  generator catalog is the only expansion channel for AI content. */
export const GEN_ADJUNCT_WHITELIST: ReadonlySet<number> = new Set([
    AdjunctType.Wall, AdjunctType.Box, AdjunctType.Light, AdjunctType.Water,
    AdjunctType.Cone, AdjunctType.Ball, AdjunctType.Stop, AdjunctType.Item,
    AdjunctType.Trigger, AdjunctType.Spawner, AdjunctType.Npc, AdjunctType.Link,
]);

export const GEN_LIMITS = {
    maxPieces: 24,
    maxParamsJson: 2000,
    maxRawJson: 2000,
} as const;

const isInt = (v: any) => typeof v === 'number' && Number.isInteger(v);
const isFiniteNum = (v: any) => typeof v === 'number' && Number.isFinite(v);

/** Validate an untrusted GenerationDoc. Returns error list (empty = valid).
 *  Error codes are STABLE — the gateway feeds them back to the LLM verbatim
 *  for the retry loop, and tests pin them. */
export function validateGenerationDoc(doc: any): GenError[] {
    const errs: GenError[] = [];
    const err = (code: string, path: string, msg: string) => errs.push({ code, path, msg });

    if (!doc || typeof doc !== 'object') return [{ code: 'doc', path: '$', msg: 'not an object' }];
    if (doc.version !== 0) err('version', '$.version', 'must be 0');
    const blk = doc.target?.block;
    if (!Array.isArray(blk) || blk.length !== 2 || !isInt(blk[0]) || !isInt(blk[1])
        || blk[0] < 1 || blk[0] > 4096 || blk[1] < 1 || blk[1] > 4096) {
        err('target', '$.target.block', 'must be [x,y] integers in 1..4096');
    }
    if (!isInt(doc.seed) || doc.seed < 0) err('seed', '$.seed', 'must be a non-negative integer');
    if (doc.game !== undefined && doc.game !== 0 && doc.game !== 1) err('game', '$.game', 'must be 0 or 1');

    if (!Array.isArray(doc.pieces) || doc.pieces.length < 1) {
        err('pieces.count', '$.pieces', 'must be a non-empty array');
        return errs;
    }
    if (doc.pieces.length > GEN_LIMITS.maxPieces) {
        err('pieces.count', '$.pieces', `at most ${GEN_LIMITS.maxPieces} pieces`);
    }

    doc.pieces.forEach((p: any, i: number) => {
        const at = `$.pieces[${i}]`;
        if (p?.kind === 'generator') {
            if (typeof p.name !== 'string' || !getMotifTemplate(p.name)) {
                err('gen.name', `${at}.name`, `unknown generator '${p?.name}' — use /v0/catalog ids`);
            }
            const o = p.origin;
            if (!Array.isArray(o) || o.length !== 3 || !o.every(isFiniteNum)
                || o[0] < 0 || o[0] > 16 || o[1] < 0 || o[1] > 16 || o[2] < 0 || o[2] > 32) {
                err('gen.origin', `${at}.origin`, 'must be [x,y,z], x/y in 0..16, z in 0..32 (block-local meters)');
            }
            if (p.seed !== undefined && (!isInt(p.seed) || p.seed < 0)) err('gen.seed', `${at}.seed`, 'must be a non-negative integer');
            if (p.params != null) {
                if (typeof p.params !== 'object' || Array.isArray(p.params)) err('gen.params', `${at}.params`, 'must be an object');
                else if (JSON.stringify(p.params).length > GEN_LIMITS.maxParamsJson) err('gen.params', `${at}.params`, 'params too large');
            }
        } else if (p?.kind === 'adjunct') {
            if (!GEN_ADJUNCT_WHITELIST.has(p.typeId)) {
                err('adj.typeId', `${at}.typeId`, `typeId ${p?.typeId} not allowed for direct rows`);
            }
            if (!Array.isArray(p.raw) || p.raw.length < 1 || JSON.stringify(p.raw ?? null)?.length > GEN_LIMITS.maxRawJson) {
                err('adj.raw', `${at}.raw`, 'must be one standard raw row (array), bounded size');
            }
        } else {
            err('piece.kind', `${at}.kind`, "must be 'generator' or 'adjunct'");
        }
    });
    return errs;
}

/** Compile a VALIDATED doc into a canonical 5-slot block raw
 *  [elevation, status, groups, animations, game]. Generator pieces become c2
 *  motif source rows (deterministic expansion, derived pieces budget-exempt);
 *  direct pieces group by typeId. Groups sort ascending by typeId (canonical
 *  order, BlockRaw.ts). */
export function compileGenerationDoc(doc: GenerationDoc): any[] {
    const byType = new Map<number, any[][]>();
    const push = (typeId: number, row: any[]) => {
        if (!byType.has(typeId)) byType.set(typeId, []);
        byType.get(typeId)!.push(row);
    };
    doc.pieces.forEach((p, i) => {
        if (p.kind === 'generator') {
            push(AdjunctType.Motif, [p.origin, p.name, p.seed ?? (doc.seed + i), p.params ?? null]);
        } else {
            push(p.typeId, p.raw);
        }
    });
    const groups = [...byType.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([typeId, rows]) => [typeId, rows]);
    return [0, 1, groups, [], doc.game === 1 ? 1 : 0];
}
