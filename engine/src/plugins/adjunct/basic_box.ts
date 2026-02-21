import { AdjunctStandardData } from '../../core/components/AdjunctComponents';

/**
 * Adjunct - Box (Ported to TS/ECS)
 *
 * Implements the SPP Adjunct Protocol for a basic 3D box.
 */

const reg = {
    name: "box",
    category: 'basic',
    desc: "Basic adjunct of meta septopus.",
    version: "1.0.0",
    events: ["in", "out", "touch"]
};

// Default styling
const config = {
    color: 0xf3f5f6,
    stop: {
        offset: 0.05,
        color: 0xffffff,
        opacity: 0.5,
    }
};

const valid = {
    x: (val: any, cvt: number) => {
        const n = parseInt(val);
        if (isNaN(n) || n <= 0) return false;
        return parseFloat((n / cvt).toString());
    },
    y: (val: any, cvt: number) => {
        const n = parseInt(val);
        if (isNaN(n) || n <= 0) return false;
        return parseFloat((n / cvt).toString());
    },
    z: (val: any, cvt: number) => {
        const n = parseInt(val);
        if (isNaN(n) || n <= 0) return false;
        return parseFloat((n / cvt).toString());
    }
};

const menu = {
    sidebar: (std: any) => {
        return {
            size: [
                { type: "number", key: "x", value: std.x, label: "X", desc: "X size of box" },
                { type: "number", key: "y", value: std.y, label: "Y", desc: "Y size of box" },
                { type: "number", key: "z", value: std.z, label: "Z", desc: "Z size of box" },
            ],
            position: [
                { type: "number", key: "ox", value: std.ox, label: "X offset" },
                { type: "number", key: "oy", value: std.oy, label: "Y offset" },
                { type: "number", key: "oz", value: std.oz, label: "Z offset" },
            ],
            rotation: [
                { type: "number", key: "rx", value: std.rx, label: "X rot" },
                { type: "number", key: "ry", value: std.ry, label: "Y rot" },
                { type: "number", key: "rz", value: std.rz, label: "Z rot" },
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
                type: "box",
                index: i,
                params: {
                    size: [row.params.size[0], row.params.size[1], row.params.size[2]],
                    // Append block elevation to the local Z-axis
                    position: [row.params.position[0], row.params.position[1], row.params.position[2] + elevation],
                    rotation: [row.params.rotation[0], row.params.rotation[1], row.params.rotation[2]],
                },
                material: row.material,
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

export const BasicBoxAdjunct = {
    hooks: { reg: () => reg },
    transform,
    menu
};
