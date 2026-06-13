import {
    ComponentMeta,
    STDObject,
    RenderObject,
    AdjunctDefinition,
    AdjunctTransform,
    AdjunctAttribute
} from '../../core/types/Adjunct.js';
import { ContextMenuItem, FormGroup } from '../../core/types/EditTask.js';
import { Coords } from '../../core/utils/Coords.js';

/**
 * Adjunct - Link / QR panel (e1)
 *
 * A clickable sign that points at an external URL — the standalone, working
 * version of the old `plug_link` (which was a pure stub: empty add/remove/set).
 * Renders an upright panel (optionally a QR / image texture). Every adjunct is
 * raycast-interactable, so clicking one emits `interact.primary` carrying the
 * adjunctId; the client reads the entity's `stdData.url` and opens it (the DOM
 * action stays in the client — the engine just carries the data + interaction).
 *
 * Raw layout (standard + slots 7/8):
 *   [ size[E,N,Alt], pos[ox,oy,oz], rot[rx,ry,rz], resource, repeat,
 *     animation, stop, url, texture? ]
 */

const reg: ComponentMeta = {
    name: "link",
    short: "LK",
    typeId: 0x00e1,
    desc: "External link / QR panel (clickable).",
    version: "1.0.0",
};

const config = { color: 0x2266cc };

const attribute: AdjunctAttribute = {
    deserialize: (data: any[]): STDObject => ({
        x: data[0]?.[0] ?? 1, y: data[0]?.[1] ?? 1, z: data[0]?.[2] ?? 0.1, // thin panel by default
        ox: data[1]?.[0] ?? 0, oy: data[1]?.[1] ?? 0, oz: data[1]?.[2] ?? 0,
        rx: data[2]?.[0] ?? 0, ry: data[2]?.[1] ?? 0, rz: data[2]?.[2] ?? 0,
        material: {
            resource: data[3] ?? 0,
            repeat: data[4] ?? [1, 1],
            // Optional QR / image texture in slot 8.
            ...(data[8] != null ? { texture: String(data[8]) } : {}),
        },
        animate: data[5] ?? null,
        stop: data[6] ?? null,
        url: typeof data[7] === 'string' ? data[7] : '',
    }),
    serialize: (std: STDObject) => [
        [std.x, std.y, std.z],
        [std.ox, std.oy, std.oz],
        [std.rx, std.ry, std.rz],
        std.material?.resource,
        std.material?.repeat,
        std.animate,
        std.stop,
        std.url ?? '',
        std.material?.texture,
    ],
};

const transform: AdjunctTransform = {
    stdToRenderData: (stds: STDObject[], elevation: number): RenderObject[] => {
        return stds.map((row, i) => {
            // A textured panel (QR/image) tints white so the image shows true; a
            // plain panel uses the link colour.
            const color = row.material?.texture ? 0xffffff : config.color;
            return {
                type: "box", // upright panel
                index: i,
                params: {
                    size: Coords.getBoxDimensions([row.x, row.y, Math.max(row.z, 0.05)]),
                    position: [row.ox, row.oy, row.oz + elevation],
                    rotation: [row.rx, row.ry, row.rz],
                },
                material: { ...row.material, color },
                animate: row.animate,
            };
        });
    }
};

const menu = {
    contextMenu: (_std: STDObject): ContextMenuItem[] => [
        { label: "✏️ Edit Properties", action: "edit" },
        { label: "🗑️ Delete", action: "delete", variant: "danger" as const },
    ],
    form: (std: STDObject): FormGroup[] => [
        {
            title: "Link",
            fields: [
                { key: "url", label: "URL", type: "text" as const, value: std.url ?? '' },
            ],
        },
        {
            title: "Size",
            fields: [
                { key: "x", label: "Width (E)", type: "number" as const, value: std.x, min: 0.1, step: 0.1 },
                { key: "y", label: "Depth (N)", type: "number" as const, value: std.y, min: 0.05, step: 0.05 },
                { key: "z", label: "Height", type: "number" as const, value: std.z, min: 0.1, step: 0.1 },
            ],
        },
    ],
};

export const AdjunctLink: AdjunctDefinition = {
    hooks: {
        reg: () => reg,
        init: () => ({ chain: "", value: null })
    },
    transform,
    attribute,
    menu: menu as any
};
