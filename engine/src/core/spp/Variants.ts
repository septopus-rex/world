/**
 * SPP face-variant registry (M1) — what a cell face EXPANDS INTO.
 *
 * A variant is a list of face-local pieces. Each piece lives in the face's
 * normalized (u, v) plane — u runs along the face's first in-plane axis,
 * v along the second, both 0..1 of the cell size — with a fixed wall
 * thickness embedded INSIDE the cell. The expander maps pieces onto the six
 * face orientations (SPP axes) and emits standard a1 wall rows.
 *
 * Spec: docs/plan/specs/spp-integration.md · design: docs/features/spp.md.
 */
import { FaceState } from '../types/ParticleCell';

/** One face-local slab: offset+size in normalized face coords. */
export interface VariantPiece {
    du: number;  // u offset (0..1)
    dv: number;  // v offset (0..1)
    su: number;  // u size   (0..1)
    sv: number;  // v size   (0..1)
}

export interface FaceVariant {
    name: string;
    pieces: VariantPiece[];
}

export interface SppTheme {
    /** Wall slab thickness in meters (embedded inside the cell). */
    thickness: number;
    /** Variants by face state; a face config indexes into these. */
    closed: FaceVariant[];
    open: FaceVariant[];
    /**
     * Optional per-cell geometry override. When present, the expander calls this
     * for each cell INSTEAD of the face/wall/adjacency logic, and uses whatever
     * rows it returns. Lets a theme emit non-wall geometry (e.g. the coaster
     * theme emits a c1 tube track piece per cell). Triggers are still emitted by
     * the expander regardless. Returns [typeId, raw][].
     */
    expandCell?: (
        cell: { position: [number, number, number]; level: number; faces: Array<[number, number]> },
        cellOrigin: [number, number, number],
        cellSizeMeters: number,
    ) => Array<[number, any[]]>;
}

const themes = new Map<string, SppTheme>();

export function registerSppTheme(id: string, theme: SppTheme): void {
    themes.set(id, theme);
}

export function getSppTheme(id: string): SppTheme | undefined {
    return themes.get(id);
}

export function getVariant(theme: SppTheme, state: FaceState, variantId: number): FaceVariant | undefined {
    const pool = state === FaceState.Closed ? theme.closed : theme.open;
    return pool[variantId];
}

/** Built-in starter theme: solid / doorway / window walls, open = passage. */
export const BASIC_THEME: SppTheme = {
    thickness: 0.2,
    closed: [
        { name: 'solid', pieces: [{ du: 0, dv: 0, su: 1, sv: 1 }] },
        {
            name: 'doorway', pieces: [
                { du: 0, dv: 0, su: 0.3, sv: 1 },        // left jamb
                { du: 0.7, dv: 0, su: 0.3, sv: 1 },      // right jamb
                { du: 0.3, dv: 0.75, su: 0.4, sv: 0.25 } // lintel (door opening v 0..0.75)
            ]
        },
        {
            name: 'window', pieces: [
                { du: 0, dv: 0, su: 1, sv: 0.4 },          // sill wall below
                { du: 0, dv: 0.85, su: 1, sv: 0.15 },      // header above
                { du: 0, dv: 0.4, su: 0.25, sv: 0.45 },    // left pier
                { du: 0.75, dv: 0.4, su: 0.25, sv: 0.45 }, // right pier
            ]
        },
    ],
    open: [
        { name: 'empty', pieces: [] },
    ],
};

registerSppTheme('basic', BASIC_THEME);
