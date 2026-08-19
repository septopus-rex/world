/**
 * Scoring — 番种 recognition and settlement, a working subset of 中国麻将竞赛
 * 规则 (国标). Pure functions; no engine types.
 *
 * WHY a subset: full 国标 is 81 patterns, many of which (一色四节高, 全不靠,
 * 组合龙 …) essentially never appear in casual play and each needs its own
 * exclusion wiring. The 30 implemented here cover everything a table actually
 * produces, keep every big hand (大三元 / 四暗刻 / 清幺九 / 十三幺) reachable, and
 * — the point — make discards a real decision: chasing 清一色 (24) over 断幺 (2)
 * changes how you play. `PATTERNS` is data, so adding more is additive.
 *
 * Settlement (国标): the winner takes 底分 8 + 番 from each opponent on 自摸; on
 * 点炮 the discarder pays 8 + 番 and the other two pay 底分 only.
 */

import {
    Kind, KINDS, Meld, isHonor, isWind, isDragon, isTerminalOrHonor, suitOf, meldTriplet,
} from './Tiles';
import { Decomposition, decompose, isSevenPairs, isThirteenOrphans } from './Rules';

export interface WinContext {
    /** Concealed tiles INCLUDING the winning tile, as a 34-histogram. */
    concealed: number[];
    melds: Meld[];
    winTile: Kind;
    /** Self-draw (自摸) vs claimed off a discard (点炮). */
    selfDraw: boolean;
    /** Seat wind 27..30 (門風) and round wind 27..30 (圈風). */
    seatWind: Kind;
    roundWind: Kind;
    /** 杠上开花 — won on the replacement tile after a kan. */
    afterKan?: boolean;
    /** 海底捞月 / 妙手回春 — won on the very last tile of the wall. */
    lastTile?: boolean;
}

export interface FanEntry { name: string; points: number; count?: number }

export interface ScoreResult {
    fan: FanEntry[];
    /** Total 番 after exclusions. */
    total: number;
    /** What each opponent pays (self-draw) or the discarder pays. */
    base: number;
    /** Winner's net gain. */
    gain: number;
    /** Per-seat delta is computed by the caller via `settle`. */
}

/** 底分 — every payer adds this on top of the 番. */
export const BASE_POINTS = 8;

// ── shape helpers ────────────────────────────────────────────────────────────

interface Shape {
    /** All 5 blocks: 4 sets + pair, melds included. */
    triplets: Kind[][];
    runs: Kind[][];
    pair: Kind;
    /** Triplets that were never exposed (for 暗刻 counting). */
    concealedTriplets: number;
    kans: Meld[];
    concealed: boolean;      // no chi/pon/open-kan (ankan still counts as concealed)
}

function shapesOf(ctx: WinContext): Shape[] {
    const need = 4 - ctx.melds.length;
    const out: Shape[] = [];
    const openMelds = ctx.melds.filter((m) => m.type !== 'ankan');
    const concealedHand = openMelds.length === 0;

    for (const d of decompose(ctx.concealed, need)) {
        const triplets: Kind[][] = [];
        const runs: Kind[][] = [];
        let concealedTrip = 0;
        d.sets.forEach((s, i) => {
            if (d.isTriplet[i]) {
                triplets.push(s);
                // A triplet completed by the winning tile off a DISCARD is not 暗刻.
                const byDiscard = !ctx.selfDraw && s[0] === ctx.winTile;
                if (!byDiscard) concealedTrip++;
            } else runs.push(s);
        });
        for (const m of ctx.melds) {
            const t = meldTriplet(m);
            if (t == null) runs.push(m.kinds.slice(0, 3));
            else {
                triplets.push([t, t, t]);
                if (m.type === 'ankan') concealedTrip++;
            }
        }
        out.push({
            triplets, runs, pair: d.pair, concealedTriplets: concealedTrip,
            kans: ctx.melds.filter((m) => m.type === 'kan' || m.type === 'ankan'),
            concealed: concealedHand,
        });
    }
    return out;
}

/** Every kind present in the finished hand (for suit / honor tests). */
function allKinds(ctx: WinContext): Kind[] {
    const out: Kind[] = [];
    for (let k = 0; k < KINDS; k++) for (let i = 0; i < ctx.concealed[k]; i++) out.push(k);
    for (const m of ctx.melds) out.push(...m.kinds);
    return out;
}

// ── pattern table ────────────────────────────────────────────────────────────

interface Pattern {
    name: string;
    points: number;
    /** How many times it scores (箭刻 can be ×2). Default 1. */
    test: (s: Shape, ctx: WinContext, ks: Kind[]) => number | boolean;
    /** Patterns implied by this one, dropped when this scores (国标不重复计算). */
    excludes?: string[];
    /** Only meaningful for a standard 4-sets-and-a-pair shape. */
    standardOnly?: boolean;
}

