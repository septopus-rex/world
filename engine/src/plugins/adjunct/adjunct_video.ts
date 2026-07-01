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
        return stds.map((row, i) => ({
            type: "box",                              // thin upright panel
            index: i,
            params: {
                size: Coords.getBoxDimensions([row.x, row.y, Math.max(row.z, 0.05)]),
                position: [row.ox, row.oy, row.oz + elevation],
                rotation: [row.rx, row.ry, row.rz],
            },
            // Neutral dark tint until the first video frame lands (screen-off look);
            // the VideoTexture, once attached, overrides .map (white base shows it true).
            material: { color: 0x111111 },
            media: row.source
                ? {
                    kind: 'video' as const,
                    source: String(row.source),
                    autoplay: row.autoplay !== false,
                    loop: row.loop !== false,
                    muted: row.muted !== false,
                    volume: row.volume ?? 1,
                }
                : undefined,
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
