import {
    ComponentMeta,
    STDObject,
    RenderObject,
    AdjunctDefinition,
    AdjunctTransform,
    AdjunctAttribute,
    AdjunctMenu
} from '../../core/types/index';

// -----------------------------------------------------------------------------
// 0. EDITOR INTERFACES (Should ideally live in an editor-ui package later)
// -----------------------------------------------------------------------------
export interface EditorFormConfig {
    type: "number" | "select" | "bool" | "button" | "string";
    key: keyof STDObject;
    value?: any;
    label: string;
    icon?: string;
    desc: string;
    valid: (val: any, cvt: number, std: STDObject) => any | false;
}

export interface EditorMenuItem {
    type: "button";
    label: string;
    icon: string;
    action: (ev: any) => void;
}

/**
 * Helper to calculate valid dimension boundaries on resize
 */
const helpers = {
    reviseSizeOffset: (offset: number, desiredSize: number, maxSpace: number) => {
        const finalOffset = desiredSize > maxSpace
            ? maxSpace * 0.5
            : desiredSize * 0.5 + offset > maxSpace
                ? maxSpace - 0.5 * desiredSize
                : offset < 0.5 * desiredSize
                    ? 0.5 * desiredSize
                    : offset;

        const finalSize = desiredSize > maxSpace ? maxSpace : desiredSize;
        return { offset: finalOffset, size: finalSize };
    }
};

/**
 * Wall Component Metadata
 * Defines the static details about the wall for the ECS registry.
 */
export const WallMeta: ComponentMeta = {
    name: "wall",
    short: "WL",
    typeId: 2, // Arbitrary definition, must match your component registry config
    binarySize: 18, // Adjust based on final binary struct for Wall if customized
    desc: "Solid wall primitive",
    version: "1.0.0"
};

/**
 * Default Component Configuration
 * For rendering and materials when properties are absent.
 */
const DEFAULT_CONFIG = {
    color: 0xf8f8f8, // Pending state color
    stop: {
        offset: 0.05,
        color: 0xffffff,
        opacity: 0.5,
    }
};

// -----------------------------------------------------------------------------
// 2. EDITOR UI & VALIDATION LAYER (For Human Editing, Bypassed by AI Generation)
// -----------------------------------------------------------------------------

/**
 * Validation rules strictly for human input in the editor.
 */
const validRules: Record<string, (val: any, cvt: number, std: STDObject) => any | false> = {
    x: (val, cvt) => {
        const n = parseInt(val);
        if (isNaN(n) || n <= 0) return false;
        return n / cvt;
    },
    y: (val, cvt) => {
        const n = parseInt(val);
        if (isNaN(n) || n <= 0) return false;
        return n / cvt;
    },
    z: (val, cvt) => {
        const n = parseInt(val);
        if (isNaN(n) || n <= 0) return false;
        return n / cvt;
    },
    ox: (val) => {
        const n = parseInt(val);
        if (isNaN(n) || n <= 0) return false;
        return n;
    },
    oy: (val, cvt) => {
        const n = parseInt(val);
        if (isNaN(n) || n <= 0) return false;
        return n / cvt;
    },
    oz: (val, cvt) => {
        const n = parseInt(val);
        if (isNaN(n) || n <= 0) return false;
        return n / cvt;
    },
    // Other rot/texture validations fall back to simple assignment...
    rx: () => { }, ry: () => { }, rz: () => { }
};

/**
 * Editor Menu Definitions (Right click & Sidebar properties)
 */
