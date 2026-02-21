import { IAdjunctLogic } from '../../core/systems/AdjunctSystem';

/**
 * Basic Sphere Adjunct (Ported from adjunct_ball.js)
 * Adheres to SPP Adjunct Protocol.
 */
export const BasicSphereAdjunct: IAdjunctLogic = {
    transform: {
        std_3d: (stds: any[], va: number) => {
            return stds.map((row, i) => ({
                type: "sphere",
                index: i,
                params: {
                    size: [row.params.size[0], row.params.size[1], row.params.size[2]],
                    position: [row.params.position[0], row.params.position[1], row.params.position[2] + va],
                    rotation: [row.params.rotation[0], row.params.rotation[1], row.params.rotation[2]],
                },
                material: row.material,
                animate: row.animate,
            }));
        }
    },

    menu: {
        sidebar: (std: any) => {
            if (!std) return {};
            return {
                radius: [
                    { type: "number", key: "radius", value: std.size[0] / 2, label: "Radius", step: 0.1, min: 0.1 }
                ],
                position: [
                    { type: "number", key: "ox", value: std.position[0], step: 0.1, label: "X offset" },
                    { type: "number", key: "oy", value: std.position[1], step: 0.1, label: "Y offset" },
                    { type: "number", key: "oz", value: std.position[2], step: 0.1, label: "Z offset" }
                ],
                rotation: [
                    { type: "number", key: "rx", value: std.rotation[0], step: 0.1, label: "X rot" },
                    { type: "number", key: "ry", value: std.rotation[1], step: 0.1, label: "Y rot" },
                    { type: "number", key: "rz", value: std.rotation[2], step: 0.1, label: "Z rot" }
                ]
            };
        }
    }
};
