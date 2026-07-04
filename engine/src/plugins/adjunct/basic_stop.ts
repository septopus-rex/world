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
 *   5 = shape (1 BOX · 2 BALL cylinder · 3 SLOPE wedge; default BOX)
 *
 * Modes are carried for forward-compat; collision currently treats every stop as
 * a full AABB (BODY: blocks horizontally, standable on top, blocks the head).
 * FOOT/HEAD-only differential collision is a follow-up on CharacterController.
 *
 * SHAPES (restores the old engine's slot-3 box|ball selector, relocated to slot 5
 * because the TS port had already claimed slot 3 for mode):
 *   BALL  — vertical cylinder: circular XY footprint (radius = size[0]/2, height =
 *           size[2]), flat standable top. The player slides around it instead of
 *           snagging on AABB corners.
 *   SLOPE — wedge ramp: at rotation 0 the top face rises from the south edge (y =
 *           -size[1]/2, ground) to the north edge (full size[2]); walkable via the
 *           regular step-over channel. Collision honors ONLY the vertical-axis
 *           rotation (raw ry — engine yaw per coordinate.md §3.1); rx/rz would
 *           tilt the visual without tilting the collider, so keep them 0.
 */
export const STOP_MODE = { BODY: 1, FOOT: 2, HEAD: 3 } as const;
export const STOP_SHAPE = { BOX: 1, BALL: 2, SLOPE: 3 } as const;

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
            animate: data[4] ?? null,
            stopShape: data[5] ?? STOP_SHAPE.BOX
        };
    },
    serialize: (std: STDObject) => {
        return [
            [std.x, std.y, std.z],
            [std.ox, std.oy, std.oz],
            [std.rx, std.ry, std.rz],
            std.stopMode ?? STOP_MODE.BODY,
            std.animate,
            std.stopShape ?? STOP_SHAPE.BOX
        ];
    }
};

const transform: AdjunctTransform = {
    stdToRenderData: (stds: STDObject[]): RenderObject[] => {
        return stds.map((row, index) => {
            const shape = row.stopShape ?? STOP_SHAPE.BOX;
            // MeshFactory conventions: box/wedge take engine dims [w,h,d];
            // cylinder takes [radiusTop, radiusBottom, height].
            const type = shape === STOP_SHAPE.BALL ? "cylinder"
                : shape === STOP_SHAPE.SLOPE ? "wedge" : "box";
            const size: [number, number, number] = shape === STOP_SHAPE.BALL
                ? [row.x / 2, row.x / 2, row.z]
                : Coords.getBoxDimensions([row.x, row.y, row.z]) as [number, number, number];
            return {
                type,
                index,
                params: {
                    size,
                    position: [row.ox, row.oy, row.oz],
                    rotation: [row.rx, row.ry, row.rz],
                },
                // Translucent so the collider reads as a "force field", not a solid box.
                material: { color: STOP_COLOR, opacity: STOP_OPACITY },
                stop: { opacity: STOP_OPACITY, color: STOP_COLOR }
            };
        });
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
                },
                {
                    key: "stopShape", label: "Shape", type: "select" as const,
                    value: std.stopShape ?? STOP_SHAPE.BOX,
                    options: [
                        { label: "Box", value: STOP_SHAPE.BOX },
                        { label: "Ball (cylinder)", value: STOP_SHAPE.BALL },
                        { label: "Slope (ramp)", value: STOP_SHAPE.SLOPE },
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
