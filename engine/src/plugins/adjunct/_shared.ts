import { STDObject, AdjunctAttribute } from '../../core/types/Adjunct';

/**
 * Standard Septopus adjunct (de)serialization, shared by the primitive adjuncts
 * (box / wall / cone / sphere / water). These all use the same raw array layout:
 *
 *   [ size[E,N,Alt], pos[ox,oy,oz], rot[rx,ry,rz], resource, repeat, animation, stop ]
 *
 * deserialize (raw -> STD) is on the render hot path (BlockSystem dispatch);
 * serialize (STD -> raw) is needed so edits to these adjuncts persist as drafts.
 */
export const standardAttribute: AdjunctAttribute = {
    deserialize: (data: any[]): STDObject => ({
        x: data[0]?.[0] ?? 1, y: data[0]?.[1] ?? 1, z: data[0]?.[2] ?? 1, // [E, N, Alt]
        ox: data[1]?.[0] ?? 0, oy: data[1]?.[1] ?? 0, oz: data[1]?.[2] ?? 0,
        rx: data[2]?.[0] ?? 0, ry: data[2]?.[1] ?? 0, rz: data[2]?.[2] ?? 0,
        material: {
            resource: data[3] ?? 0,
            repeat: data[4] ?? [1, 1],
        },
        animate: data[5] ?? null,
        stop: data[6] ?? null,
    }),
    serialize: (std: STDObject) => [
        [std.x, std.y, std.z],
        [std.ox, std.oy, std.oz],
        [std.rx, std.ry, std.rz],
        std.material?.resource,
        std.material?.repeat,
        std.animate,
        std.stop,
    ],
};
