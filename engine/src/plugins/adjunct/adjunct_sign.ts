import {
    ComponentMeta,
    STDObject,
    RenderObject,
    AdjunctDefinition,
    AdjunctTransform,
    AdjunctAttribute,
} from '../../core/types/Adjunct.js';
import { AdjunctType } from '../../core/types/AdjunctType';
import { ContextMenuItem, FormGroup } from '../../core/types/EditTask.js';
import { Coords } from '../../core/utils/Coords.js';

/**
 * Adjunct — sign (a8)
 *
 * An UNLIT textured plane: guide arrows floating over a path, posters, decals,
 * floor markings — imagery that must read at a glance regardless of sun angle.
 * Three deliberate contrasts with a textured box (a2):
 *   · unlit (MeshBasicMaterial) — never goes dark on the shadowed side;
 *   · a single plane, not a closed box — no "through-print" mirror on the far
 *     face (the back shows the mirrored image, as any thin sheet would);
 *   · fitted texture (0..1 UV) — the whole image maps onto the face once; use
 *     texture records WITHOUT `size` so the shared texture's repeat stays [1,1].
 * Non-solid and non-blocking by construction — pure signage.
 *
 * Orientation contract: at rotation [0,0,0] the sign lies FLAT (normal = up),
 * with the texture's V+ (image "up") pointing NORTH — so a forward arrow drawn
 * upright in the image points travel-north in the world. Rotation is the
 * engine-frame Euler of the adjunct contract (coordinate.md §3.1): rx tilts the
 * top edge toward south (toward a viewer walking north) for billboard-style
 * overhead guides; rx = π/2 stands it fully vertical facing south.
 *
 * Raw layout:
 *   [ size[E,N], pos[ox,oy,oz], rot[rx,ry,rz], texture, opacity? ]
 *   texture = texture resource id (ResourceManager record; omit record `size`).
 */

const reg: ComponentMeta = {
    name: "sign",
    short: "SG",
    typeId: AdjunctType.Sign,
    desc: "Unlit textured plane (signage / decals / floating guides).",
    version: "1.0.0",
};

const attribute: AdjunctAttribute = {
    deserialize: (data: any[]): STDObject => ({
        x: data[0]?.[0] ?? 1.2, y: data[0]?.[1] ?? 2, z: 0,   // plane: E×N extent, no厚度
        ox: data[1]?.[0] ?? 0, oy: data[1]?.[1] ?? 0, oz: data[1]?.[2] ?? 0,
        rx: data[2]?.[0] ?? 0, ry: data[2]?.[1] ?? 0, rz: data[2]?.[2] ?? 0,
        texture: data[3] != null ? String(data[3]) : '',
        opacity: typeof data[4] === 'number' ? data[4] : 1,
    }),
    serialize: (std: STDObject) => [
        [std.x, std.y],
        [std.ox, std.oy, std.oz],
        [std.rx, std.ry, std.rz],
        std.texture ?? '',
        std.opacity ?? 1,
    ],
};

const transform: AdjunctTransform = {
    stdToRenderData: (stds: STDObject[], elevation: number): RenderObject[] => {
        return stds.map((row, i) => ({
            type: "sign",
            index: i,
            params: {
                size: Coords.getBoxDimensions([row.x, row.y, 0]),
                position: [row.ox, row.oy, row.oz + elevation],
                rotation: [row.rx, row.ry, row.rz],
            },
            // White base so the texture shows true; unlit so it reads from any
            // angle at any time of day. Missing texture → plain white plane
            // (visible, obviously wrong — an authoring error should be seen).
            material: {
                color: 0xffffff,
                texture: row.texture ? String(row.texture) : undefined,
                unlit: true,
                opacity: row.opacity ?? 1,
            },
            animate: row.animate,
        }));
    },
};

const menu = {
    contextMenu: (_std: STDObject): ContextMenuItem[] => [
        { label: "✏️ Edit Properties", action: "edit" },
        { label: "🗑️ Delete", action: "delete", variant: "danger" as const },
    ],
    form: (std: STDObject): FormGroup[] => [
        {
            title: "Sign",
            fields: [
                { key: "texture", label: "Texture (id)", type: "text" as const, value: std.texture ?? '' },
                { key: "opacity", label: "Opacity", type: "number" as const, value: std.opacity ?? 1, min: 0, max: 1, step: 0.05 },
            ],
        },
        {
            title: "Size",
            fields: [
                { key: "x", label: "Width (E)", type: "number" as const, value: std.x, min: 0.2, step: 0.1 },
                { key: "y", label: "Length (N)", type: "number" as const, value: std.y, min: 0.2, step: 0.1 },
            ],
        },
    ],
};

export const AdjunctSign: AdjunctDefinition = {
    hooks: {
        reg: () => reg,
        init: () => ({ chain: "", value: null }),
    },
    transform,
    attribute,
    menu: menu as any,
};
