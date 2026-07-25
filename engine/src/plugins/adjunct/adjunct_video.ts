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
import { composeParts, thinAxis } from './_shared.js';

/**
 * Adjunct — video screen (e3)
 *
 * A placeable "screen": an upright panel whose material map is a live
 * VideoTexture — an in-world TV, cinema, jumbotron, or signage. The plugin stays
 * PURE (no Three/DOM): it renders a thin panel and declares a `media` directive;
 * RenderEngine.attachVideoScreen creates the <video> + VideoTexture and assigns
 * it (spec §4/§5/§7). Source is self-hosted / CID / CORS video — NOT YouTube
 * (a cross-origin iframe cannot be sampled into WebGL; see spec §9).
 *
 * Raw layout:
 *   [ size[E,N,Alt], pos[ox,oy,oz], rot[rx,ry,rz], source, autoplay, loop, muted, volume ]
 *   source = video resource id / URL / CID. Defaults autoplay+loop+muted (the only
 *   combination browsers allow to start without a user gesture).
 */

const reg: ComponentMeta = {
    name: "video",
    short: "VD",
    typeId: AdjunctType.Video,
    desc: "Video screen (in-world VideoTexture panel).",
    version: "1.0.0",
};

const attribute: AdjunctAttribute = {
    deserialize: (data: any[]): STDObject => ({
        x: data[0]?.[0] ?? 3.2, y: data[0]?.[1] ?? 0.1, z: data[0]?.[2] ?? 1.8, // ~16:9 thin panel
        ox: data[1]?.[0] ?? 0, oy: data[1]?.[1] ?? 0, oz: data[1]?.[2] ?? 0,
        rx: data[2]?.[0] ?? 0, ry: data[2]?.[1] ?? 0, rz: data[2]?.[2] ?? 0,
        source: data[3] != null ? String(data[3]) : '',
        autoplay: data[4] != null ? !!data[4] : true,
        loop: data[5] != null ? !!data[5] : true,
        muted: data[6] != null ? !!data[6] : true,
        volume: typeof data[7] === 'number' ? data[7] : 1,
    }),
    serialize: (std: STDObject) => [
        [std.x, std.y, std.z],
        [std.ox, std.oy, std.oz],
        [std.rx, std.ry, std.rz],
        std.source ?? '',
        std.autoplay ? 1 : 0,
        std.loop ? 1 : 0,
        std.muted ? 1 : 0,
        std.volume ?? 1,
    ],
};

const transform: AdjunctTransform = {
    stdToRenderData: (stds: STDObject[], elevation: number): RenderObject[] => {
        return stds.flatMap((row) => {
            // Bezel + screen + power LED. The MEDIA rides on the screen part only —
            // AdjunctFactory attaches the VideoTexture to the mesh whose render item
            // declared it, so putting it on the bezel would play the film on the frame.
            const t = thinAxis(row);
            const [a, b] = [0, 1, 2].filter((x) => x !== t) as [number, number];
            const v = (base: number, over: Partial<Record<number, number>>): [number, number, number] =>
                [0, 1, 2].map((x) => over[x] ?? base) as [number, number, number];
            const media = row.source
                ? {
                    kind: 'video' as const,
                    source: String(row.source),
                    autoplay: row.autoplay !== false,
                    loop: row.loop !== false,
                    muted: row.muted !== false,
                    volume: row.volume ?? 1,
                }
                : undefined;
            return composeParts(row, elevation, [
                // Part 0 is the SCREEN (dark until the first frame lands) — it carries
                // the media, and it is what callers/tests mean by "the panel".
                { size: v(1, { [a]: 0.92, [b]: 0.88, [t]: 1.06 }), color: 0x111111, min: 0.012, media },
                { size: v(1, {}), color: 31, min: 0.01 },                                  // 31 = near-black bezel
                { size: v(0.04, { [t]: 1.1 }), at: v(0, { [a]: 0.44, [b]: -0.45 }), color: 26, min: 0.01 },  // 26 = green LED
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
            title: "Video",
            fields: [
                { key: "source", label: "Source (URL/CID)", type: "text" as const, value: std.source ?? '' },
                { key: "volume", label: "Volume", type: "number" as const, value: std.volume ?? 1, min: 0, max: 1, step: 0.05 },
            ],
        },
        {
            title: "Screen size",
            fields: [
                { key: "x", label: "Width (E)", type: "number" as const, value: std.x, min: 0.2, step: 0.1 },
                { key: "z", label: "Height", type: "number" as const, value: std.z, min: 0.2, step: 0.1 },
            ],
        },
    ],
};

export const AdjunctVideo: AdjunctDefinition = {
    hooks: {
        reg: () => reg,
        init: () => ({ chain: "", value: null }),
    },
    transform,
    attribute,
    menu: menu as any,
};
