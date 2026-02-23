import {
    ComponentMeta,
    STDObject,
    RenderObject,
    AdjunctDefinition,
    AdjunctTransform
} from '../../core/types/Adjunct.js';
import { Coords } from '../../core/utils/Coords.js';

/**
 * Basic Sphere Adjunct (Modernized)
 */

const reg: ComponentMeta = {
    name: "sphere",
    short: "SPH",
    typeId: 4,
    desc: "Sphere adjunct.",
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
    }
};
