import type { StylePack, FaceVariant, VariantPart, Prefab } from '@engine/core/spp/Variants';
import { listOptionPartKinds, DEFAULT_PREFAB_SIZE } from '@engine/core/spp/Variants';
import { adjunctTypeName } from '@engine/core/types/AdjunctType';
import { DEEP_LIMIT } from '@engine/core/spp/OptionGuard';
import { PALETTE, PALETTE_SLOT3_TYPES } from '@engine/core/utils/Palette';

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

/**
 * How deep a freshly dropped part sits. Two requirements pull against each
 * other, so this is DERIVED rather than a constant per type:
 *
 *   · it must be VISIBLE — a part shallower than the face's own wall slab is
 *     buried inside it, and dropping one reads as "nothing happened";
 *   · it must not trip the contract guard on arrival — `part-too-deep` fires
 *     above `DEEP_LIMIT`.
 *
 * Until 2026-08-09 these were fixed numbers and 0x00a2 box shipped at `sw 0.4`:
 * every first box a user dropped arrived with a warning already attached, and
 * sat so far into the cell that it rendered as a HOLE punched through the face
 * rather than a block sitting on it. Both symptoms, one bad default.
 *
 * The cap wins over visibility on purpose: on a pack with an unusually thick
 * shell the part lands buried but SILENT, which the author fixes by typing a
 * depth — better than a tool whose own defaults are flagged as mistakes.
 */
const dropDepth = (want: number, thickness: number) =>
    // Rounded: this number goes straight into exported JSON, and
    // `0.3 - 0.02 = 0.27999999999999997` is not something to ship in a document.
    Math.round(Math.min(Math.max(want, thickness + 0.08), DEEP_LIMIT - 0.02) * 1e4) / 1e4;

/** Part kinds you can drop into a state's option — enumerated from the ENGINE
 *  (types + starter tails + names), framed by the table above, at a depth that
 *  suits THIS pack's shell. */
export function partKinds(thickness: number): Array<{ label: string; def: VariantPart }> {
    return listOptionPartKinds().map((k) => {
        const frame = FRAMES[k.typeId] ?? FULL;
        return {
            label: `${CN[k.typeId] ?? k.name} ${typeHex(k.typeId)}`,
            def: {
                type: k.typeId, ...frame, props: k.props,
                ...(frame.sw != null ? { sw: dropDepth(frame.sw, thickness) } : {}),
            } as VariantPart,
        };
    });
}

/** Material choices for a part whose slot 3 is a colour. Index 0 = the family's
 *  own default (what every untouched part already carries), 1..n = the engine's
 *  normative palette, each entry carrying roughness/metalness with it. */
export const MATERIALS: Array<{ value: number; label: string; color: string }> = [
    { value: 0, label: '默认色 (该型自带)', color: '#888888' },
    ...PALETTE.map((e, i) => ({
        value: i, label: `${i} ${e.label}`, color: `#${e.color.toString(16).padStart(6, '0')}`,
    })).slice(1),
];

/** True when this part's raw slot 3 is a colour, i.e. a material picker applies.
 *  a4 keeps a model id there, a8 a texture, b4 a stop mode — offering a colour
 *  for those would silently corrupt the row. */
export const takesMaterial = (typeId: number): boolean => PALETTE_SLOT3_TYPES.has(typeId);

/** Swap a part's type: the frame (where it sits) is the author's, the raw tail
 *  is the TYPE's, so the tail must be replaced wholesale — an a4's [modelId]
 *  reinterpreted as an a2's [colour, repeat, …] is nonsense. */
export function retypePart(part: VariantPart, typeId: number, thickness: number): VariantPart {
    const kind = partKinds(thickness).find((k) => k.def.type === typeId);
    return { ...part, type: typeId, props: kind ? JSON.parse(JSON.stringify(kind.def.props)) : [] };
}

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

// ─── 组合件 Prefabs (§9) ─────────────────────────────────────────────────────

/**
 * What u/v/su/sv/w/sw MEAN in each frame. The numbers are the same six; the
 * axes they name are not, and a UI that labels them identically in both places
 * is how an author builds a bench lying on its side. A face option's `v` runs
 * up the wall and `sw` bites inward; a prefab's `v` runs north across the floor
 * and `sw` is the object's height.
 */
export const FACE_AXES: [string, string, string, string, string, string] =
    ['u 横', 'v 竖', 'su 宽', 'sv 高', 'w 深', 'sw 厚'];
export const PREFAB_AXES: [string, string, string, string, string, string] =
    ['u 东', 'v 北', 'su 东西', 'sv 南北', 'w 离地', 'sw 高'];

export const FACE_FRAME_HELP = '面的单位帧：u/v 是面内 0..1，w/sw 是向内的深度。';
export const PREFAB_FRAME_HELP = '胞的单位帧：u→东 X · v→北 Y（地面足迹），w→离地高度、sw→自身高度，均为 0..1。';

/**
 * A freshly dropped prefab part: a centred block STANDING ON the floor.
 *
 * One constant, not a per-type table like FRAMES. A face part has a natural
 * pose because the face tells it where to be (a wall fills it, a sign lies flat
 * on it); a prefab part has no such cue — the author is building an object out
 * of blocks and will type real numbers immediately. Inventing a per-type guess
 * here would be a second table to keep in sync with FRAMES for no gain.
 */
export const prefabPartFrame = (): Omit<VariantPart, 'type' | 'props'> =>
    ({ u: 0.3, v: 0.3, su: 0.4, sv: 0.4, w: 0, sw: 0.4 });

/** Part kinds framed for a prefab (same engine-enumerated types, floor pose). */
export function prefabPartKinds(): Array<{ label: string; def: VariantPart }> {
    return partKinds(0.2).map((k) => ({
        label: k.label,
        def: { ...k.def, ...prefabPartFrame() } as VariantPart,
    }));
}

/** A blank 组合件 — furniture-scale cube, no parts yet. */
export const blankPrefab = (key: string): Prefab =>
    ({ key, name: key, size: DEFAULT_PREFAB_SIZE, parts: [] });

/** The initial collapse dial for a pack: all six faces closed on its first option. */
export const defaultDial = (p: StylePack): Array<[number, string]> =>
    Array.from({ length: 6 }, () => [1, variantRef(p.closed[0], 0)] as [number, string]);
