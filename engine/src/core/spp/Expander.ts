/**
 * SPP expander (M1) — the pure function that turns a string-particle
 * definition into STANDARD adjunct raw rows (a1 walls + b8 triggers).
 *
 * Everything downstream is the normal engine pipeline: each emitted row
 * becomes its own entity with its own collision/trigger semantics. The
 * expander is deterministic (no randomness, no wall clock) — same input,
 * identical output, snapshot-testable.
 *
 *   expandSpp([origin, cells, theme]) → [typeId, rawRow][]
 *
 * v1 constraints (spec: docs/plan/specs/spp-integration.md):
 *   - no cell rotation (engine collision is AABB-only)
 *   - adjacency elimination is same-level only
 */
import { ParticleFace, FaceState, SubdivisionLevel } from '../types/ParticleCell';
import { AdjunctType } from '../types/AdjunctType';
import { getSppTheme, getVariant, getStyleOverride, VariantPart, FaceVariant, SppTheme } from './Variants';
import { makeRng } from '../motif/Rng';
import './CoasterTheme'; // side-effect: registers the 'coaster' theme (cells → c1 track)
import type { TriggerLogicNode } from '../types/Trigger';

/** Compact authored cell (raw form — see spec §数据格式). */
export interface SppCell {
    position: [number, number, number];        // grid coords, stride = cell size
    level: SubdivisionLevel;
    /** [state, variantRef] per face, indexed by ParticleFace (Top..Right) — the
     *  RESOLVED form. `variantRef` is a stable string KEY (P4, preferred) or a
     *  legacy numeric index. Missing/null entries default to [Closed, 0] (solid)
     *  at the top level, or INHERIT the parent face inside a refinement. */
    faces?: Array<[number, number | string] | null>;
    /** SUPERPOSITION (protocol faceOptions): per face, a LIST of candidate
     *  [state, variantRef] options. When `faces` is absent, the expander collapses
     *  each face deterministically (mulberry32 seeded by block+cell+face) down
     *  to one option. An empty/absent list for a face → [Closed, 0]. */
    faceOptions?: Array<Array<[number, number | string]>>;
    /**
     * REFINEMENT (protocol §3.2.5): a nested finer grid that defines this cell's
     * INTERIOR. Child cells are at level+1 (half size), positioned in the parent's
     * local 2×2×2 grid (0/1 per axis). When present (and within LOD depth), this
     * cell emits NO geometry of its own — the children own it (finer-owns-plane).
     * Each child inherits the parent's resolved face on its boundary sides and
     * defaults interior faces to Open; a child MAY override any face. `faces`
     * entries may be null to inherit per-face.
     */
    refinement?: { cells: SppCell[] };
    trigger?: TriggerLogicNode[];
}

export type SppRaw = [origin: [number, number, number], cells: SppCell[], theme: string];

export type ExpandedRow = [typeId: number, raw: any[]];

/** Where an SPP source sits + LOD knobs. `maxLevel` gates refinement depth
 *  (deeper children are not expanded — the coarser parent renders instead);
 *  `budget` caps derived rows (graceful coarse fallback + a logged truncation).
 *  Neither affects the canonical source/CID — they are runtime LOD only
 *  (spp-protocol-full.md §3.D / spp-recursive-refinement.md §4). */
export interface ExpandContext { blockX?: number; blockY?: number; maxLevel?: number; budget?: number; }

const FACES: ParticleFace[] = [
    ParticleFace.Top, ParticleFace.Bottom,
    ParticleFace.Front, ParticleFace.Back,
    ParticleFace.Left, ParticleFace.Right,
];

/** Positive-direction faces own shared planes (adjacency elimination). */
const NEGATIVE_FACE_DIR: Partial<Record<ParticleFace, [number, number, number]>> = {
    [ParticleFace.Left]: [-1, 0, 0],    // X-
    [ParticleFace.Front]: [0, -1, 0],   // Y-
    [ParticleFace.Bottom]: [0, 0, -1],  // Z-
};

/** Grid direction of every face (for cross-layer finer-owns suppression). */
const FACE_DIR: Record<ParticleFace, [number, number, number]> = {
    [ParticleFace.Top]: [0, 0, 1], [ParticleFace.Bottom]: [0, 0, -1],
    [ParticleFace.Front]: [0, -1, 0], [ParticleFace.Back]: [0, 1, 0],
    [ParticleFace.Left]: [-1, 0, 0], [ParticleFace.Right]: [1, 0, 0],
};