const suitsUsed = (ks: Kind[]) => new Set(ks.filter((k) => !isHonor(k)).map(suitOf));
const hasHonor = (ks: Kind[]) => ks.some(isHonor);

export const PATTERNS: Pattern[] = [
    // ── 88 ──
    {
        name: '大四喜', points: 88, standardOnly: true,
        excludes: ['小四喜', '圈风刻', '门风刻', '碰碰和', '幺九刻', '三风刻'],
        test: (s) => s.triplets.filter((t) => isWind(t[0])).length === 4,
    },
    {
        name: '大三元', points: 88, standardOnly: true,
        excludes: ['小三元', '双箭刻', '箭刻'],
        test: (s) => s.triplets.filter((t) => isDragon(t[0])).length === 3,
    },
    // ── 64 ──
    {
        name: '小四喜', points: 64, standardOnly: true,
        excludes: ['圈风刻', '门风刻', '三风刻'],
        test: (s) => s.triplets.filter((t) => isWind(t[0])).length === 3 && isWind(s.pair),
    },
    {
        name: '小三元', points: 64, standardOnly: true,
        excludes: ['双箭刻', '箭刻'],
        test: (s) => s.triplets.filter((t) => isDragon(t[0])).length === 2 && isDragon(s.pair),
    },
    {
        name: '字一色', points: 64,
        excludes: ['混一色', '碰碰和', '全带幺', '幺九刻', '缺一门'],
        test: (_s, _c, ks) => ks.every(isHonor),
    },
    {
        name: '四暗刻', points: 64, standardOnly: true,
        excludes: ['碰碰和', '三暗刻', '双暗刻', '门前清', '不求人'],
        test: (s) => s.concealedTriplets === 4 && s.triplets.length === 4,
    },
    {
        name: '清幺九', points: 64, standardOnly: true,
        excludes: ['碰碰和', '全带幺', '幺九刻', '无字', '双同刻'],
        test: (s, _c, ks) => s.triplets.length === 4 && ks.every((k) => !isHonor(k) && (k % 9 === 0 || k % 9 === 8)),
    },
    // ── 24 ──
    {
        name: '清一色', points: 24,
        excludes: ['无字', '缺一门'],
        test: (_s, _c, ks) => !hasHonor(ks) && suitsUsed(ks).size === 1,
    },
    // ── 6 ──
    {
        name: '碰碰和', points: 6, standardOnly: true,
        test: (s) => s.triplets.length === 4,
    },
    {
        name: '混一色', points: 6,
        excludes: ['缺一门'],
        test: (_s, _c, ks) => hasHonor(ks) && suitsUsed(ks).size === 1,
    },
    {
        name: '全带幺', points: 4, standardOnly: true,
        excludes: ['幺九刻'],
        test: (s) => [...s.triplets, ...s.runs].every((set) => set.some(isTerminalOrHonor))
            && isTerminalOrHonor(s.pair),
    },
    {
        name: '双箭刻', points: 6, standardOnly: true,
        excludes: ['箭刻'],
        test: (s) => s.triplets.filter((t) => isDragon(t[0])).length === 2,
    },
    {
        name: '三风刻', points: 12, standardOnly: true,
        excludes: ['圈风刻', '门风刻'],
        test: (s) => s.triplets.filter((t) => isWind(t[0])).length === 3,
    },
    // ── 4 ──
    {
        name: '不求人', points: 4,
        excludes: ['门前清', '自摸'],
        test: (s, ctx) => s.concealed && ctx.selfDraw,
    },
    {
        name: '双明杠', points: 4,
        test: (s) => s.kans.filter((m) => m.type === 'kan').length === 2,
        excludes: ['明杠'],
    },
    {
        name: '三暗刻', points: 16, standardOnly: true,
        excludes: ['双暗刻'],
        test: (s) => s.concealedTriplets === 3,
    },
    // ── 2 ──
    { name: '七对', points: 24, excludes: ['门前清', '单钓将'], test: (_s, ctx) => isSevenPairs(ctx.concealed) },
    {
        name: '箭刻', points: 2, standardOnly: true,
        test: (s) => s.triplets.filter((t) => isDragon(t[0])).length,
    },
    {
        name: '圈风刻', points: 2, standardOnly: true,
        test: (s, ctx) => s.triplets.some((t) => t[0] === ctx.roundWind),
    },
    {
        name: '门风刻', points: 2, standardOnly: true,
        test: (s, ctx) => s.triplets.some((t) => t[0] === ctx.seatWind),
    },
    {
        name: '断幺', points: 2,
        excludes: ['无字'],
        test: (_s, _c, ks) => ks.every((k) => !isTerminalOrHonor(k)),
    },
    {
        name: '平和', points: 2, standardOnly: true,
        test: (s) => s.runs.length === 4 && !isHonor(s.pair),
    },
    {
        name: '门前清', points: 2,
        test: (s, ctx) => s.concealed && !ctx.selfDraw,
    },
    {
        name: '双暗刻', points: 2, standardOnly: true,
        test: (s) => s.concealedTriplets === 2,
    },
    { name: '暗杠', points: 2, test: (s) => s.kans.filter((m) => m.type === 'ankan').length },
    // ── 1 ──
    { name: '幺九刻', points: 1, standardOnly: true, test: (s) => s.triplets.filter((t) => isTerminalOrHonor(t[0])).length },
    { name: '明杠', points: 1, test: (s) => s.kans.filter((m) => m.type === 'kan').length },
    { name: '缺一门', points: 1, test: (_s, _c, ks) => suitsUsed(ks).size === 2 },
    { name: '无字', points: 1, test: (_s, _c, ks) => !hasHonor(ks) },
    { name: '自摸', points: 1, test: (_s, ctx) => ctx.selfDraw },
    { name: '单钓将', points: 1, standardOnly: true, test: (s, ctx) => s.pair === ctx.winTile && ctx.concealed[ctx.winTile] === 2 },
    // ── situational ──
    { name: '杠上开花', points: 8, test: (_s, ctx) => !!ctx.afterKan },
    { name: '海底捞月', points: 8, test: (_s, ctx) => !!ctx.lastTile },
    { name: '十三幺', points: 88, excludes: ['门前清', '不求人', '单钓将', '全带幺', '幺九刻'], test: (_s, ctx) => isThirteenOrphans(ctx.concealed) },
];

