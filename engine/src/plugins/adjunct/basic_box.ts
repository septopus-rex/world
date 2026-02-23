import {
    ComponentMeta,
    STDObject,
    RenderObject,
    AdjunctDefinition,
    AdjunctTransform,
    AdjunctAttribute
} from '../../core/types/Adjunct';
import { Coords } from '../../core/utils/Coords';

/**
 * Box Component Metadata
 */
export const BoxMeta: ComponentMeta = {
    name: "box",
    short: "BX",
    typeId: 0x00a2,
    desc: "Basic 3D box primitive",
    version: "1.0.0"
};

const menu = {
    sidebar: (std: STDObject) => {
        return {
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
        };
    }
};

const attribute: AdjunctAttribute = {
    /**
     * Map Septopus Native Array indices to STDObject
     * [size, pos, rot, texture, repeat, animation, stop]
     */
    deserialize: (data: any[]): STDObject => {
        return {
            x: data[0][0] ?? 1, y: data[0][1] ?? 1, z: data[0][2] ?? 1, // [E, N, Alt]
            ox: data[1][0] ?? 0, oy: data[1][1] ?? 0, oz: data[1][2] ?? 0,
            rx: data[2][0] ?? 0, ry: data[2][1] ?? 0, rz: data[2][2] ?? 0,
            material: {
                resource: data[3] ?? 0,
                repeat: data[4] ?? [1, 1]
            },
            animate: data[5] ?? null,
            stop: data[6] ?? null
        };
    },
    serialize: (std: STDObject) => {
        return [
            [std.x, std.y, std.z],
            [std.ox, std.oy, std.oz],
            [std.rx, std.ry, std.rz],
            std.material?.resource,
            std.material?.repeat,
            std.animate,
            std.stop
        ];
    }
};

const transform: AdjunctTransform = {
    stdToRenderData: (stds: STDObject[], elevation: number): RenderObject[] => {
        return stds.map((row, index) => {
            // Color Mapping based on resource index
            const resId = (row.material?.resource as any) || 0;
            let color = 0x888888; // Default Gray

            if (resId === 10) color = 0x228b22; // Forest Green (Ground)
            if (resId === 1) color = 0x555555; // Dark Gray (Pillar)
            if (resId === 2) color = 0x3366ff; // Blue (Avatar/Float)
            if (resId === 3) color = 0xff0000; // Red (Flash)

            return {
                type: "box",
                index: index,
                params: {
                    size: Coords.getBoxDimensions([row.x, row.y, row.z]),
                    position: [row.ox, row.oy, row.oz],
                    rotation: [row.rx, row.ry, row.rz],
                },
                material: {
                    ...row.material,
                    color: color
                },
                animate: row.animate,
                stop: row.stop ? { opacity: 0.5, color: 0xffffff } : undefined
            };
        });
    }
};

export const AdjunctBox: AdjunctDefinition = {
    hooks: {
        reg: () => BoxMeta,
        init: () => ({ chain: "", value: null })
    },
    transform,
    attribute,
    menu: menu as any
};
