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
import { adjunctTypeName } from '../types/AdjunctType';
import { defaultTailFor, placementTypes } from '../edit/AdjunctDefaults';

/** One face-local slab: offset+size in normalized face coords (a1-wall shorthand). */
export interface VariantPiece {
    du: number;  // u offset (0..1)
    dv: number;  // v offset (0..1)
    su: number;  // u size   (0..1)
    sv: number;  // v size   (0..1)
}

/**
 * One part of a composed option (P1): ANY adjunct type placed in the face-local
 * unit frame. u/v = in-plane offset (0..1); su/sv = in-plane size; w = inward
 * depth offset (0..1, 0 = at the face plane); sw = inward depth size (0..1,
 * default = the theme's wall thickness). `props` is the emitted adjunct raw's
 * TAIL (slots 3+, type-specific: a1 [resource,repeat,anim,stop,color] ·
 * a4 [modelRef,…] · b4 [stopMode,anim]). A "blocking vase" = an a4 model part +
 * a b4 stop part; "two pillars" = two a4 parts and NO stop. Spec: spp-editors.md §3.2.
 */
export interface VariantPart {
    type: number;              // AdjunctTypeId
    u: number; v: number;      // face-plane offset (0..1)
    su: number; sv: number;    // face-plane size   (0..1)
    w?: number;                // inward depth offset (0..1)
    sw?: number;               // inward depth size   (0..1); default = thickness
    rot?: [number, number, number];
    props?: any[];             // raw tail (slots 3+), type-specific
}

export interface FaceVariant {
    /** Stable identity (P4). A source face references a variant by this key;
     *  falls back to `name`, and legacy sources reference by array index. */
    key?: string;
    name: string;
    /** Legacy a1-only slabs (auto-lifted to a1 `parts` at expand time). */
    pieces?: VariantPiece[];
    /** Composition: any adjunct types (visual + collision). Wins over `pieces`. */
    parts?: VariantPart[];
}

/**
 * A PREFAB (组合件) — a named, reusable adjunct composition that belongs to no
 * face (spp-editors.md §9).
 *
 * Same `parts` vocabulary as a face option, and deliberately so: an option
 * already IS "a group of adjuncts in a normalized unit frame" (§3.2), which is
 * exactly what a piece of furniture is. The only difference is the FRAME —
 * a face option is framed on one of six faces, a prefab is framed on the cell
 * itself, which the expander treats as the Bottom face:
 *
 *   u → X 东 · v → Y 北 (the footprint on the floor) · w/sw → Z 上 (height)
 *
 * so authoring one reads as "a thing standing on the floor of a unit cube".
 *
 * `key` is REQUIRED (unlike FaceVariant's, which tolerates legacy positional
 * references). Prefabs are new, so they start on the right side of §3.6: the
 * only way to name one is a stable key, and the only way to reference one is
 * `packId#key`. There is no index form to drift.
 */