/** Is a refinement child's face F on the parent's boundary (vs an interior face
 *  shared with a sibling)? A child at local grid position `p` (0/1 per axis) is
 *  on the parent's low side of an axis when p==0, high side when p==1. */
function isBoundaryFace(face: ParticleFace, p: [number, number, number]): boolean {
    switch (face) {
        case ParticleFace.Top: return p[2] === 1;
        case ParticleFace.Bottom: return p[2] === 0;
        case ParticleFace.Front: return p[1] === 0;
        case ParticleFace.Back: return p[1] === 1;
        case ParticleFace.Left: return p[0] === 0;
        case ParticleFace.Right: return p[0] === 1;
    }
}

function cellSize(level: SubdivisionLevel): number {
    return 4 * Math.pow(0.5, level);
}

function faceConfig(cell: SppCell, face: ParticleFace): [FaceState, number | string] {
    const entry = cell.faces?.[face];
    if (!entry) return [FaceState.Closed, 0];
    return [entry[0] as FaceState, entry[1] ?? 0];
}

/** Deterministic seed for collapsing one face — mixes block coords + cell index
 *  + face index (protocol determinism pin, spp-protocol-full.md §5.1). FNV-1a
 *  style so nearby cells/faces do not correlate. */
function collapseSeed(bx: number, by: number, cellIdx: number, faceIdx: number): number {
    let h = 2166136261 >>> 0;
    for (const v of [bx | 0, by | 0, cellIdx | 0, faceIdx | 0]) {
        h = (h ^ ((v + 0x9e3779b9) >>> 0)) >>> 0;
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

/** Collapse a face's superposition (candidate list) to one resolved option.
 *  0 candidates → solid [Closed,0]; 1 → that one (no RNG); N → mulberry32 pick. */
function collapseFace(options: Array<[number, number | string]> | undefined, seed: number): [number, number | string] {
    if (!Array.isArray(options) || options.length === 0) return [FaceState.Closed, 0];
    if (options.length === 1) return [options[0][0], options[0][1] ?? 0];
    const idx = Math.floor(makeRng(seed)() * options.length) % options.length;
    const chosen = options[idx];
    return [chosen[0], chosen[1] ?? 0];
}

const faceEntry = (e: [number, number | string] | null | undefined): [number, number | string] =>
    e ? [e[0], e[1] ?? 0] : [FaceState.Closed, 0];

/**
 * Resolve a cell to its final 6-entry `faces` array:
 *   1. base = authored `faces` (each may be null) OR the deterministic collapse
 *      of `faceOptions`, if either is present;
 *   2. any face still unset (null/absent) either INHERITS from the parent (inside
 *      a refinement — boundary faces take the parent's face, interior faces
 *      default Open) or defaults solid (top level).
 */
function resolveFaces(
    cell: SppCell, bx: number, by: number, cellIdx: number,
    parent?: { faces: Array<[number, number | string] | null> | undefined; localPos: [number, number, number] },
): Array<[number, number | string]> {
    let base: Array<[number, number | string] | null | undefined> | undefined;
    if (Array.isArray(cell.faces)) base = cell.faces;
    else if (Array.isArray(cell.faceOptions)) {
        base = [];
        for (let f = 0; f < 6; f++) base[f] = collapseFace(cell.faceOptions[f], collapseSeed(bx, by, cellIdx, f));
    }
    const out: Array<[number, number | string]> = [];
    for (let f = 0; f < 6; f++) {
        const own = base?.[f];
        if (own) { out[f] = [own[0], own[1] ?? 0]; continue; }
        if (parent) {
            out[f] = isBoundaryFace(f as ParticleFace, parent.localPos)
                ? faceEntry(parent.faces?.[f])   // boundary → inherit the parent's face
                : [FaceState.Open, 0];            // interior → default connected
        } else {
            out[f] = [FaceState.Closed, 0];       // top level → default solid
        }
    }
    return out;
}

/**
 * Map a face-local PART into an SPP-space box (center + full size, meters,
 * relative to the CELL origin corner). u/v are the face's in-plane axes; w is
 * inward depth from the face plane. A legacy piece = a part at w=0 with
 * depth = the theme thickness (so `pieceToBox` is the w=0/sw=t special case).
 */
function partToBox(face: ParticleFace, part: VariantPart, s: number, thickness: number): { size: [number, number, number]; center: [number, number, number] } {
    const uC = (part.u + part.su / 2) * s, sum = part.su * s;
    const vC = (part.v + part.sv / 2) * s, svm = part.sv * s;
    const swm = part.sw != null ? part.sw * s : thickness;         // inward depth size
    const wC = (part.w ?? 0) * s + swm / 2;                        // inward depth center
    switch (face) {
        case ParticleFace.Left:    // X- plane: u→Y, v→Z, w→+X
            return { size: [swm, sum, svm], center: [wC, uC, vC] };
        case ParticleFace.Right:   // X+ : w→−X
            return { size: [swm, sum, svm], center: [s - wC, uC, vC] };
        case ParticleFace.Front:   // Y- plane: u→X, v→Z, w→+Y
            return { size: [sum, swm, svm], center: [uC, wC, vC] };
        case ParticleFace.Back:    // Y+
            return { size: [sum, swm, svm], center: [uC, s - wC, vC] };
        case ParticleFace.Bottom:  // Z- plane: u→X, v→Y, w→+Z
            return { size: [sum, svm, swm], center: [uC, vC, wC] };
        case ParticleFace.Top:     // Z+
            return { size: [sum, svm, swm], center: [uC, vC, s - wC] };
    }
}

/**
 * A variant's parts — either its explicit `parts` (composition), or its legacy
 * a1 `pieces` lifted to a1-wall parts (carrying the theme's texture/colour).
 */
function variantParts(variant: FaceVariant, theme: SppTheme): VariantPart[] {
    if (variant.parts) return variant.parts;
    const wallProps: any[] = [theme.texture ?? 0, [1, 1], 0, 1, ...(theme.color != null ? [theme.color] : [])];
    return (variant.pieces ?? []).map(p => ({
        type: AdjunctType.Wall, u: p.du, v: p.dv, su: p.su, sv: p.sv, props: wallProps,
    }));
}

interface ChunkOpts {
    theme: import('./Variants').SppTheme;
    bx: number; by: number;
    maxLevel: number;
    budget: number;
    truncated: boolean;
    seq: number; // running cell counter → stable collapse seeding across the whole tree
}

const posKey = (level: number, gx: number, gy: number, gz: number) => `${level}:${gx},${gy},${gz}`;

/** Emit one leaf cell's face geometry (walls or theme geometry) into `rows`. */
function emitLeaf(
    cell: SppCell & { faces: Array<[number, number | string]> }, cellOrigin: [number, number, number], s: number,
    occupied: Set<string>, refinedAt: Set<string>, opts: ChunkOpts, rows: ExpandedRow[],
): void {
    const theme = opts.theme;
    if (theme.expandCell) {
        rows.push(...theme.expandCell(cell, cellOrigin, s));
        return;
    }
    const [gx, gy, gz] = cell.position;
    for (const face of FACES) {
        // Cross-layer finer-owns: if the same-level neighbour on this side is
        // itself refined, IT owns the shared plane (its children emit it) — skip.
        const fd = FACE_DIR[face];
        if (refinedAt.has(posKey(cell.level, gx + fd[0], gy + fd[1], gz + fd[2]))) continue;
        // Same-level adjacency: the NEGATIVE face is skipped when a neighbour
        // adjoins it (the positive-side cell owns the shared plane).
        const nd = NEGATIVE_FACE_DIR[face];
        if (nd && occupied.has(posKey(cell.level, gx + nd[0], gy + nd[1], gz + nd[2]))) continue;

        const [state, variantId] = faceConfig(cell, face);
        const variant = getVariant(theme, state, variantId);
        if (!variant) continue;
        for (const part of variantParts(variant, theme)) {
            const { size, center } = partToBox(face, part, s, theme.thickness);
            // Emitted raw = [size, pos, rot, ...props]; props is the type-specific
            // tail (a1 wall: [resource,repeat,anim,stop,color]; b4 stop: [stopMode,anim]; …).
            rows.push([part.type, [
                size,
                [cellOrigin[0] + center[0], cellOrigin[1] + center[1], cellOrigin[2] + center[2]],
                part.rot ?? [0, 0, 0],
                ...(part.props ?? []),
            ]]);
        }
    }
}

/**
 * Expand one chunk of sibling cells at `chunkOrigin`. `parentFaces` (when this
 * chunk is a refinement) drives per-child face inheritance. Recurses into each
 * cell's `refinement` — a refined cell emits NO geometry of its own; its
 * children own its planes (finer-owns). Gated by LOD `maxLevel` + row `budget`.
 */
function expandChunk(
    cells: SppCell[], chunkOrigin: [number, number, number],
    parentFaces: Array<[number, number | string]> | null, opts: ChunkOpts, rows: ExpandedRow[],
): void {
    // Same-level indices for this sibling set: occupancy + which will refine.
    const occupied = new Set<string>();
    const refinedAt = new Set<string>();
    for (const c of cells) {
        const [x, y, z] = c.position;
        occupied.add(posKey(c.level, x, y, z));
        if (c.refinement && Array.isArray(c.refinement.cells) && c.level < opts.maxLevel) {
            refinedAt.add(posKey(c.level, x, y, z));
        }
    }

    for (const rawCell of cells) {
        const localPos = rawCell.position;
        const faces = resolveFaces(rawCell, opts.bx, opts.by, opts.seq++, parentFaces ? { faces: parentFaces, localPos } : undefined);
        const cell = { ...rawCell, faces } as SppCell & { faces: Array<[number, number | string]> };
        const s = cellSize(cell.level);
        const [gx, gy, gz] = cell.position;
        const cellOrigin: [number, number, number] = [
            chunkOrigin[0] + gx * s, chunkOrigin[1] + gy * s, chunkOrigin[2] + gz * s,
        ];

        const canRefine = !!rawCell.refinement && Array.isArray(rawCell.refinement.cells);
        if (canRefine && cell.level >= opts.maxLevel) {
            // LOD floor reached — render this cell coarse (a valid LOD, faces already
            // carry the region's boundary interface). Fall through to emitLeaf.
            emitLeaf(cell, cellOrigin, s, occupied, refinedAt, opts, rows);
        } else if (canRefine && rows.length >= opts.budget) {
            opts.truncated = true; // budget hit → coarse fallback (no silent cap)
            emitLeaf(cell, cellOrigin, s, occupied, refinedAt, opts, rows);
        } else if (canRefine) {
            // Delegate geometry to the finer children (they inherit `faces`).
            expandChunk(rawCell.refinement!.cells, cellOrigin, faces, opts, rows);
        } else {
            emitLeaf(cell, cellOrigin, s, occupied, refinedAt, opts, rows);
        }

        // A cell's trigger fills its whole volume — emitted whether leaf or refined.
        if (rawCell.trigger && rawCell.trigger.length > 0) {
            rows.push([AdjunctType.Trigger, [
                [s, s, s],
                [cellOrigin[0] + s / 2, cellOrigin[1] + s / 2, cellOrigin[2] + s / 2],
                [0, 0, 0], 1, 0, rawCell.trigger,
            ]]);
        }
    }
}

/**
 * Expand one b6 SPP raw row into standard adjunct rows.
 * Walls: a1 [size, pos, rot, texture, repeat, animation, stop=1].
 * Cell triggers: b8 [size, offset, rot, shape=1, gameOnly=0, events].
 * Recursive: cells may carry a `refinement` (nested finer chunk); LOD is gated
 * by ctx.maxLevel / ctx.budget (runtime-only, not part of the source/CID).
 */
export function expandSpp(raw: SppRaw, ctx: ExpandContext = {}): ExpandedRow[] {
    const [origin, cells, themeId] = raw;
    // Unresolved theme (e.g. an external StylePack CID not yet registered) falls
    // back to `basic` so the structure still renders — the "placeholder → swap"
    // path: re-expanding after the pack loads swaps in the real style.
    const requested = getSppTheme(themeId ?? 'basic') ?? getSppTheme('basic');
    // World restyle: a style override swaps VISUAL themes wholesale, but leaves
    // STRUCTURAL themes (expandCell, e.g. coaster) alone — you can recolour a
    // building, not turn a coaster into brick walls.
    const override = getStyleOverride();
    const theme = (override && requested && !requested.expandCell)
        ? (getSppTheme(override) ?? requested)
        : requested;
    if (!theme || !Array.isArray(cells)) return [];

    const opts: ChunkOpts = {
        theme, bx: ctx.blockX ?? 0, by: ctx.blockY ?? 0,
        maxLevel: ctx.maxLevel ?? Infinity, budget: ctx.budget ?? Infinity,
        truncated: false, seq: 0,
    };
    const rows: ExpandedRow[] = [];
    expandChunk(cells, origin, null, opts, rows);
    if (opts.truncated) {
        // No silent caps — the budget clipped deeper refinements to coarse.
        // eslint-disable-next-line no-console
        console.warn(`[spp] expansion hit the ${ctx.budget}-row budget; deeper refinements rendered coarse`);
    }
    return rows;
}

/** @deprecated Renamed to `expandSpp` (2026-07-06). Kept as an alias. */
export const expandParticle = expandSpp;
