import { IAdjunctLogic } from '../../core/systems/AdjunctSystem';

/**
 * Basic Trigger Adjunct (Ported from basic_trigger.js)
 * Adheres to SPP Adjunct Protocol.
 * 
 * In the ECS architecture, this adjunct acts as a visual representation (box)
 * for a Trigger entity. The TriggerSystem handles the underlying logic.
 */
export const BasicTriggerAdjunct: IAdjunctLogic = {
    transform: {
        std_3d: (stds: any[], va: number) => {
            return stds.map((row, i) => ({
                type: "box",
                index: i,
                params: {
                    size: [row.params.size[0], row.params.size[1], row.params.size[2]],
                    position: [row.params.position[0], row.params.position[1], row.params.position[2] + va],
                    rotation: [row.params.rotation[0], row.params.rotation[1], row.params.rotation[2]],
                },
                material: {
                    color: 0xff3298,
                    opacity: 0.5,
                },
                hidden: true, // Usually triggers are invisible in production
                event: row.event // Pass through event bindings
            }));
        }
    },

    menu: {
        sidebar: (std: any) => {
            if (!std) return {};
            return {
                size: [
                    { type: "number", key: "x", value: std.size[0], label: "X Size" },
                    { type: "number", key: "y", value: std.size[1], label: "Y Size" },
                    { type: "number", key: "z", value: std.size[2], label: "Z Size" },
                ],
                position: [
                    { type: "number", key: "ox", value: std.position[0], label: "X offset" },
                    { type: "number", key: "oy", value: std.position[1], label: "Y offset" },
                    { type: "number", key: "oz", value: std.position[2], label: "Z offset" },
                ],
                actions: [
                    { type: "text", key: "actions", value: "Rotate Box on Enter", label: "Logic Script", desc: "SPP Action Script" }
                ]
            };
        }
    }
};
