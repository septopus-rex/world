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
 * Adjunct — spatial audio emitter (e2)
 *
 * A placeable sound source: renders a small marker box and attaches a spatial
 * (PositionalAudio) sound anchored at it — a fountain trickle, fire crackle, an
 * ambient-music zone. The plugin stays PURE (no Three/DOM): it only declares a
 * `media` directive; RenderEngine.attachAudioEmitter materializes it (spec
 * §5/§7). Playback (autoplay-loop, later trigger/click) is driven from there.
 *
 * Raw layout:
 *   [ size[E,N,Alt], pos[ox,oy,oz], rot[rx,ry,rz], source, autoplay, loop, volume, refDistance ]
 *   source = audio resource id / URL / CID.
 */

const reg: ComponentMeta = {
    name: "audio",
    short: "AU",
    typeId: AdjunctType.Audio,
    desc: "Spatial audio emitter (ambient / triggered sound).",
    version: "1.0.0",
};

const config = { color: 0x33cc88 };

const attribute: AdjunctAttribute = {
    deserialize: (data: any[]): STDObject => ({
        x: data[0]?.[0] ?? 0.4, y: data[0]?.[1] ?? 0.4, z: data[0]?.[2] ?? 0.4, // small marker
        ox: data[1]?.[0] ?? 0, oy: data[1]?.[1] ?? 0, oz: data[1]?.[2] ?? 0,
        rx: data[2]?.[0] ?? 0, ry: data[2]?.[1] ?? 0, rz: data[2]?.[2] ?? 0,
        source: data[3] != null ? String(data[3]) : '',
        autoplay: data[4] != null ? !!data[4] : true,
        loop: data[5] != null ? !!data[5] : true,
        volume: typeof data[6] === 'number' ? data[6] : 1,
        refDistance: typeof data[7] === 'number' ? data[7] : 8,
    }),
    serialize: (std: STDObject) => [
        [std.x, std.y, std.z],
        [std.ox, std.oy, std.oz],
        [std.rx, std.ry, std.rz],
        std.source ?? '',
        std.autoplay ? 1 : 0,
        std.loop ? 1 : 0,
        std.volume ?? 1,
        std.refDistance ?? 8,
    ],
};

const transform: AdjunctTransform = {
    stdToRenderData: (stds: STDObject[], elevation: number): RenderObject[] => {
        return stds.map((row, i) => ({
            type: "box",                     // small visible marker (edit-visible; play-hide is P5)
            index: i,
            params: {
                size: Coords.getBoxDimensions([row.x, row.y, row.z]),
                position: [row.ox, row.oy, row.oz + elevation],
                rotation: [row.rx, row.ry, row.rz],
            },
            material: { color: config.color },
            media: row.source
                ? {
                    kind: 'audio' as const,
                    source: String(row.source),
                    autoplay: row.autoplay !== false,
                    loop: row.loop !== false,
                    volume: row.volume ?? 1,
                    refDistance: row.refDistance ?? 8,
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
            title: "Audio",
            fields: [
                { key: "source", label: "Source (id/URL/CID)", type: "text" as const, value: std.source ?? '' },
                { key: "volume", label: "Volume", type: "number" as const, value: std.volume ?? 1, min: 0, max: 1, step: 0.05 },
                { key: "refDistance", label: "Falloff radius", type: "number" as const, value: std.refDistance ?? 8, min: 0.5, step: 0.5 },
            ],
        },
    ],
};

export const AdjunctAudio: AdjunctDefinition = {
    hooks: {
        reg: () => reg,
        init: () => ({ chain: "", value: null }),
    },
    transform,
    attribute,
    menu: menu as any,
};
