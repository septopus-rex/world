import {
    ComponentMeta,
    STDObject,
    RenderObject,
    AdjunctDefinition,
    AdjunctTransform,
    AdjunctMenu
} from '../../core/types/index';
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

            const renderObj: RenderObject & { triggerVolume?: any, hidden?: boolean } = {
                type: "box",
                index: index,
                params: {
                    size: [row.x, row.y, row.z],
                    position: [row.ox, row.oy, row.oz + elevation],
                    rotation: [row.rx, row.ry, row.rz],
                },
                hidden: true, // Crucial: Do not draw this!
            };

            // Parse the raw JSON logic definition from the STD Object
            // The AI or Editor will inject a JSON string or object into `row.event.rawLogic`
            let parsedLogic = [];
            if (row.event && row.event.rawLogic) {
                try {
                    parsedLogic = typeof row.event.rawLogic === 'string'
                        ? JSON.parse(row.event.rawLogic)
                        : row.event.rawLogic;
                } catch (e) {
                    console.warn(`Failed to parse AI Trigger Logic for trigger index ${index}`, e);
                }
            }

            // Attach the pure data payload for the upcoming TriggerSystem ECS
            renderObj.triggerVolume = {
                shape: "box",
                size: [row.x, row.y, row.z],
                offset: [0, 0, 0], // Anchor is strictly the position above
                logic: parsedLogic
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
// 3. ECS COMPONENT REGISTRATION
// -----------------------------------------------------------------------------
export const AdjunctTrigger: AdjunctDefinition = {
    hooks: {
        reg: () => TriggerMeta,
        init: () => ({ chain: "", value: null })
    },
    transform: TriggerTransform,
    menu: TriggerMenu as any,
    // Note: Removed the old complex JS closure attribute parsers.
};
