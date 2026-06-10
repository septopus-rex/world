import {
    ComponentMeta,
    STDObject,
    RenderObject,
    AdjunctDefinition,
    AdjunctTransform,
    AdjunctMenu,
    AdjunctAttribute
} from '../../core/types/Adjunct.js';
import { Coords } from '../../core/utils/Coords.js';
import type { TriggerLogicNode } from '../../core/types/Trigger.js';

/**
 * Trigger Component Metadata
 */
export const TriggerMeta: ComponentMeta = {
    name: "trigger",
    short: "TR",
    typeId: 0x00b8, // chain type-id b8 (matches AdjunctRegistry dispatch key)
    binarySize: 24, // Assuming custom sizing if necessary
    desc: "Interactive spatial volume (No mesh rendered)",
    version: "2.0.0"
};

// -----------------------------------------------------------------------------
// 0. EDITOR INTERFACES 
// -----------------------------------------------------------------------------
// Similar to wall, we define configs for the Editor Sidebar
export interface EditorFormConfig {
    type: "number" | "select" | "bool" | "string" | "json";
    key: keyof STDObject;
    value?: any;
    label: string;
    desc: string;
    valid?: (val: any) => any | false;
}

// -----------------------------------------------------------------------------
// 1. RUNTIME ENGINE PIPELINE
// -----------------------------------------------------------------------------

/**
 * Trigger Transform Logic
 * Unlike 'wall', the Trigger outputs a `RenderObject` but with `hidden: true`
 * and attaches a mathematical `triggerVolume` component payload.
 */
export const TriggerTransform: AdjunctTransform = {
    stdToRenderData(stds: STDObject[], _elevation: number): RenderObject[] {
        return stds.map((row, index) => {
            const renderObj: RenderObject & { triggerVolume?: any; hidden?: boolean } = {
                type: "box",
                index,
                hidden: true,
                params: {
                    size: Coords.getBoxDimensions([row.x, row.y, row.z]),
                    position: [row.ox, row.oy, row.oz],
                    rotation: [row.rx, row.ry, row.rz],
                },
            };
            renderObj.triggerVolume = {
                shape: row.shape === 2 ? "sphere" : "box",
                size: [row.x, row.y, row.z],
                offset: [0, 0, 0],
                events: row.events ?? [],
            };
            return renderObj;
        });
    }
};

// -----------------------------------------------------------------------------
// 2. EDITOR UI LAYER (Bypassed by AI Generation)
// -----------------------------------------------------------------------------

export const TriggerMenu: AdjunctMenu = {
    pop: (std: STDObject) => [
        { type: "button", label: "Inspect Logic", icon: "", action: () => console.log(std) },
    ],

    sidebar: (std: STDObject): Record<string, EditorFormConfig[]> => ({
        size: [
            { type: "number", key: "x", value: std.x, label: "Width", desc: "X Extents" },
            { type: "number", key: "y", value: std.y, label: "Height", desc: "Y Extents" },
            { type: "number", key: "z", value: std.z, label: "Depth", desc: "Z Extents" },
        ],
        events: [
            {
                type: "json",
                key: "events" as any,
                value: JSON.stringify(std.events ?? [], null, 2),
                label: "Events (JSONLogic)",
                desc: "Array of { type, conditions?, actions, fallbackActions?, oneTime? }"
            }
        ]
    })
};

// -----------------------------------------------------------------------------
// 3. ATTRIBUTE LAYER (RAW DATA MAPPING)
// -----------------------------------------------------------------------------
export const TriggerAttribute: AdjunctAttribute = {
    /**
     * Slot map: [size, offset, rotation, shape, gameOnly, events]
     *
     * slot 5 = events: TriggerLogicNode[]
     *   { type, conditions?, actions, fallbackActions?, oneTime? }
     *
     * Backward-compat: if slot 5 is a plain array (old format) it is kept as-is
     * and deserialized into a single 'in' event with no conditions.
     */
    deserialize: (data: any[]): STDObject => {
        const rawEvents = data[5] ?? [];
        let events: TriggerLogicNode[];
        if (Array.isArray(rawEvents) && rawEvents.length > 0 && !rawEvents[0]?.type) {
            // old flat-array logic — wrap in a basic 'in' event
            events = [{ type: 'in', actions: rawEvents }];
        } else {
            events = rawEvents as TriggerLogicNode[];
        }
        return {
            x: data[0]?.[0] ?? 1, y: data[0]?.[1] ?? 1, z: data[0]?.[2] ?? 1,
            ox: data[1]?.[0] ?? 0, oy: data[1]?.[1] ?? 0, oz: data[1]?.[2] ?? 0,
            rx: data[2]?.[0] ?? 0, ry: data[2]?.[1] ?? 0, rz: data[2]?.[2] ?? 0,
            shape: data[3] ?? 1,     // 1: box, 2: sphere
            gameOnly: data[4] ?? 1,
            events,
        };
    },
    serialize: (std: STDObject) => {
        return [
            [std.x, std.y, std.z],
            [std.ox, std.oy, std.oz],
            [std.rx, std.ry, std.rz],
            std.shape ?? 1,
            std.gameOnly ?? 1,
            std.events ?? [],
        ];
    }
};

// -----------------------------------------------------------------------------
// 4. ECS COMPONENT REGISTRATION
// -----------------------------------------------------------------------------
export const AdjunctTrigger: AdjunctDefinition = {
    hooks: {
        reg: () => TriggerMeta,
        init: () => ({ chain: "", value: null })
    },
    transform: TriggerTransform,
    attribute: TriggerAttribute,
    menu: TriggerMenu as any,
};
