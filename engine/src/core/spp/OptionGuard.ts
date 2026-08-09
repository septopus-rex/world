/**
 * OptionGuard — objective checks on an SPP option (spp-editors.md §3.7).
 *
 * An option lives in the face's unit frame: u/v in-plane offset, su/sv in-plane
 * size, w/sw inward depth, all normalized to 0..1. Some ways of filling that
 * frame are simply WRONG regardless of taste — geometry that pokes out of its
 * own cell and fights the neighbour, a part with no size that renders nothing, a
 * `closed` option that blocks nothing, an `open` option you cannot walk through.
 *
 * Why this is a guard and not a validator: authorship is the creator's call
 * (spec §3.7 — "提示不硬拦"). It reports; the editor shows; nothing is refused.
 * The point is to keep *judgement* focused on what actually needs judgement.
 * A reviewer — human or model — looking at a preview cannot see that a wall is
 * 0.001 too wide, but can see whether it looks like a bulkhead. Machines take
 * the first kind, eyes take the second; mixing them wastes both.
 *
 * Pure functions over data: no engine, no renderer, no world.
 */

import { FaceState } from '../types/ParticleCell';
import type { FaceVariant, VariantPart } from './Variants';

export type IssueLevel = 'error' | 'warn';

export interface OptionIssue {
    level: IssueLevel;
    /** Stable machine code — UIs group on it, tests assert on it. */
    code:
        | 'part-out-of-cell'    // geometry leaves the unit cell → fights neighbours
        | 'part-overhang'       // sticks OUT past the face plane — legal, but it lands in the neighbour
        | 'part-too-deep'       // reaches so far in that it blocks the other faces' options
        | 'part-zero-size'      // no extent on some axis → renders nothing
        | 'closed-empty'        // a 挡 option with no parts blocks nothing
        | 'closed-thin'         // a 挡 option that covers almost none of the face
        | 'open-sealed'         // a 通 option that covers the whole face
        | 'parts-coincident';   // two parts occupy the same box → z-fighting
    message: string;
    /** Index into `variant.parts`, when the issue is about one part. */
    partIndex?: number;
}

/** Face coverage below this in a `closed` option ⇒ it hardly blocks anything. */
const CLOSED_MIN_COVERAGE = 0.15;
/** Face coverage at or above this in an `open` option ⇒ nothing can pass. */
const OPEN_MAX_COVERAGE = 0.95;
/** Sizes below this are treated as zero (authoring noise, not intent). */
const EPS = 1e-4;
/**
 * Inward depth past which a face's part starts eating the cell's interior.
 * A face option is CLADDING: the bundled packs sit at 0.06–0.08 of the cell
 * (a 0.25 m skin on a 4 m cell). At 0.3 a part reaches nearly a third of the way
 * in, and — this is the failure that motivated the rule — from any OTHER face's
 * viewpoint it stands right in front of that face's own option, hiding it. The
 * symptom is maddening: the option looks correct alone and vanishes when all six
 * faces use it, and nothing about the data is illegal. `w + sw <= 1` does not
 * catch it, because not punching through the far side was never the point.
 */
const DEEP_LIMIT = 0.3;

const su = (p: VariantPart) => p.su ?? 0;
const sv = (p: VariantPart) => p.sv ?? 0;

/**
 * Union area of axis-aligned rectangles, exactly (coordinate compression +
 * per-strip sweep). Approximating this with a sampling grid would make the
 * thresholds resolution-dependent — a wall could pass or fail on grid size
 * alone, which is exactly the kind of "flaky rule" a guard must not have.
 */
export function unionArea(rects: Array<{ x: number; y: number; w: number; h: number }>): number {
    const boxes = rects.filter(r => r.w > EPS && r.h > EPS);
    if (!boxes.length) return 0;
    const xs = [...new Set(boxes.flatMap(r => [r.x, r.x + r.w]))].sort((a, b) => a - b);
    let area = 0;
    for (let i = 0; i < xs.length - 1; i++) {
        const x0 = xs[i], x1 = xs[i + 1], dx = x1 - x0;
        if (dx <= 0) continue;
        // y-intervals of the boxes spanning this x-strip, merged.
        const ys = boxes
            .filter(r => r.x <= x0 + EPS && r.x + r.w >= x1 - EPS)
            .map(r => [r.y, r.y + r.h] as [number, number])
            .sort((a, b) => a[0] - b[0]);
        let covered = 0, curEnd = -Infinity, curStart = -Infinity;
        for (const [s, e] of ys) {
            if (s > curEnd) { if (curEnd > curStart) covered += curEnd - curStart; curStart = s; curEnd = e; }
            else if (e > curEnd) curEnd = e;
        }
        if (curEnd > curStart) covered += curEnd - curStart;
        area += dx * covered;
    }
    return area;
}

/** How much of the face (0..1) this option's parts cover, in-plane. */
export function faceCoverage(variant: FaceVariant): number {
    const parts = variant.parts ?? [];
    return unionArea(parts.map(p => ({ x: p.u ?? 0, y: p.v ?? 0, w: su(p), h: sv(p) })));
}

