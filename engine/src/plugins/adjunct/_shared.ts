import { STDObject, AdjunctAttribute } from '../../core/types/Adjunct';
import { ContextMenuItem, FormGroup } from '../../core/types/EditTask';

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
