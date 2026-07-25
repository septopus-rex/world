import {
    ComponentMeta,
    STDObject,
    RenderObject,
    AdjunctDefinition,
    AdjunctTransform,
    AdjunctAttribute
} from '../../core/types/Adjunct.js';
import { AdjunctType } from '../../core/types/AdjunctType';
import { ContextMenuItem, FormGroup } from '../../core/types/EditTask.js';
import { composeParts, thinAxis } from './_shared.js';

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
    typeId: AdjunctType.Link,
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
        return stds.flatMap((row) => {
            // A framed plate: slate bezel with the link face standing PROUD of it
            // (4% each side — coplanar faces z-fight), plus a brass tab so the
            // thing reads as a fixture rather than a floating rectangle.
            const t = thinAxis(row);
            const [a, b] = [0, 1, 2].filter((x) => x !== t) as [number, number];
            const v = (base: number, over: Partial<Record<number, number>>): [number, number, number] =>
                [0, 1, 2].map((x) => over[x] ?? base) as [number, number, number];
            const tex = row.material?.texture ? String(row.material.texture) : undefined;
            return composeParts(row, elevation, [
                // Part 0 is the FACE — the primary surface every caller (and test)
                // means by "the panel"; the frame follows.
                {
                    size: v(1, { [a]: 0.86, [b]: 0.86, [t]: 1.08 }),
                    color: config.color, texture: tex, min: 0.012,
                },
                { size: v(1, {}), color: 9, min: 0.01 },                                  // 9 = slate bezel
                { size: v(0.05, { [a]: 0.3, [b]: 0.05, [t]: 1.12 }), at: v(0, { [b]: -0.44 }), color: 12, min: 0.008 },
            ]);
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
