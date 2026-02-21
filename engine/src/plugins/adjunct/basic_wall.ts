import { AdjunctStandardData } from '../../core/components/AdjunctComponents';

/**
 * Adjunct - Wall (Ported to TS/ECS)
 *
 * Implements the SPP Adjunct Protocol for a Wall, replacing legacy adjunct_wall.js
 */

const reg = {
    name: "wall",
    category: 'adjunct',
    desc: "Wall with texture. Hole on it will be supported soon.",
    version: "1.0.0",
    events: ["hide", "show", "crash"],
};

// Default styling
const config = {
    color: 0xf8f8f8,
    stop: {
        offset: 0.05,
        color: 0xffffff,
        opacity: 0.5,
    }
};

const menu = {
    sidebar: (std: any) => {
        if (!std) return {};
        // Note: keeping the same input keys (x/y/z) but modifying standard params
        return {
            size: [
                { type: "number", key: "x", value: std.size[0], label: "X Size", desc: "X size of wall" },
                { type: "number", key: "y", value: std.size[1], label: "Y Size", desc: "Y size of wall" },
                { type: "number", key: "z", value: std.size[2], label: "Z Size", desc: "Z size of wall" },
            ],
            position: [
                { type: "number", key: "ox", value: std.position[0], label: "X Pos offset" },
                { type: "number", key: "oy", value: std.position[1], label: "Y Pos offset" },
                { type: "number", key: "oz", value: std.position[2], label: "Z Pos offset" },
            ],
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
     * Maps the SPP Standard Z-Up coordinate system to the Three.js render pipeline.
     */
    std_3d: (stds: any[], elevation: number) => {
        const arr = [];
        for (let i = 0; i < stds.length; i++) {
            const row = stds[i];

            const single: AdjunctStandardData = {
                type: "box", // A wall renders as a box in Three.js terms
                index: i,
                params: {
                    size: [row.params.size[0], row.params.size[1], row.params.size[2]],
                    // Append block elevation. In legacy code Wall anchor shifted Z, but
                    // handled upstream or here depending on protocol definitions.
                    position: [row.params.position[0], row.params.position[1], row.params.position[2] + elevation],
                    rotation: [row.params.rotation[0], row.params.rotation[1], row.params.rotation[2]],
                },
                material: row.material || { color: config.color },
                animate: row.animate,
            };

            if (row.stop) {
                single.stop = {
                    opacity: config.stop.opacity,
                    color: config.stop.color
                };
            }

            if (row.event) {
                single.event = row.event;
            }
            arr.push(single);
        }
        return arr;
    }
};

export const BasicWallAdjunct = {
    hooks: { reg: () => reg },
    transform,
    menu
};
