import { STDObject, AdjunctAttribute, MaterialConfig, RenderObject } from '../../core/types/Adjunct';
import { ContextMenuItem, FormGroup } from '../../core/types/EditTask';
import { resolveSurface } from '../../core/utils/Palette';
import { Coords } from '../../core/utils/Coords';

/**
 * Standard Septopus adjunct (de)serialization, shared by the primitive adjuncts
 * (box / wall / cone / sphere / water). These all use the same raw array layout:
 *
 *   [ size[E,N,Alt], pos[ox,oy,oz], rot[rx,ry,rz], resource, repeat, animation, stop ]
 *
 * deserialize (raw -> STD) is on the render hot path (BlockSystem dispatch);
 * serialize (STD -> raw) is needed so edits to these adjuncts persist as drafts.
 */
export const standardAttribute: AdjunctAttribute = {
    deserialize: (data: any[]): STDObject => ({
        x: data[0]?.[0] ?? 1, y: data[0]?.[1] ?? 1, z: data[0]?.[2] ?? 1, // [E, N, Alt]
        ox: data[1]?.[0] ?? 0, oy: data[1]?.[1] ?? 0, oz: data[1]?.[2] ?? 0,
        rx: data[2]?.[0] ?? 0, ry: data[2]?.[1] ?? 0, rz: data[2]?.[2] ?? 0,
        material: {
            resource: data[3] ?? 0,
            repeat: data[4] ?? [1, 1],
            // Optional explicit wall colour (slot 7 extension). Used by SPP
            // StylePacks to recolour derived walls asset-free; legacy 7-element
            // rows have no slot 7 → default colour as before.
            ...(data[7] != null ? { color: data[7] } : {}),
        },
        animate: data[5] ?? null,
        stop: data[6] ?? null,
    }),
    serialize: (std: STDObject) => [
        [std.x, std.y, std.z],
        [std.ox, std.oy, std.oz],
        [std.rx, std.ry, std.rz],
        std.material?.resource,
        std.material?.repeat,
        std.animate,
        std.stop,
        // Slot 7 colour, only when set (keeps legacy 7-element serialization).
        ...(std.material?.color != null ? [std.material.color] : []),
    ],
};

/**
 * Resolve a standard primitive's surface (colour + PBR params) from its STD row.
 *
 * Precedence, highest first (protocol/{cn,en}/adjunct-types.md §2):
 *   1. slot 7 — an EXPLICIT colour (what SPP StylePacks write for derived walls)
 *   2. slot 3 — literal 0xRRGGBB (>=256) or a palette index (1..255)
 *   3. the family's own default colour (slot 3 = 0 / absent)
 *
 * Before this, a1/a5/a6/a7 dropped slot 3 on the floor entirely: their transforms
 * passed `row.material` straight through, so a row with slot 3 = 2 rendered in
 * MeshFactory's fallback grey and the plugins' own `config.color` never applied
 * either. Content that had authored a colour there (gallery water at 0x2290CC)
 * silently rendered as default.
 */
export function standardSurface(row: STDObject, familyDefault: number): MaterialConfig {
    if (row.material?.color != null) return { ...row.material };
    const surface = resolveSurface(row.material?.resource, familyDefault);
    return {
        ...row.material,
        color: surface.color,
        roughness: surface.roughness,
        metalness: surface.metalness,
    };
}

/**
 * ─── Composite shapes for the FUNCTIONAL adjuncts ────────────────────────────
 *
 * e4 book, e5 board, e1 link, e3 video, e2 audio were each ONE box with a flat
 * colour: a book was a brown box, a notice board a tan box. Recognition comes
 * from silhouette + material breaks, so a handful of sub-boxes (cover / spine /
 * pages / brass plate) reads as a book at a fraction of the cost of a model —
 * and unlike a model it needs no asset, scales to whatever size the content
 * authored, and stays pure code.
 *
 * The multi-part path already existed: `AdjunctFactory` feeds ONE std row to
 * `stdToRenderData` and adds every returned item as a sub-mesh of the entity's
 * single mesh group. Which is why this is visual-only:
 *   · collision comes from the STD row, not the parts — `BlockSystem` builds one
 *     SolidComponent from `data.x/y/z` (so an authored AABB is unchanged);
 *   · picking walks UP to the nearest `userData.entityId` (`Picking.castRay`) and
 *     `setRaycastable` traverses the whole group, so every part clicks through to
 *     the same entity — readers/links/videos keep working;
 *   · one entity per row → LOD, eviction, edit selection and drafts all unchanged.
 *
 * TWO RULES, both learned the hard way:
 *   1. **Sub-parts carry NO rotation.** The row's rotation is applied to the mesh
 *      GROUP by VisualSyncSystem; repeating it on the child would rotate the child
 *      twice. (The old single-box transforms did pass it — harmless for a box
 *      centred at the group origin, wrong for offset parts. Exactly one row in all
 *      shipped content is rotated: a palace book at 90°, which now honours it.)
 *   2. **Stay inside the authored AABB.** Parts are fractions of the row's own
 *      size, so nothing pokes through the wall/floor the author placed it against.
 *      The only exception is a face made a few percent proud of its frame to avoid
 *      coplanar z-fighting.
 */