/**
 * Check one option. `state` decides the semantic half of the checks: the same
 * geometry is fine as a wall and wrong as a doorway.
 */
export function checkOption(variant: FaceVariant, state: FaceState): OptionIssue[] {
    const issues: OptionIssue[] = [];
    const parts = variant.parts ?? [];
    const name = variant.key ?? variant.name ?? '?';

    parts.forEach((p, i) => {
        const u = p.u ?? 0, v = p.v ?? 0, w = p.w ?? 0;
        const sw = p.sw;
        // IN-PLANE overflow is always wrong: u/v are the face's own 0..1 axes, so
        // leaving them means spilling onto a different face. No reading of that
        // is intentional.
        const over: string[] = [];
        if (u < -EPS || u + su(p) > 1 + EPS) over.push(`u ${u}+${su(p)}`);
        if (v < -EPS || v + sv(p) > 1 + EPS) over.push(`v ${v}+${sv(p)}`);
        // DEPTH is not symmetric. Going too deep (w+sw > 1) punches through to
        // the opposite face — an error. Sticking OUT (w < 0) is the architectural
        // vocabulary of eaves / oriels / cornices, and the bundled spanish pack
        // uses it deliberately (`roof_eaves` overhangs by 0.05). So it is a
        // warning about a real consequence — the overhang lands in the
        // neighbouring cell's space — not a mistake to be corrected.
        if (sw != null && w + sw > 1 + EPS) over.push(`w ${w}+${sw}`);
        if (over.length) {
            issues.push({
                level: 'error', code: 'part-out-of-cell', partIndex: i,
                message: `part ${i} 伸出单位胞（${over.join(' · ')}）——会和邻格的几何打架`,
            });
        }
        if (w < -EPS) {
            issues.push({
                level: 'warn', code: 'part-overhang', partIndex: i,
                message: `part ${i} 向外挑出 ${(-w).toFixed(2)}（屋檐/飘窗的常用手法）——它会进入邻格空间，邻格那面若也有几何就会打架`,
            });
        }
        if (sw != null && sw > DEEP_LIMIT) {
            issues.push({
                level: 'warn', code: 'part-too-deep', partIndex: i,
                message: `part ${i} 向内伸进 ${sw!.toFixed(2)}（内建风格包普遍在 0.06~0.08）——它会横在其他五个面的造型前面，六面同用时你会看不见自己刚做的东西`,
            });
        }
        // Zero extent in-plane: nothing is drawn, the part is dead data.
        if (su(p) <= EPS || sv(p) <= EPS) {
            issues.push({
                level: 'error', code: 'part-zero-size', partIndex: i,
                message: `part ${i} 尺寸为 0（su=${su(p)} sv=${sv(p)}）——不产生任何几何`,
            });
        }
    });

    // Coincident parts: identical box ⇒ coplanar surfaces ⇒ z-fighting.
    for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
            const a = parts[i], b = parts[j];
            const same = (x?: number, y?: number) => Math.abs((x ?? 0) - (y ?? 0)) < EPS;
            if (same(a.u, b.u) && same(a.v, b.v) && same(a.su, b.su) && same(a.sv, b.sv) &&
                same(a.w, b.w) && same(a.sw, b.sw)) {
                issues.push({
                    level: 'warn', code: 'parts-coincident', partIndex: j,
                    message: `part ${i} 与 part ${j} 完全重合——共面会闪烁（z-fighting）`,
                });
            }
        }
    }

    const cov = faceCoverage(variant);
    if (state === FaceState.Closed) {
        if (!parts.length) {
            issues.push({
                level: 'error', code: 'closed-empty',
                message: `「${name}」在「挡」池里却没有任何 part——它挡不住任何东西，语义与 open 无异`,
            });
        } else if (cov < CLOSED_MIN_COVERAGE) {
            issues.push({
                level: 'warn', code: 'closed-thin',
                message: `「${name}」只覆盖了面的 ${(cov * 100).toFixed(0)}%——作为「挡」几乎不成墙，要挡路补一个 b4 stop`,
            });
        }
    } else if (parts.length && cov >= OPEN_MAX_COVERAGE) {
        issues.push({
            level: 'warn', code: 'open-sealed',
            message: `「${name}」在「通」池里却覆盖了面的 ${(cov * 100).toFixed(0)}%——这个「通」过不去`,
        });
    }

    return issues;
}

/** Check every option of a pack. Returns issues tagged with where they live. */
export function checkPack(pack: { closed?: FaceVariant[]; open?: FaceVariant[] }):
    Array<OptionIssue & { pool: 'closed' | 'open'; variantKey: string }> {
    const out: Array<OptionIssue & { pool: 'closed' | 'open'; variantKey: string }> = [];
    for (const pool of ['closed', 'open'] as const) {
        const state = pool === 'closed' ? FaceState.Closed : FaceState.Open;
        for (const v of pack[pool] ?? []) {
            const key = v.key ?? v.name ?? '?';
            for (const iss of checkOption(v, state)) out.push({ ...iss, pool, variantKey: key });
        }
    }
    return out;
}
