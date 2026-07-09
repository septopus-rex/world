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
import { Coords } from '../../core/utils/Coords.js';

/**
 * Adjunct — Board / message board (e5)
 *
 * A guestbook / notice wall you click to open a live message panel — the 5th
 * member of the e-series panel family (e1 link · e2 audio · e3 video · e4 book).
 * Where e4 carries its text INSIDE the data (pages, immutable content), e5
 * carries only a `channel` id: the messages are MUTABLE SHARED STATE living on
 * a server, exactly like a Pattern-A game session (game.md §2/§3 — the block
 * declares intent, the host dials the service). The engine renders the board
 * and emits the generic `interact.primary` on click; listing/posting is a host
 * concern (client BoardPanel ↔ services/board dev server, offline → read-only).
 *
 * Raw layout (standard 7-slot prefix + slots 7/8):
 *   [ size[E,N,Alt], pos[ox,oy,oz], rot[rx,ry,rz], resource, repeat,
 *     animation, stop, channel, title? ]
 *
 * slot 7 `channel` — string id of the message channel (server-side key). Blocks
 *   may share a channel (one plaza wall shown at two gates) or scope their own.
 * slot 8 `title` — optional string shown in the panel chrome.
 */

const reg: ComponentMeta = {
    name: "board",
    short: "BD",
    typeId: AdjunctType.Board,
    desc: "Message board (click to read/leave messages; channel lives on a server).",
    version: "1.0.0",
};

// Cork over a timber frame, so an untextured board still reads as a board.
const config = { color: 0x9b7653 };

const attribute: AdjunctAttribute = {
    deserialize: (data: any[]): STDObject => ({
        x: data[0]?.[0] ?? 2.4, y: data[0]?.[1] ?? 0.15, z: data[0]?.[2] ?? 1.6, // wall board
        ox: data[1]?.[0] ?? 0, oy: data[1]?.[1] ?? 0, oz: data[1]?.[2] ?? 0,
        rx: data[2]?.[0] ?? 0, ry: data[2]?.[1] ?? 0, rz: data[2]?.[2] ?? 0,
        material: {
            resource: data[3] ?? 0,
            repeat: data[4] ?? [1, 1],
        },
        animate: data[5] ?? null,
        stop: data[6] ?? null,
        channel: typeof data[7] === 'string' && data[7] ? data[7] : 'lobby',
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
        std.channel ?? 'lobby',
        std.title ?? '',
    ],
};

const transform: AdjunctTransform = {
    stdToRenderData: (stds: STDObject[], elevation: number): RenderObject[] => {
        return stds.map((row, i) => {
            const color = row.material?.texture ? 0xffffff : config.color;
            return {
                type: "box", // upright notice board
                index: i,
                params: {
                    size: Coords.getBoxDimensions([row.x, Math.max(row.y, 0.05), row.z]),
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
            title: "Board",
            fields: [
                { key: "channel", label: "Channel", type: "text" as const, value: std.channel ?? 'lobby' },
                { key: "title", label: "Title", type: "text" as const, value: std.title ?? '' },
            ],
        },
        {
            title: "Size",
            fields: [
                { key: "x", label: "Width (E)", type: "number" as const, value: std.x, min: 0.5, step: 0.1 },
                { key: "y", label: "Depth (N)", type: "number" as const, value: std.y, min: 0.05, step: 0.05 },
                { key: "z", label: "Height", type: "number" as const, value: std.z, min: 0.5, step: 0.1 },
            ],
        },
    ],
};

export const AdjunctBoard: AdjunctDefinition = {
    hooks: {
        reg: () => reg,
        init: () => ({ chain: "", value: null })
    },
    transform,
    attribute,
    menu: menu as any
};
