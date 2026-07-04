import {
    ComponentMeta,
    STDObject,
    RenderObject,
    AdjunctDefinition,
    AdjunctTransform,
    AdjunctAttribute
} from '../../core/types/Adjunct.js';
import { AdjunctType } from '../../core/types/AdjunctType';
import { Coords } from '../../core/utils/Coords.js';

/**
 * Adjunct - Track (c1) — a tube swept along control points (coaster rail / pipe).
 *
 * The render layer already has a `tube` primitive (MeshFactory, Catmull-Rom
 * extrusion); this adjunct is what wires it into the ECS/data pipeline so a
 * tube can be authored, expanded from SPP (coaster theme → c1), serialized and
 * rendered. Visual only — the cart rides a path computed by CoasterSystem, so
 * no collider is attached.
 *
 * Raw: [ pos[ox,oy,oz], path[[x,y,z]...] (SPP, relative to pos), radius ]
 *   pos  — the piece origin (Septopus block-local); positioned like any adjunct.
 *   path — control points relative to pos, in SPP; the transform converts each
 *          to engine-local (localSeptopusToEngine) for the mesh's tube geometry.
 */
const reg: ComponentMeta = {
    name: "track",
    short: "TK",
    typeId: AdjunctType.Track,
    desc: "Tube track piece (coaster rail), swept along control points.",
    version: "1.0.0",
};

const config = { color: 0x9a6b3f, radius: 0.3 };

const attribute: AdjunctAttribute = {
    deserialize: (data: any[]): STDObject => ({
        x: 0.3, y: 0.3, z: 0.3,
        ox: data[0]?.[0] ?? 0, oy: data[0]?.[1] ?? 0, oz: data[0]?.[2] ?? 0,
        rx: 0, ry: 0, rz: 0,
        path: Array.isArray(data[1]) ? data[1] : [],
        radius: typeof data[2] === 'number' ? data[2] : config.radius,
    }),
    serialize: (std: STDObject) => [
        [std.ox, std.oy, std.oz],
        std.path ?? [],
        std.radius ?? config.radius,
    ],
};

const transform: AdjunctTransform = {
    stdToRenderData: (stds: STDObject[], elevation: number): RenderObject[] => {
        return stds.map((row, i) => {
            const pts: [number, number, number][] = (row.path ?? []) as any;
            // Control points are SPP offsets relative to the piece origin; the
            // mesh's tube is built in engine-local space, so convert each.
            const path = pts.map(p => Coords.localSeptopusToEngine(p));
            return {
                type: "tube",
                index: i,
                params: {
                    size: [row.radius ?? config.radius, 8, 0],
                    position: [row.ox, row.oy, row.oz + elevation],
                    rotation: [0, 0, 0],
                    path,
                },
                material: { color: config.color },
            };
        });
    }
};

export const AdjunctTrack: AdjunctDefinition = {
    hooks: {
        reg: () => reg,
        init: () => ({ chain: "", value: null })
    },
    transform,
    attribute
};