export const WallMenu: AdjunctMenu = {
    pop: (std: STDObject): EditorMenuItem[] => [
        { type: "button", label: "Info", icon: "", action: () => console.log("Info pressed", std) },
        { type: "button", label: "Remove", icon: "", action: () => console.log("Remove pressed") },
        { type: "button", label: "Copy", icon: "", action: () => console.log("Copy pressed") },
    ],

    sidebar: (std: STDObject): Record<string, EditorFormConfig[]> => ({
        size: [
            { type: "number", key: "x", value: std.x, label: "X", desc: "Width of wall", valid: validRules.x },
            { type: "number", key: "y", value: std.y, label: "Y", desc: "Thickness of wall", valid: validRules.y },
            { type: "number", key: "z", value: std.z, label: "Z", desc: "Height of wall", valid: validRules.z },
        ],
        position: [
            { type: "number", key: "ox", value: std.ox, label: "X Offset", desc: "X inner position", valid: validRules.ox },
            { type: "number", key: "oy", value: std.oy, label: "Y Offset", desc: "Y inner position", valid: validRules.oy },
            { type: "number", key: "oz", value: std.oz, label: "Z Offset", desc: "Z inner position", valid: validRules.oz },
        ],
        rotation: [
            { type: "number", key: "rx", value: std.rx, label: "RX", desc: "X Rotation", valid: validRules.rx },
            { type: "number", key: "ry", value: std.ry, label: "RY", desc: "Y Rotation", valid: validRules.ry },
            { type: "number", key: "rz", value: std.rz, label: "RZ", desc: "Z Rotation", valid: validRules.rz },
        ]
    })
};

/**
 * Editor State Mutation & Safegaurds (Modifies STDObject safely)
 */
export const WallAttribute = {
    revise: (param: Partial<STDObject>, row: STDObject, limit: [number, number, number]): Partial<STDObject> => {
        // Enforce boundary logic when coordinates are modified
        if (param.x !== undefined) {
            const result = helpers.reviseSizeOffset(row.ox, param.x, limit[0]);
            param.ox = result.offset;
            param.x = result.size;
        }
        if (param.y !== undefined) {
            const result = helpers.reviseSizeOffset(row.oy, param.y, limit[1]);
            param.oy = result.offset;
            param.y = result.size;
        }
        if (param.z !== undefined) {
            const result = helpers.reviseSizeOffset(row.oz, param.z, limit[2]);
            param.oz = result.offset;
            param.z = result.size;
        }
        return param;
    }
};

// -----------------------------------------------------------------------------
// 3. RUNTIME ENGINE PIPELINE (Used by AI and World Base Load)
// -----------------------------------------------------------------------------
export const WallTransform: AdjunctTransform = {
    /**
     * Converts standardized semantic layout into RenderObjects (Three.js/3D Engine ready)
     * @param stds Standardized layout data array
     * @param elevation Base floor elevation value
     */
    stdToRenderData(stds: STDObject[], elevation: number): RenderObject[] {
        return stds.map((row, index) => {
            const renderObj: RenderObject = {
                type: "box",
                index: index,
                params: {
                    size: [row.x, row.y, row.z],
                    // Apply base elevation calculation to Z-axis position
                    position: [row.ox, row.oy, row.oz + elevation],
                    rotation: [row.rx, row.ry, row.rz],
                },
                material: row.material,
            };

            // Set up collision volume (stop property)
            if (row.stop) {
                renderObj.stop = {
                    opacity: DEFAULT_CONFIG.stop.opacity,
                    color: DEFAULT_CONFIG.stop.color
                };
            }

            // Bind any provided animation states
            if (row.animate !== undefined && row.animate !== null) {
                renderObj.animate = row.animate;
            }

            // Bind any specific event implementations
            if (row.event) {
                renderObj.event = row.event;
            }

            return renderObj;
        });
    }

    // stdToRaw, stdToActive, stdTo2D omitted for brevity but follow same decoupled structure
};

// -----------------------------------------------------------------------------
// 4. ECS COMPONENT REGISTRATION
// -----------------------------------------------------------------------------
export const AdjunctWall: AdjunctDefinition = {
    hooks: {
        reg: () => WallMeta,
        init: () => ({ chain: "", value: null })
    },
    transform: WallTransform,
    // The "Hybrid" link. Editor frameworks will consume these, standard engine pipelines ignore them.
    menu: WallMenu as any,
    attribute: WallAttribute as any
};
