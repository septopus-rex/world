import type { StylePack, FaceVariant, VariantPart } from '@engine/core/spp/Variants';
import { listOptionPartKinds } from '@engine/core/spp/Variants';
import { adjunctTypeName } from '@engine/core/types/AdjunctType';

/** open / closed pool key. */
export type Pool = 'open' | 'closed';

/** A projected face-highlight polygon (screen px) + a facing-camera flag. */
export interface HlPoly { pts: Array<{ x: number; y: number }>; front: boolean; }

/** Face order = ParticleFace [Top, Bottom, Front(S), Back(N), Left(W), Right(E)]. */
export const FACE_NAMES = ['顶 Top', '底 Bottom', '前 S', '后 N', '左 W', '右 E'];

/** A face references a variant by its stable key (P4), falling back to name/index. */
export const variantRef = (v: FaceVariant, i: number): string => v.key ?? v.name ?? String(i);

/**
 * How a part of each kind is FRAMED when first dropped in — the only half of a
 * part this editor owns. The other half (which types exist, what raw tail they
 * start with, what they are called) comes from the engine via
 * `listOptionPartKinds()`, so there is no second copy to drift: adding an
 * adjunct type to the engine's placement defaults makes it appear here.
 *
 * A frame is in the face's unit box: u/v = in-plane offset, su/sv = in-plane
 * size, sw = inward depth (omitted ⇒ the theme's wall thickness). FULL is the
 * fallback — a part that covers the whole face, which is right for anything
 * wall-like and a sane starting point for the rest.
 */
const FULL = { u: 0, v: 0, su: 1, sv: 1 };
const FRAMES: Record<number, Omit<VariantPart, 'type' | 'props'>> = {
    0x00a1: FULL,                                                    // wall — the whole face
    0x00b4: { ...FULL, sw: 0.2 },                                    // stop — thin barrier over the face
    0x00a2: { u: 0.3, v: 0.3, su: 0.4, sv: 0.4, sw: 0.4 },           // box — centred block
    0x00a7: { u: 0.35, v: 0.35, su: 0.3, sv: 0.3, sw: 0.3 },         // ball
    0x00a6: { u: 0.35, v: 0, su: 0.3, sv: 0.5, sw: 0.3 },            // cone — stands on the face
    0x00a4: { u: 0.3, v: 0, su: 0.4, sv: 0.6, sw: 0.4 },             // module — a model in the opening
    0x00a5: { u: 0.1, v: 0, su: 0.8, sv: 0.3, sw: 0.6 },             // water — a shallow pool
    0x00a8: { u: 0.2, v: 0.4, su: 0.6, sv: 0.3, sw: 0.05 },          // sign — flat plaque on the face
    0x00b8: { ...FULL, sw: 0.5 },                                    // trigger — a volume in the opening
    0x00e1: { u: 0.25, v: 0.35, su: 0.5, sv: 0.35, sw: 0.1 },        // link panel
    0x00e2: { u: 0.4, v: 0.6, su: 0.2, sv: 0.2, sw: 0.2 },           // audio emitter — small, high
    0x00e3: { u: 0.15, v: 0.3, su: 0.7, sv: 0.45, sw: 0.1 },         // video screen
    0x00e4: { u: 0.4, v: 0.05, su: 0.2, sv: 0.25, sw: 0.2 },         // book — sits low
    0x00e5: { u: 0.15, v: 0.3, su: 0.7, sv: 0.5, sw: 0.15 },         // board
};

/** 中文别名（纯 i18n，不是第二份定义）：缺的自动回落到引擎英文名，所以引擎新增
 *  一型时这里不改也能用，只是显示英文。 */
const CN: Record<number, string> = {
    0x00a1: '墙', 0x00a2: '盒', 0x00a4: '模型', 0x00a5: '水', 0x00a6: '锥', 0x00a7: '球',
    0x00a8: '牌', 0x00b4: '挡', 0x00b8: '触发', 0x00e1: '链接', 0x00e2: '音频',
    0x00e3: '视频', 0x00e4: '书', 0x00e5: '板',
};

/** Part kinds you can drop into a state's option — enumerated from the ENGINE
 *  (types + starter tails + names), framed by the table above. */
export const PART_KINDS: Array<{ label: string; def: VariantPart }> = listOptionPartKinds().map((k) => ({
    label: `${CN[k.typeId] ?? k.name} ${typeHex(k.typeId)}`,
    def: { type: k.typeId, ...(FRAMES[k.typeId] ?? FULL), props: k.props } as VariantPart,
}));

/** `0x00a1` → `a1` — the short id creators read in the protocol docs. */
function typeHex(t: number): string { return t.toString(16).padStart(4, '0').slice(2); }

/** Lower-case engine type name ('wall', 'module', …) — also the e2e handle
 *  suffix (`sp-add-<name>`). Falls back to hex for unknown ids. */
export const typeName = (t: number): string => adjunctTypeName(t).toLowerCase();

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
