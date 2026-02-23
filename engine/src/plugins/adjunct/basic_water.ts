import {
    ComponentMeta,
    STDObject,
    RenderObject,
    AdjunctDefinition,
    AdjunctTransform
} from '../../core/types/Adjunct.js';
import { Coords } from '../../core/utils/Coords.js';

/**
 * Adjunct - Water (Modernized)
 */

const reg: ComponentMeta = {
    name: "water",
    short: "WT",
    typeId: 3, // Assuming typeId based on context
    desc: "Water adjunct.",
    version: "1.0.0",
};

// Default styling
const config = {
    color: 0x44aaff,
    opacity: 0.6
};

const transform: AdjunctTransform = {
    /**
     * Converts SPP stdData into 3D rendering parameters.
     */
    stdToRenderData: (stds: STDObject[], elevation: number): RenderObject[] => {
        return stds.map((row, i) => ({
            type: "box", // Water renders as a semi-transparent box
            index: i,
            params: {
                size: Coords.getBoxDimensions([row.x, row.y, row.z]),
                position: [row.ox, row.oy, row.oz + elevation],
                rotation: [row.rx, row.ry, row.rz],
            },
            material: row.material || { color: config.color, opacity: config.opacity },
            animate: row.animate,
        }));
    }
};

export const BasicWaterAdjunct: AdjunctDefinition = {
    hooks: {
        reg: () => reg,
        init: () => ({ chain: "", value: null })
    },
    transform
};
