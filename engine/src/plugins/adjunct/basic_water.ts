import {
    ComponentMeta,
    STDObject,
    RenderObject,
    AdjunctDefinition,
    AdjunctTransform
} from '../../core/types/Adjunct.js';
import { Coords } from '../../core/utils/Coords.js';
import { standardAttribute } from './_shared.js';

/**
 * Adjunct - Water (Modernized)
 *
 * NOTE: water has no confirmed on-chain type-id in the current Septopus adjunct
 * set (wall a1 / box a2 / light a3 / module a4 / cone a6 / ball a7 / stop b4 /
 * trigger b8). So it is intentionally NOT registered in BlockSystem yet — wire
 * it once its chain short code is confirmed. The transform + attribute are ready.
 */

const reg: ComponentMeta = {
    name: "water",
    short: "WT",
    typeId: 0x00a5, // tentative — UNCONFIRMED; do not register until verified
    desc: "Water adjunct (semi-transparent box).",
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
    transform,
    attribute: standardAttribute
};
