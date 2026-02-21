import { AdjunctStandardData } from '../../core/components/AdjunctComponents';

/**
 * Adjunct - Water (Ported to TS/ECS)
 *
 * Implements the SPP Adjunct Protocol for Water, replacing legacy adjunct_water.js
 */

const reg = {
    name: "water",
    category: "adjunct",
    desc: "Water adjunct, used to create special landscape.",
    version: "1.0.0",
};

// Default styling
const config = {
    color: 0x44aaff,
    opacity: 0.6
};

const menu = {
    sidebar: (std: any) => {
        if (!std) return {};
        return {
            size: [
                { type: "number", key: "x", value: std.size[0], label: "X Size", desc: "X size of water" },
                { type: "number", key: "y", value: std.size[1], label: "Y Size", desc: "Y size of water" },
                { type: "number", key: "z", value: std.size[2], label: "Z Size", desc: "Depth" },
            ],
            position: [
                { type: "number", key: "ox", value: std.position[0], label: "X Pos offset" },
                { type: "number", key: "oy", value: std.position[1], label: "Y Pos offset" },
                { type: "number", key: "oz", value: std.position[2], label: "Z Pos offset" },
            ],
            // Water usually doesn't rotate, but keeping standard params for UI editing
            rotation: [
                { type: "number", key: "rx", value: std.rotation[0], label: "X rot" },
                { type: "number", key: "ry", value: std.rotation[1], label: "Y rot" },
                { type: "number", key: "rz", value: std.rotation[2], label: "Z rot" },
            ],
        };
    }
};

const transform = {
    /**
     * Converts SPP stdData into 3D rendering parameters.
     */
    std_3d: (stds: any[], elevation: number) => {
        const arr = [];
        for (let i = 0; i < stds.length; i++) {
            const row = stds[i];

            const single: AdjunctStandardData = {
                type: "box", // Water renders as a semi-transparent box or plane
                index: i,
                params: {
                    size: [row.params.size[0], row.params.size[1], row.params.size[2]],
                    position: [row.params.position[0], row.params.position[1], row.params.position[2] + elevation],
                    rotation: [row.params.rotation[0], row.params.rotation[1], row.params.rotation[2]],
                },
                material: row.material || { color: config.color, opacity: config.opacity },
                animate: row.animate,
            };

            arr.push(single);
        }
        return arr;
    }
};

export const BasicWaterAdjunct = {
    hooks: { reg: () => reg },
    transform,
    menu
};
