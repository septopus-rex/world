/**
 * SPP expander (M1) — the pure function that turns a string-particle
 * definition into STANDARD adjunct raw rows (a1 walls + b8 triggers).
 *
 * Everything downstream is the normal engine pipeline: each emitted row
 * becomes its own entity with its own collision/trigger semantics. The
 * expander is deterministic (no randomness, no wall clock) — same input,
 * identical output, snapshot-testable.
 *
 *   expandParticle([origin, cells, theme]) → [typeId, rawRow][]
 *
 * v1 constraints (spec: docs/plan/specs/spp-integration.md):
 *   - no cell rotation (engine collision is AABB-only)
 *   - adjacency elimination is same-level only
 */
import { ParticleFace, FaceState, SubdivisionLevel } from '../types/ParticleCell';
import { getSppTheme, getVariant, VariantPiece } from './Variants';
import './CoasterTheme'; // side-effect: registers the 'coaster' theme (cells → c1 track)
import type { TriggerLogicNode } from '../types/Trigger';

/** Compact authored cell (raw form — see spec §数据格式). */
export interface SppCell {
    position: [number, number, number];        // grid coords, stride = cell size
    level: SubdivisionLevel;
    /** [state, variant] per face, indexed by ParticleFace (Top..Right).
     *  Missing entries default to [Closed, 0] (solid). */
    faces: Array<[number, number]>;
    trigger?: TriggerLogicNode[];
}

export type SppRaw = [origin: [number, number, number], cells: SppCell[], theme: string];

export type ExpandedRow = [typeId: number, raw: any[]];

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

function cellSize(level: SubdivisionLevel): number {
    return 4 * Math.pow(0.5, level);
}

function faceConfig(cell: SppCell, face: ParticleFace): [FaceState, number] {
    const entry = cell.faces?.[face];
    if (!entry) return [FaceState.Closed, 0];
    return [entry[0] as FaceState, entry[1] ?? 0];
}

/**
 * Map a face-local piece into an SPP-space slab (center + full size, meters,
 * relative to the CELL origin corner). u/v are the face's in-plane axes; the
 * slab thickness t is embedded inside the cell against the face plane.
 */
function pieceToBox(face: ParticleFace, piece: VariantPiece, s: number, t: number): { size: [number, number, number]; center: [number, number, number] } {
    const u0 = piece.du * s, su = piece.su * s;
    const v0 = piece.dv * s, sv = piece.sv * s;
    const uC = u0 + su / 2, vC = v0 + sv / 2;
    switch (face) {
        case ParticleFace.Left:    // X- plane: u→Y, v→Z
            return { size: [t, su, sv], center: [t / 2, uC, vC] };
        case ParticleFace.Right:   // X+
            return { size: [t, su, sv], center: [s - t / 2, uC, vC] };
        case ParticleFace.Front:   // Y- plane: u→X, v→Z
            return { size: [su, t, sv], center: [uC, t / 2, vC] };
        case ParticleFace.Back:    // Y+
            return { size: [su, t, sv], center: [uC, s - t / 2, vC] };
        case ParticleFace.Bottom:  // Z- plane: u→X, v→Y
            return { size: [su, sv, t], center: [uC, vC, t / 2] };
        case ParticleFace.Top:     // Z+
            return { size: [su, sv, t], center: [uC, vC, s - t / 2] };
    }
}

/**
 * Expand one b6 particle raw into standard adjunct rows.
 * Walls: a1 [size, pos, rot, texture, repeat, animation, stop=1].
 * Cell triggers: b8 [size, offset, rot, shape=1, gameOnly=0, events].
 */
export function expandParticle(raw: SppRaw): ExpandedRow[] {
    const [origin, cells, themeId] = raw;
    const theme = getSppTheme(themeId ?? 'basic');
    if (!theme || !Array.isArray(cells)) return [];

    // Same-level occupancy index for adjacency elimination.
    const occupied = new Set<string>();
    for (const cell of cells) {
        occupied.add(`${cell.level}:${cell.position[0]},${cell.position[1]},${cell.position[2]}`);
    }

    const rows: ExpandedRow[] = [];
    for (const cell of cells) {
        const s = cellSize(cell.level);
        const [gx, gy, gz] = cell.position;
        const cellOrigin: [number, number, number] = [
            origin[0] + gx * s,
            origin[1] + gy * s,
            origin[2] + gz * s,
        ];

        if (theme.expandCell) {
            // Theme owns the geometry (e.g. coaster track) — bypass walls/adjacency.
            rows.push(...theme.expandCell(cell, cellOrigin, s));
        } else {
            for (const face of FACES) {
                // Shared planes belong to the lower-coordinate cell's positive face:
                // a NEGATIVE face is skipped whenever a same-level neighbour adjoins it.
                const dir = NEGATIVE_FACE_DIR[face];
                if (dir) {
                    const key = `${cell.level}:${gx + dir[0]},${gy + dir[1]},${gz + dir[2]}`;
                    if (occupied.has(key)) continue;
                }

                const [state, variantId] = faceConfig(cell, face);
                const variant = getVariant(theme, state, variantId);
                if (!variant) continue;

                for (const piece of variant.pieces) {
                    const { size, center } = pieceToBox(face, piece, s, theme.thickness);
                    rows.push([0x00a1, [
                        size,
                        [cellOrigin[0] + center[0], cellOrigin[1] + center[1], cellOrigin[2] + center[2]],
                        [0, 0, 0], 0, [1, 1], 0, 1,
                    ]]);
                }
            }
        }

        if (cell.trigger && cell.trigger.length > 0) {
            rows.push([0x00b8, [
                [s, s, s],
                [cellOrigin[0] + s / 2, cellOrigin[1] + s / 2, cellOrigin[2] + s / 2],
                [0, 0, 0], 1, 0, cell.trigger,
            ]]);
        }
    }
    return rows;
}