/** Score one reading of the hand. */
function scoreShape(s: Shape, ctx: WinContext, ks: Kind[], standard: boolean): FanEntry[] {
    const hits: FanEntry[] = [];
    const excluded = new Set<string>();
    for (const p of PATTERNS) {
        if (p.standardOnly && !standard) continue;
        const r = p.test(s, ctx, ks);
        const count = typeof r === 'number' ? r : (r ? 1 : 0);
        if (count <= 0) continue;
        hits.push({ name: p.name, points: p.points * count, ...(count > 1 ? { count } : {}) });
        for (const e of p.excludes ?? []) excluded.add(e);
    }
    return hits.filter((h) => !excluded.has(h.name));
}

/**
 * Score a winning hand. When several decompositions read differently (a hand
 * can be both 平和 and 碰碰和-adjacent), the highest-scoring reading wins —
 * standard practice, and it means a player is never punished for how the
 * software happened to parse their tiles.
 */
export function scoreHand(ctx: WinContext): ScoreResult {
    const ks = allKinds(ctx);
    const standardShapes = shapesOf(ctx);

    let best: FanEntry[] = [];
    let bestTotal = -1;
    const consider = (fan: FanEntry[]) => {
        const total = fan.reduce((a, f) => a + f.points, 0);
        if (total > bestTotal) { bestTotal = total; best = fan; }
    };
    for (const s of standardShapes) consider(scoreShape(s, ctx, ks, true));

    // Seven pairs / thirteen orphans have no set decomposition — score them on a
    // stub shape so the non-standard patterns (七对, 断幺, 清一色 …) still apply.
    if (standardShapes.length === 0 || isSevenPairs(ctx.concealed) || isThirteenOrphans(ctx.concealed)) {
        const stub: Shape = {
            triplets: [], runs: [], pair: ctx.winTile, concealedTriplets: 0,
            kans: [], concealed: ctx.melds.every((m) => m.type === 'ankan'),
        };
        consider(scoreShape(stub, ctx, ks, false));
    }

    // A legal win always scores at least the 鸡和 minimum so payouts never vanish.
    if (bestTotal <= 0) { best = [{ name: '鸡和', points: 1 }]; bestTotal = 1; }

    const base = BASE_POINTS + bestTotal;
    const gain = ctx.selfDraw ? base * 3 : base + BASE_POINTS * 2;
    return { fan: best.sort((a, b) => b.points - a.points), total: bestTotal, base, gain };
}

/**
 * Turn a score into per-seat point deltas (index = seat). `from` is the
 * discarder's seat for a 点炮 win, or −1 for 自摸.
 */
export function settle(score: ScoreResult, winner: number, from: number, seats = 4): number[] {
    const delta = new Array(seats).fill(0);
    for (let s = 0; s < seats; s++) {
        if (s === winner) continue;
        const pay = from < 0 ? score.base : (s === from ? score.base : BASE_POINTS);
        delta[s] = -pay;
        delta[winner] += pay;
    }
    return delta;
}
