import {
    ComponentMeta,
    STDObject,
    RenderObject,
    AdjunctDefinition,
    AdjunctTransform,
    AdjunctAttribute
} from '../../core/types/Adjunct';
import { AdjunctType } from '../../core/types/AdjunctType';
import { ContextMenuItem, FormGroup } from '../../core/types/EditTask';
import { Coords } from '../../core/utils/Coords';

/**
 * Stop adjunct (chain type-id 0x00b4) — an (mostly invisible) COLLIDER:
 *   1. stops the player from crossing,
 *   2. is a standable surface to stand on.
 *
 * Port of the old engine's basic_stop. In the new engine collision is generic:
 * CharacterController collides against every entity carrying a SolidComponent
 * (AABB resolve + step-over + standable top), so a stop adjunct only has to mark
 * its std `stop: true` — BlockSystem.attachAdjunctComponents then attaches the
 * SolidComponent automatically. It renders as a faint translucent box so it can
 * be seen/placed in edit mode without cluttering the scene (set hidden for a
 * fully invisible collider in production).
 *
 * CANONICAL SLOT MAP (cleaned up from the old box-derived layout):
 *   0 = size [x,y,z]   1 = offset [ox,oy,oz]   2 = rotation [rx,ry,rz]
 *   3 = mode (1 BODY · 2 FOOT · 3 HEAD)   4 = animate (optional)
 *
 * Modes are carried for forward-compat; collision currently treats every stop as
 * a full AABB (BODY: blocks horizontally, standable on top, blocks the head).
 * FOOT/HEAD-only differential collision is a follow-up on CharacterController.
 */
export const STOP_MODE = { BODY: 1, FOOT: 2, HEAD: 3 } as const;

export const StopMeta: ComponentMeta = {
    name: "stop",
    short: "ST",
    typeId: AdjunctType.Stop,
    desc: "Invisible collider / standable barrier (stop the player crossing)",
    version: "1.0.0"
};

/** Faint translucent tint so the collider is visible in edit mode. */
const STOP_COLOR = 0x44ddff;
const STOP_OPACITY = 0.22;

const attribute: AdjunctAttribute = {
    deserialize: (data: any[]): STDObject => {
        return {
            x: data[0]?.[0] ?? 1, y: data[0]?.[1] ?? 1, z: data[0]?.[2] ?? 1,
            ox: data[1]?.[0] ?? 0, oy: data[1]?.[1] ?? 0, oz: data[1]?.[2] ?? 0,
            rx: data[2]?.[0] ?? 0, ry: data[2]?.[1] ?? 0, rz: data[2]?.[2] ?? 0,
            stop: true,                       // → BlockSystem attaches a SolidComponent
            stopMode: data[3] ?? STOP_MODE.BODY,
            animate: data[4] ?? null
        };
    },
    serialize: (std: STDObject) => {
        return [
            [std.x, std.y, std.z],
            [std.ox, std.oy, std.oz],
            [std.rx, std.ry, std.rz],
            std.stopMode ?? STOP_MODE.BODY,
            std.animate
        ];
    }
};

const transform: AdjunctTransform = {
    stdToRenderData: (stds: STDObject[]): RenderObject[] => {
        return stds.map((row, index) => ({
            type: "box",
            index,
            params: {
                size: Coords.getBoxDimensions([row.x, row.y, row.z]),
                position: [row.ox, row.oy, row.oz],
                rotation: [row.rx, row.ry, row.rz],
            },
            // Translucent so the collider reads as a "force field", not a solid box.
            material: { color: STOP_COLOR, opacity: STOP_OPACITY },
            stop: { opacity: STOP_OPACITY, color: STOP_COLOR }
        }));
    }
};

const menu = {
    contextMenu: (_std: STDObject): ContextMenuItem[] => [
        { label: "✏️ Edit Properties", action: "edit" },
        { label: "🗑️ Delete", action: "delete", variant: "danger" as const }
    ],
    form: (std: STDObject): FormGroup[] => [
        {
            title: "Size",
            fields: [
                { key: "x", label: "Width (E)", type: "number" as const, value: std.x, min: 0.1, step: 0.1 },
                { key: "y", label: "Depth (N)", type: "number" as const, value: std.y, min: 0.1, step: 0.1 },
                { key: "z", label: "Height", type: "number" as const, value: std.z, min: 0.1, step: 0.1 },
            ]
        },
        {
            title: "Position",
            fields: [
                { key: "ox", label: "X Offset", type: "number" as const, value: std.ox, step: 0.5 },
                { key: "oy", label: "Y Offset", type: "number" as const, value: std.oy, step: 0.5 },
                { key: "oz", label: "Z Offset", type: "number" as const, value: std.oz, step: 0.5 },
            ]
        },
        {
            title: "Behavior",
            fields: [
                {
                    key: "stopMode", label: "Stop Mode", type: "select" as const,
                    value: std.stopMode ?? STOP_MODE.BODY,
                    options: [
                        { label: "Body (full block)", value: STOP_MODE.BODY },
                        { label: "Foot (standable)", value: STOP_MODE.FOOT },
                        { label: "Head (ceiling)", value: STOP_MODE.HEAD },
                    ]
                }
            ]
        }
    ]
};

export const AdjunctStop: AdjunctDefinition = {
    hooks: {
        reg: () => StopMeta,
        init: () => ({ chain: "", value: null })
    },
    transform,
    attribute,
    menu: menu as any
};
