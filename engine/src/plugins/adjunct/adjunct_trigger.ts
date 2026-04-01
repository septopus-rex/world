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
// Assume the new Trigger types are re-exported from index or imported directly:
// import { TriggerVolumeComponent, TriggerLogicNode } from '../../core/types/Trigger';

/**
 * Trigger Component Metadata
 */
export const TriggerMeta: ComponentMeta = {
    name: "trigger",
    short: "TR",
    typeId: 3,
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
    stdToRenderData(stds: STDObject[], elevation: number): RenderObject[] {
        return stds.map((row, index) => {

            // In the SPP/ECS model, Triggers don't need Three.js meshes.
            // However, to keep it compatible with existing pipelines that might 
            // use the Scene Graph for spatial queries, we can emit a 'box' type 
            // but explicitly mark it hidden.

            const renderObj: RenderObject & { triggerVolume?: any, hidden?: boolean, event?: any } = {
                type: "box", // Always emit a box for consistency, actual shape handled by triggerVolume
                index: index,
                hidden: true, // Crucial: Do not draw this!
                params: {
                    size: Coords.getBoxDimensions([row.x, row.y, row.z]),
                    position: [row.ox, row.oy, row.oz],
                    rotation: [row.rx, row.ry, row.rz],
                },
                // Crucial for AdjunctSystem to attach TriggerComponent
                event: row.event,
            };

            // Attach the pure data payload for the TriggerSystem ECS
            renderObj.triggerVolume = {
                shape: row.shape === 2 ? "sphere" : "box",
                type: row.triggerType, // 1: in, 2: out, 3: hold
                size: [row.x, row.y, row.z],
                offset: [0, 0, 0],
                logic: row.logic,
                runOnce: row.runOnce === 1,
                gameOnly: row.gameOnly === 1
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
        // ... Position & Rotation ...
        logic: [
            // Replaces the old function builder with a direct JSON editing panel
            {
                type: "json",
                key: "event" as any,
                value: std.event?.rawLogic || "[]",
                label: "Logic Array",
                desc: "Data-driven conditions and actions"
            }
        ]
    })
};

// -----------------------------------------------------------------------------
// 3. ATTRIBUTE LAYER (RAW DATA MAPPING)
// -----------------------------------------------------------------------------
export const TriggerAttribute: AdjunctAttribute = {
    /**
     * Map Septopus Native Array indices to STDObject
     * [size, pos, rot, shape, type, logic, run_once, game_only]
     */
    deserialize: (data: any[]): STDObject => {
        return {
            x: data[0][0] ?? 1, y: data[0][1] ?? 1, z: data[0][2] ?? 1,
            ox: data[1][0] ?? 0, oy: data[1][1] ?? 0, oz: data[1][2] ?? 0,
            rx: data[2][0] ?? 0, ry: data[2][1] ?? 0, rz: data[2][2] ?? 0,
            shape: data[3] ?? 1,      // 1: box, 2: ball
            triggerType: data[4] ?? 1, // 1: in, 2: out, 3: hold
            logic: data[5] ?? [],
            runOnce: data[6] ?? 0,
            gameOnly: data[7] ?? 1,
            event: {
                rawLogic: data[5] ?? []
            }
        };
    },
    serialize: (std: STDObject) => {
        return [
            [std.x, std.y, std.z],
            [std.ox, std.oy, std.oz],
            [std.rx, std.ry, std.rz],
            std.shape,
            std.triggerType,
            std.logic,
            std.runOnce,
            std.gameOnly
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
