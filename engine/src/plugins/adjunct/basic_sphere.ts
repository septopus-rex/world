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
 * Basic Sphere Adjunct (Modernized)
 * Chain type-id 0x00a7 is the "ball" adjunct (engine renders it as a sphere).
 */

const reg: ComponentMeta = {
    name: "sphere",
    short: "SPH",
    typeId: 0x00a7,
    desc: "Sphere adjunct (chain 'ball', 0x00a7).",
    version: "1.0.0",
};

export const BasicSphereAdjunct: AdjunctDefinition = {
    hooks: {
        reg: () => reg,
        init: () => ({ chain: "", value: null })
    },
    transform: {
        stdToRenderData: (stds: STDObject[], elevation: number): RenderObject[] => {
            return stds.map((row, i) => ({
                type: "sphere",
                index: i,
                params: {
                    // Spheres use radius, but we map SPP size[0] (width) as diameter
                    size: Coords.getBoxDimensions([row.x, row.y, row.z]),
                    position: [row.ox, row.oy, row.oz + elevation],
                    rotation: [row.rx, row.ry, row.rz],
                },
                material: row.material,
                animate: row.animate,
            }));
        }
    },
    attribute: standardAttribute
};
