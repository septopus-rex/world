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
 * Adjunct — Book / readable text panel (e4)
 *
 * An in-scene object you click to open a paged reader — lore books, letters,
 * signs, plaques, tutorials, item codices. The 4th member of the e-series media
 * panel family (e1 link · e2 audio · e3 video): a panel + a resource + a click
 * behaviour. Where e1 carries a `url` (client → window.open), e4 carries
 * `pages: string[]` (client → in-scene BookReader). Semantically it's the
 * inanimate sibling of the ba NPC's dialogue tree — same "台词" content, but a
 * linear reader (page ◀ N/M ▶) on an object instead of a branching conversation
 * on a character. Paging is a pure view action, so it stays in the client (same
 * discipline as e1's window.open); the engine only renders the tome + carries
 * the text, and clicking it emits the generic `interact.primary`.
 *
 * Raw layout (standard 7-slot prefix + slots 7/8):
 *   [ size[E,N,Alt], pos[ox,oy,oz], rot[rx,ry,rz], resource, repeat,
 *     animation, stop, pages, title? ]
 *
 * slot 7 `pages` — inline `string[]` (dev明文, like the SPP b6 source rows) OR a
 *   resource id / IPFS CID that the resource pipeline resolves to a `string[]`
 *   (production; big text stays off-block, same as e2/e3 `source`). Inline is
 *   implemented here; a non-array is carried unresolved as `pagesSource`.
 * slot 8 `title` — optional string shown in the reader chrome.
 */

const reg: ComponentMeta = {
    name: "book",
    short: "BK",
    typeId: AdjunctType.Book,
    desc: "Readable paged-text panel (click to open a reader).",
    version: "1.0.0",
};

// A warm leather cover so a plain (untextured) book reads as a book.
const config = { color: 0x8a5a2b };

const attribute: AdjunctAttribute = {
    deserialize: (data: any[]): STDObject => ({
        x: data[0]?.[0] ?? 0.7, y: data[0]?.[1] ?? 0.2, z: data[0]?.[2] ?? 0.9, // upright tome
        ox: data[1]?.[0] ?? 0, oy: data[1]?.[1] ?? 0, oz: data[1]?.[2] ?? 0,
        rx: data[2]?.[0] ?? 0, ry: data[2]?.[1] ?? 0, rz: data[2]?.[2] ?? 0,
        material: {
            resource: data[3] ?? 0,
            repeat: data[4] ?? [1, 1],
        },
        animate: data[5] ?? null,
        stop: data[6] ?? null,
        // slot 7: inline string[] now; a CID/id is carried for later resolution.
        pages: Array.isArray(data[7]) ? data[7].map((s: any) => String(s)) : [],
        pagesSource: (typeof data[7] === 'string' || typeof data[7] === 'number') ? data[7] : undefined,
        title: typeof data[8] === 'string' ? data[8] : '',
    }),
    serialize: (std: STDObject) => [
        [std.x, std.y, std.z],
        [std.ox, std.oy, std.oz],
        [std.rx, std.ry, std.rz],
        std.material?.resource,
        std.material?.repeat,
        std.animate,
        std.stop,
        // Prefer the inline pages; fall back to an unresolved CID/id source.
        (Array.isArray(std.pages) && std.pages.length > 0) ? std.pages : (std.pagesSource ?? []),
        std.title ?? '',
    ],
};

const transform: AdjunctTransform = {
    stdToRenderData: (stds: STDObject[], elevation: number): RenderObject[] => {
        return stds.flatMap((row) => {
            // A tome, not a brown box: two covers around a block of pages, a spine
            // down one edge, and a brass title plate. Axes are DERIVED (see
            // thinAxis) because content authors books upright on a lectern and flat
            // on a table; `t` is the cover normal, the spine runs the long way of
            // the remaining two and sits at the negative end of the short one.
            const t = thinAxis(row);
            const rest = [0, 1, 2].filter((a) => a !== t) as [number, number];
            const body = [row.x, row.y, row.z];
            const long = Math.abs(body[rest[0]]) >= Math.abs(body[rest[1]]) ? rest[0] : rest[1];
            const edge = long === rest[0] ? rest[1] : rest[0];

            /** Fractional size/offset triple addressed by axis, defaults 1 / 0. */
            const v = (base: number, over: Partial<Record<number, number>>): [number, number, number] =>
                [0, 1, 2].map((a) => over[a] ?? base) as [number, number, number];

            const COVER = config.color;         // warm leather
            const SPINE = 0x6b4420;             // the same leather in shadow
            const tex = row.material?.texture ? String(row.material.texture) : undefined;
            return composeParts(row, elevation, [
                // Covers — the authored texture (if any) belongs here.
                { size: v(1, { [t]: 0.14 }), at: v(0, { [t]: -0.43 }), color: COVER, texture: tex, min: 0.008 },
                { size: v(1, { [t]: 0.14 }), at: v(0, { [t]: 0.43 }), color: COVER, texture: tex, min: 0.008 },
                // Page block: inset on three sides, flush into the spine.
                {
                    size: v(0.9, { [t]: 0.62, [long]: 0.92 }),
                    at: v(0, { [edge]: 0.03 }), color: 30, min: 0.01,     // 30 = bone
                },
                // Spine down the negative edge, full height of the long axis.
                { size: v(1, { [edge]: 0.1 }), at: v(0, { [edge]: -0.45 }), color: SPINE, min: 0.01 },
                // Brass title plate on BOTH covers — a small specular break is what
                // makes the whole thing read as an object rather than a prism. Both
                // sides because a world object gets approached from either
                // direction and the row carries no notion of a front.
                {
                    size: v(0.05, { [long]: 0.12, [edge]: 0.45, [t]: 0.05 }),
                    at: v(0, { [t]: 0.5, [long]: 0.22 }), color: 12, min: 0.004,   // 12 = brass
                },
                {
                    size: v(0.05, { [long]: 0.12, [edge]: 0.45, [t]: 0.05 }),
                    at: v(0, { [t]: -0.5, [long]: 0.22 }), color: 12, min: 0.004,
                },
            ]);
        });
    },
};

const menu = {
    contextMenu: (_std: STDObject): ContextMenuItem[] => [
        { label: "✏️ Edit Properties", action: "edit" },
        { label: "🗑️ Delete", action: "delete", variant: "danger" as const },
    ],
    form: (std: STDObject): FormGroup[] => [
        {
            title: "Book",
            fields: [
                { key: "title", label: "Title", type: "text" as const, value: std.title ?? '' },
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

export const AdjunctBook: AdjunctDefinition = {
    hooks: {
        reg: () => reg,
        init: () => ({ chain: "", value: null })
    },
    transform,
    attribute,
    menu: menu as any
};
