import {
    ComponentMeta,
    STDObject,
    RenderObject,
    AdjunctDefinition,
    AdjunctTransform
} from '../../core/types/Adjunct.js';
import { Coords } from '../../core/utils/Coords.js';

/**
 * Adjunct - Wall (Modernized)
 */

const reg: ComponentMeta = {
    name: "wall",
    short: "WL",
    typeId: 2,
    desc: "Wall with texture support.",
    version: "1.0.0",
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

const transform: AdjunctTransform = {
    /**
     * Converts SPP stdData into 3D rendering parameters.
     */
    stdToRenderData: (stds: STDObject[], elevation: number): RenderObject[] => {
        return stds.map((row, i) => {
            const renderObj: RenderObject = {
                type: "box",
                index: i,
                params: {
                    size: Coords.getBoxDimensions([row.x, row.y, row.z]),
                    position: [row.ox, row.oy, row.oz + elevation],
                    rotation: [row.rx, row.ry, row.rz],
                },
                material: row.material || { color: config.color },
                animate: row.animate,
            };

            if (row.stop) {
                renderObj.stop = {
                    opacity: config.stop.opacity,
                    color: config.stop.color
                };
            }

            if (row.event) {
                renderObj.event = row.event;
            }
            return renderObj;
        });
    }
};

export const BasicWallAdjunct: AdjunctDefinition = {
    hooks: {
        reg: () => reg,
        init: () => ({ chain: "", value: null })
    },
    transform
};