export interface Prefab {
    key: string;
    name: string;
    /** Authored edge of the unit cube, in meters. Default 2 — furniture scale.
     *  The frame is scale-invariant (§3.3); this is only what "1.0" means when
     *  the prefab is stamped into a block. */
    size?: number;
    parts: VariantPart[];
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
     * Reusable compositions that are NOT face options (§9). Carried on the theme
     * so a style ships its own furniture — a garden pack's bench belongs to the
     * garden pack. Never touched by the expander: prefabs are stamped at
     * authoring time (see `expandPrefab`), not expanded per frame.
     */
    prefabs?: Prefab[];
    /**
     * Optional per-cell geometry override. When present, the expander calls this
     * for each cell INSTEAD of the face/wall/adjacency logic, and uses whatever
     * rows it returns. Lets a theme emit non-wall geometry (e.g. the coaster
     * theme emits a c1 tube track piece per cell). Triggers are still emitted by
     * the expander regardless. Returns [typeId, raw][].
     */
    expandCell?: (
        cell: { position: [number, number, number]; level: number; faces?: Array<[number, number | string]> },
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
    /** Named compositions that are not face options (§9). Optional — a pack
     *  without furniture is still a complete pack. */
    prefabs?: Prefab[];
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
        // A malformed `prefabs` is dropped, not fatal: the two pools are what a
        // b6 source needs to render, and refusing a whole pack over its optional
        // furniture list would break worlds that never place any.
        ...(Array.isArray(pack.prefabs) ? { prefabs: pack.prefabs } : {}),
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

/** Resolve a face's variant reference to the variant. P4 dual-read: a STRING
 *  is a stable `key` (SPP-Core §3.2.4 — an opaque reference); a NUMBER is a
 *  legacy positional index. Key falls back to `name` when `key` is unset. */
export function getVariant(theme: SppTheme, state: FaceState, ref: number | string): FaceVariant | undefined {
    const pool = state === FaceState.Closed ? theme.closed : theme.open;
    if (typeof ref === 'string') return pool.find(v => (v.key ?? v.name) === ref);
    return pool[ref];
}

/** One entry of a theme pool as an editor lists it: the stable reference to
 *  WRITE into a face, plus the human name to show. */
export interface VariantInfo {
    key: string;
    name: string;
}

/** An adjunct type a library editor may drop into an option, with the starter
 *  raw tail to seed the new part with. */
export interface OptionPartKind {
    typeId: number;
    /** Engine type name (`adjunctTypeName`) — 'Wall', 'Box', … */
    name: string;
    /** Starter `props` for the new VariantPart (raw slots 3+). */
    props: any[];
}

/**
 * Which adjunct types can be a PART of an option, and what to seed them with.
 *
 * The test is not a hand-kept whitelist: a `VariantPart`'s unit frame
 * (u/v/su/sv/w/sw) fills exactly the `[size, pos, rot]` triple of a raw row, so
 * a type belongs here **iff** its raw has that shape — which is precisely the
 * types `defaultTailFor` answers for. Sources and logic (b6 SPP, c2 motif,
 * b7 spawner, f1 npc, b5 item) and the size-less a3 light are therefore excluded
 * mechanically, not by opinion, and a new adjunct type shows up in the library
 * editor the moment it gets placement defaults.
 *
 * Spec: spp-editors.md §3.2/§3.4 (option = adjunct composition).
 */
export function listOptionPartKinds(): OptionPartKind[] {
    const out: OptionPartKind[] = [];
    for (const typeId of placementTypes()) {
        const props = defaultTailFor(typeId);
        if (!props) continue;
        out.push({ typeId, name: adjunctTypeName(typeId), props });
    }
    return out;
}

/** The live option list of a theme's pool — what a face CAN become. This is
 *  Editor 1's "read the library" seam (spp-editors.md §2.2): pickers list what
 *  the ACTIVE theme actually provides instead of hard-coding a cycle. Keys are
 *  the same stable references getVariant resolves (key, falling back to name).
 *  Unknown theme → []. */
export function listVariants(themeId: string, state: FaceState): VariantInfo[] {
    const theme = themes.get(themeId);
    if (!theme) return [];
    const pool = state === FaceState.Closed ? theme.closed : theme.open;
    return pool.map(v => ({ key: v.key ?? v.name, name: v.name }));
}

// ─── Prefabs: the library's non-face half (§9) ───────────────────────────────

/** How a prefab is addressed from outside its pack: `packId#key`. Opaque and
 *  stable (§3.6) — never a position. */
export const prefabRef = (packId: string, key: string): string => `${packId}#${key}`;

/** One prefab as a picker lists it. `ref` is what a caller passes back. */
export interface PrefabInfo {
    ref: string;
    pack: string;
    key: string;
    name: string;
    /** How many adjuncts get stamped — the palette shows it so "place" is never
     *  a surprise (a 12-part pergola is not the same click as a 1-part stool). */
    parts: number;
    /** Authored cube edge in meters (default 2). */
    size: number;
}

/**
 * Every prefab of one pack, or of ALL registered packs when `themeId` is
 * omitted. This is the world palette's "read the library" seam — the same
 * relationship `listVariants` has with the face picker (§2.2): the menu is what
 * the loaded packs actually provide, never a hard-coded list.
 */
export function listPrefabs(themeId?: string): PrefabInfo[] {
    const out: PrefabInfo[] = [];
    for (const [id, theme] of themes) {
        if (themeId != null && id !== themeId) continue;
        for (const p of theme.prefabs ?? []) {
            if (!p || typeof p.key !== 'string' || !p.key) continue;
            out.push({
                ref: prefabRef(id, p.key), pack: id, key: p.key,
                name: p.name ?? p.key, parts: (p.parts ?? []).length, size: p.size ?? DEFAULT_PREFAB_SIZE,
            });
        }
    }
    return out;
}

/** Default authored cube edge for a prefab, in meters — furniture scale. */
export const DEFAULT_PREFAB_SIZE = 2;

/** Resolve a `packId#key` reference. Unknown pack or key → undefined (callers
 *  must treat a dangling reference as "nothing to place", never as a crash:
 *  packs arrive from CID/URL and can legitimately be missing). */
export function getPrefab(ref: string): Prefab | undefined {
    const hash = ref.lastIndexOf('#');
    if (hash <= 0) return undefined;
    const theme = themes.get(ref.slice(0, hash));
    if (!theme) return undefined;
    const key = ref.slice(hash + 1);
    return (theme.prefabs ?? []).find(p => p.key === key);
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
