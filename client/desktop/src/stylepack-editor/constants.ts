import type { StylePack, FaceVariant, VariantPart } from '@engine/core/spp/Variants';

/** open / closed pool key. */
export type Pool = 'open' | 'closed';

/** A projected face-highlight polygon (screen px) + a facing-camera flag. */
export interface HlPoly { pts: Array<{ x: number; y: number }>; front: boolean; }

/** Face order = ParticleFace [Top, Bottom, Front(S), Back(N), Left(W), Right(E)]. */
export const FACE_NAMES = ['顶 Top', '底 Bottom', '前 S', '后 N', '左 W', '右 E'];

/** A face references a variant by its stable key (P4), falling back to name/index. */
export const variantRef = (v: FaceVariant, i: number): string => v.key ?? v.name ?? String(i);

/** Part kinds you can drop into a state's option (geometry primitives + adjuncts). */
export const PART_KINDS: Array<{ label: string; def: VariantPart }> = [
    { label: '墙 a1', def: { type: 0x00a1, u: 0, v: 0, su: 1, sv: 1, props: [0, [1, 1], 0, 1] } },
    { label: '盒 a2', def: { type: 0x00a2, u: 0.3, v: 0.3, su: 0.4, sv: 0.4, sw: 0.4, props: [2, [1, 1], 0, 0] } },
    { label: '球 a7', def: { type: 0x00a7, u: 0.35, v: 0.35, su: 0.3, sv: 0.3, sw: 0.3, props: [0, [1, 1], 0, 0] } },
    { label: '模型 a4', def: { type: 0x00a4, u: 0.3, v: 0, su: 0.4, sv: 0.6, sw: 0.4, props: ['model.glb'] } },
    { label: '挡 b4', def: { type: 0x00b4, u: 0, v: 0, su: 1, sv: 1, sw: 0.2, props: [0, null] } },
];

export const typeName = (t: number): string =>
    ({ 0x00a1: 'wall', 0x00a2: 'box', 0x00a7: 'ball', 0x00a4: 'model', 0x00b4: 'stop' } as Record<number, string>)[t] ?? `0x${t.toString(16)}`;

/** Lift any legacy `pieces` into a1 `parts` so the editor always edits parts. */
export function liftPack(src: StylePack): StylePack {
    const p: StylePack = JSON.parse(JSON.stringify(src));
    for (const pool of ['open', 'closed'] as Pool[]) {
        (p[pool] ?? []).forEach((v) => {
            if (!v.parts && v.pieces) {
                v.parts = v.pieces.map((pc) => ({ type: 0x00a1, u: pc.du, v: pc.dv, su: pc.su, sv: pc.sv, props: [p.texture ?? 0, [1, 1], 0, 1] }));
                delete v.pieces;
            }
            if (!v.parts) v.parts = [];
        });
    }
    return p;
}

/** The initial collapse dial for a pack: all six faces closed on its first option. */
export const defaultDial = (p: StylePack): Array<[number, string]> =>
    Array.from({ length: 6 }, () => [1, variantRef(p.closed[0], 0)] as [number, string]);
