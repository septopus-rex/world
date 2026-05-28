import {
    ComponentMeta,
    STDObject,
    RenderObject,
    AdjunctDefinition,
    AdjunctTransform,
    AdjunctAttribute
} from '../../core/types/Adjunct';
import { ContextMenuItem, FormGroup } from '../../core/types/EditTask';

/**
 * Light Adjunct — point light, spot light, directional light
 *
 * Raw format: [lightType, pos, rot, color, intensity, distance, angle, shadow]
 *   lightType: 0=point, 1=spot, 2=directional
 *   pos: [x, y, z] SPP local position
 *   rot: [rx, ry, rz] rotation (used for spot/directional target direction)
 *   color: hex number e.g. 0xffffff
 *   intensity: number e.g. 1.0
 *   distance: number — range for point/spot (0 = infinite)
 *   angle: number — cone angle for spot light (radians), ignored for others
 *   shadow: 0 or 1 — enable shadow casting
 */

export const LightMeta: ComponentMeta = {
    name: "light",
    short: "LT",
    typeId: 0x00a3,
    desc: "Light source adjunct (point, spot, directional)",
    version: "1.0.0"
};

const menu = {
    contextMenu: (std: STDObject): ContextMenuItem[] => [
        { label: "✏️ Edit Light", action: "edit" },
        { label: "🗑️ Delete", action: "delete", variant: "danger" as const }
    ],
    form: (std: STDObject): FormGroup[] => [
        {
            title: "Light Type",
            fields: [
                {
                    key: "lightType", label: "Type", type: "select" as const,
                    value: std.lightType ?? 0,
                    options: [
                        { label: "Point Light", value: 0 },
                        { label: "Spot Light", value: 1 },
                        { label: "Directional", value: 2 },
                    ]
                }
            ]
        },
        {
            title: "Position",
            fields: [
                { key: "ox", label: "X", type: "number" as const, value: std.ox, step: 0.5 },
                { key: "oy", label: "Y", type: "number" as const, value: std.oy, step: 0.5 },
                { key: "oz", label: "Z", type: "number" as const, value: std.oz, step: 0.5 },
            ]
        },
        {
            title: "Properties",
            fields: [
                { key: "color", label: "Color", type: "number" as const, value: std.color ?? 0xffffff },
                { key: "intensity", label: "Intensity", type: "number" as const, value: std.intensity ?? 1, min: 0, step: 0.1 },
                { key: "distance", label: "Distance", type: "number" as const, value: std.distance ?? 0, min: 0, step: 1 },
                { key: "angle", label: "Spot Angle", type: "number" as const, value: std.angle ?? Math.PI / 3, min: 0, step: 0.1 },
                { key: "shadow", label: "Shadow", type: "select" as const, value: std.shadow ?? 0, options: [{ label: "Off", value: 0 }, { label: "On", value: 1 }] },
            ]
        }
    ]
};

const attribute: AdjunctAttribute = {
    deserialize: (data: any[]): STDObject => {
        return {
            x: 0, y: 0, z: 0,
            ox: data[1]?.[0] ?? 8, oy: data[1]?.[1] ?? 8, oz: data[1]?.[2] ?? 8,
            rx: data[2]?.[0] ?? 0, ry: data[2]?.[1] ?? 0, rz: data[2]?.[2] ?? 0,
            lightType: data[0] ?? 0,
            color: data[3] ?? 0xffffff,
            intensity: data[4] ?? 1,
            distance: data[5] ?? 0,
            angle: data[6] ?? Math.PI / 3,
            shadow: data[7] ?? 0,
        };
    },
    serialize: (std: STDObject) => {
        return [
            std.lightType ?? 0,
            [std.ox, std.oy, std.oz],
            [std.rx, std.ry, std.rz],
            std.color ?? 0xffffff,
            std.intensity ?? 1,
            std.distance ?? 0,
            std.angle ?? Math.PI / 3,
            std.shadow ?? 0,
        ];
    }
};

const transform: AdjunctTransform = {
    stdToRenderData: (stds: STDObject[], elevation: number): RenderObject[] => {
        return stds.map((row, index) => ({
            type: "light",
            index,
            params: {
                size: [0, 0, 0],
                position: [row.ox, row.oy, row.oz],
                rotation: [row.rx, row.ry, row.rz],
            },
            material: {
                color: row.color ?? 0xffffff,
            },
            // Light-specific fields — consumed by MeshFactory.createLight()
            lightType: row.lightType ?? 0,
            intensity: row.intensity ?? 1,
            distance: row.distance ?? 0,
            angle: row.angle ?? Math.PI / 3,
            shadow: row.shadow ?? 0,
        } as any));
    }
};

export const AdjunctLight: AdjunctDefinition = {
    hooks: {
        reg: () => LightMeta,
        init: () => ({ chain: "", value: null })
    },
    transform,
    attribute,
    menu: menu as any
};
