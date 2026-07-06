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
     * Optional explicit wall colour (hex). Asset-free styling: threaded into the
     * derived a1 wall's material (slot 7) so the SAME cells restyle by colour
     * alone. Unset → the wall's default grey. Structural themes (expandCell)
     * ignore it.
     */
    color?: number;
    /**
     * Optional wall texture resource (CID / URL / id). The proper external skin:
     * threaded into the derived a1 wall's resource slot, resolved by
     * ResourceManager like any other texture. Unset → solid colour.
     */
    texture?: string | number;
    /**
     * Optional per-cell geometry override. When present, the expander calls this
     * for each cell INSTEAD of the face/wall/adjacency logic, and uses whatever
     * rows it returns. Lets a theme emit non-wall geometry (e.g. the coaster
     * theme emits a c1 tube track piece per cell). Triggers are still emitted by
     * the expander regardless. Returns [typeId, raw][].
     */
    expandCell?: (
        cell: { position: [number, number, number]; level: number; faces?: Array<[number, number]> },
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

/** Every registered theme/StylePack id (built-in + externally loaded). Powers
 *  the client style switcher without hard-coding the list. */
export function listSppThemes(): string[] {
    return [...themes.keys()];
}

// ─── StylePack: the externalised, data-only form of a theme ──────────────────
//
// A StylePack is an SppTheme minus the `expandCell` function — pure JSON, so it
// is content-addressable (CID) and loadable from IPFS/URL exactly like a
// texture. Bundled packs register at boot (offline default); a host resolves
// external ones (via IDataSource.stylePack / Engine.registerStylePack) BEFORE
// the referencing block streams in, since expansion is synchronous. Spec:
// docs/plan/specs/spp-protocol-full.md §3.B.

export interface StylePack {
    format?: 'septopus.spp.stylepack';
    version?: number;
    id: string;
    thickness: number;
    closed: FaceVariant[];
    open: FaceVariant[];
    color?: number;
    texture?: string | number;
}

/** Validate a StylePack JSON and register it as a theme. Returns the id, or
 *  null when the shape is invalid (logged by the caller — never throws). */
export function registerStylePack(pack: StylePack): string | null {
    if (!pack || typeof pack.id !== 'string' || typeof pack.thickness !== 'number') return null;
    if (!Array.isArray(pack.closed) || !Array.isArray(pack.open)) return null;
    registerSppTheme(pack.id, {
        thickness: pack.thickness,
        closed: pack.closed,
        open: pack.open,
        ...(pack.color != null ? { color: pack.color } : {}),
        ...(pack.texture != null ? { texture: pack.texture } : {}),
    });
    return pack.id;
}

// ─── World-level style override (one-key restyle) ────────────────────────────
//
// When set, expandSpp swaps every VISUAL theme (i.e. not a structural
// expandCell theme like `coaster`) for this one — the SAME cell matrices
// restyle wholesale without touching a single row. Null = each source keeps its
// own theme. Set via Engine.setStyleOverride; the engine re-expands live SPP
// sources so the swap is instant.

let _styleOverride: string | null = null;

export function setStyleOverride(id: string | null): void {
    _styleOverride = id && themes.has(id) ? id : null;
}

export function getStyleOverride(): string | null {
    return _styleOverride;
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

// NOTE: visual StylePacks (brick / garden / …) are CONTENT, not engine code —
// they live as data (client/desktop/src/stylepacks/*.json) and are resolved
// through IDataSource.stylePack() + Engine.registerStylePack at boot. The engine
// ships only `basic` (default fallback) and `coaster` (structural, CoasterTheme).
// Spec: spp-protocol-full.md §3.B (data separation).