export interface AdjunctPart {
    /** Centre offset as a fraction of the body, per Septopus axis [E, N, Alt].
     *  0 = centred, ±0.5 = flush with that face. */
    at?: [number, number, number];
    /** Size as a fraction of the body, per Septopus axis. */
    size: [number, number, number];
    /** Slot-3 colour value: a palette index (1..255) or a literal 0xRRGGBB. */
    color?: number;
    /** Metre floor applied after scaling, so a thin trim never degenerates to 0. */
    min?: number;
    /** Texture id/CID for this part (the image tints the part white). */
    texture?: string;
    /** Unlit (MeshBasicMaterial) — screens/labels that must stay readable. */
    unlit?: boolean;
    /** Media directive (audio emitter / video screen) — put it on ONE part. */
    media?: any;
}

/** Index of the row's thinnest axis in Septopus order [E, N, Alt] — the panel
 *  normal for board/link/video, the cover normal for a book. Content authors
 *  these upright OR flat, so deriving it beats assuming one convention. */
export function thinAxis(row: STDObject): 0 | 1 | 2 {
    const s = [Math.abs(row.x), Math.abs(row.y), Math.abs(row.z)];
    if (s[0] <= s[1] && s[0] <= s[2]) return 0;
    return s[1] <= s[2] ? 1 : 2;
}

/** Expand fractional parts into render objects (see the block comment above). */
export function composeParts(row: STDObject, elevation: number, parts: AdjunctPart[]): RenderObject[] {
    const body: [number, number, number] = [row.x, row.y, row.z];
    return parts.map((p, index) => {
        const at = p.at ?? [0, 0, 0];
        const size: [number, number, number] = [0, 1, 2].map((a) =>
            Math.max(p.min ?? 0.01, Math.abs(body[a]) * p.size[a])) as [number, number, number];
        const surface = p.color != null ? resolveSurface(p.color) : undefined;
        return {
            type: 'box',
            index,
            params: {
                size: Coords.getBoxDimensions(size),
                position: [
                    row.ox + body[0] * at[0],
                    row.oy + body[1] * at[1],
                    row.oz + elevation + body[2] * at[2],
                ],
                rotation: [0, 0, 0],   // rule 1 — the group carries the row's rotation
            },
            material: {
                ...(p.texture != null ? { texture: p.texture, color: 0xffffff } : {}),
                ...(surface ? { color: surface.color, roughness: surface.roughness, metalness: surface.metalness } : {}),
                ...(p.texture != null ? { color: 0xffffff } : {}),
                ...(p.unlit ? { unlit: true } : {}),
            },
            ...(p.media ? { media: p.media } : {}),
            animate: row.animate,
        } as RenderObject;
    });
}

/**
 * Shared edit menu for the standard primitives (wall / cone / ball / water).
 * Size + Position are the universally-meaningful fields for every box-derived
 * adjunct, so the place -> right-click -> Edit Properties loop works for all of
 * them. (box keeps its own menu with a Material group, since only box maps the
 * resource index to a colour; adding that control here would be a no-op.)
 */
export const standardMenu = {
    sidebar: (std: STDObject) => ({
        size: [
            { type: "number", key: "x", value: std.x, label: "X" },
            { type: "number", key: "y", value: std.y, label: "Y" },
            { type: "number", key: "z", value: std.z, label: "Z" },
        ],
        position: [
            { type: "number", key: "ox", value: std.ox, label: "X Offset" },
            { type: "number", key: "oy", value: std.oy, label: "Y Offset" },
            { type: "number", key: "oz", value: std.oz, label: "Z Offset" },
        ],
    }),
    contextMenu: (_std: STDObject): ContextMenuItem[] => [
        { label: "✏️ Edit Properties", action: "edit" },
        { label: "🗑️ Delete", action: "delete", variant: "danger" as const },
    ],
    form: (std: STDObject): FormGroup[] => [
        {
            title: "Size",
            fields: [
                { key: "x", label: "Width (E)", type: "number" as const, value: std.x, min: 0.1, step: 0.1 },
                { key: "y", label: "Depth (N)", type: "number" as const, value: std.y, min: 0.1, step: 0.1 },
                { key: "z", label: "Height", type: "number" as const, value: std.z, min: 0.1, step: 0.1 },
            ],
        },
        {
            title: "Position",
            fields: [
                { key: "ox", label: "X Offset", type: "number" as const, value: std.ox, step: 0.5 },
                { key: "oy", label: "Y Offset", type: "number" as const, value: std.oy, step: 0.5 },
                { key: "oz", label: "Z Offset", type: "number" as const, value: std.oz, step: 0.5 },
            ],
        },
    ],
};
