import {
    ComponentMeta,
    STDObject,
    RenderObject,
    AdjunctDefinition,
    AdjunctTransform
} from '../../core/types/Adjunct.js';

/**
 * Basic Cone/Cylinder Adjunct (Modernized)
 */

const reg: ComponentMeta = {
    name: "cone",
    short: "CN",
    typeId: 5,
    desc: "Cone/Cylinder adjunct.",
    version: "1.0.0",
};

export const BasicConeAdjunct: AdjunctDefinition = {
    hooks: {
        reg: () => reg,
        init: () => ({ chain: "", value: null })
    },
    transform: {
        stdToRenderData: (stds: STDObject[], elevation: number): RenderObject[] => {
            return stds.map((row, i) => ({
                type: "cone",
                index: i,
                params: {
                    // MeshFactory cylinder expects [radiusTop, radiusBottom, height]
                    // We map from STD: size[0]=radiusBottom, size[1]=height, size[2]=radiusTop
                    size: [row.z, row.x, row.y],
                    position: [row.ox, row.oy, row.oz + elevation],
                    rotation: [row.rx, row.ry, row.rz],
                },
                material: row.material,
                animate: row.animate,
            }));
        }
    }
};
