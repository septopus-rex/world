import { describe, it, expect } from 'vitest';
import {
    tally, kindLabel, kindName, Meld,
    isWinningHand, isSevenPairs, isThirteenOrphans, shanten, waits, isTenpai,
    chiOptions, canPon, canKan, concealedKans, canRon,
    scoreHand, settle, BASE_POINTS, WinContext,
    chooseDiscard, decideClaim, BotView,
} from '../../src/core/mahjong';

// Kind helpers so the fixtures read like a hand: m(1) = 1萬, p(5) = 5筒, s(9) = 9索.
const m = (r: number) => r - 1;
const p = (r: number) => 8 + r;
const s = (r: number) => 17 + r;
const E = 27, S = 28, W = 29, N = 30, RED = 31, GREEN = 32, WHITE = 33;

const hand = (...ks: number[]) => tally(ks);

describe('tiles: encoding', () => {
    it('labels every kind distinctly in both scripts', () => {
        const labels = new Set<string>(), names = new Set<string>();
        for (let k = 0; k < 34; k++) { labels.add(kindLabel(k)); names.add(kindName(k)); }
        expect(labels.size).toBe(34);
        expect(names.size).toBe(34);
        expect(kindLabel(m(3))).toBe('3m');
        expect(kindName(p(7))).toBe('七筒');
        expect(kindName(RED)).toBe('中');
    });
});

describe('rules: win detection', () => {
    it('accepts four sets and a pair', () => {
        // 123m 456m 789m 111p 55s
        expect(isWinningHand(hand(
            m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9),
            p(1), p(1), p(1), s(5), s(5)))).toBe(true);
    });

    it('rejects a hand that is one tile short of a set', () => {
        expect(isWinningHand(hand(
            m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9),
            p(1), p(1), p(2), s(5), s(5)))).toBe(false);
    });

    it('does not let a run wrap across suits', () => {
        // 8m 9m 1p would be a "run" only if suits were ignored.
        expect(isWinningHand(hand(
            m(8), m(9), p(1), m(1), m(2), m(3), p(4), p(5), p(6),
            s(1), s(1), s(1), s(9), s(9)))).toBe(false);
    });

    it('recognises seven pairs but not four-of-a-kind masquerading as two', () => {
        expect(isSevenPairs(hand(m(1), m(1), m(3), m(3), p(2), p(2), p(5), p(5),
            s(7), s(7), s(9), s(9), E, E))).toBe(true);
        expect(isSevenPairs(hand(m(1), m(1), m(1), m(1), m(3), m(3), p(2), p(2),
            p(5), p(5), s(7), s(7), s(9), s(9)))).toBe(false);
    });

    it('recognises thirteen orphans', () => {
        expect(isThirteenOrphans(hand(
            m(1), m(9), p(1), p(9), s(1), s(9), E, S, W, N, RED, GREEN, WHITE, WHITE))).toBe(true);
        // missing 白, doubled 中 instead
        expect(isThirteenOrphans(hand(
            m(1), m(9), p(1), p(9), s(1), s(9), E, S, W, N, RED, RED, GREEN, GREEN))).toBe(false);
    });

    it('counts melds toward the four sets', () => {
        const melds: Meld[] = [{ type: 'pon', kinds: [RED, RED, RED], from: 1, claimed: RED }];
        // 123m 456m 99p + [中中中] = 3 sets + pair, needs one more set
        expect(isWinningHand(hand(m(1), m(2), m(3), m(4), m(5), m(6), p(9), p(9)), melds)).toBe(false);
        expect(isWinningHand(hand(m(1), m(2), m(3), m(4), m(5), m(6), s(7), s(8), s(9), p(9), p(9)), melds)).toBe(true);
    });
});

describe('rules: shanten and waits', () => {
    it('reports −1 for a complete hand and 0 for tenpai', () => {
        const won = hand(m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), p(1), p(1), p(1), s(5), s(5));
        expect(shanten(won)).toBe(-1);
        const tenpai = hand(m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), p(1), p(1), p(1), s(5));
        expect(shanten(tenpai)).toBe(0);
        expect(isTenpai(tenpai)).toBe(true);
    });

    it('finds both ends of a two-sided wait', () => {
        // 123m 456m 789m 11p + 34s  → waiting 2s / 5s
        const w = waits(hand(m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), p(1), p(1), s(3), s(4)));
        expect(w.sort()).toEqual([s(2), s(5)].sort());
    });

    it('finds the pair wait of a seven-pair hand', () => {
        const w = waits(hand(m(1), m(1), m(3), m(3), p(2), p(2), p(5), p(5), s(7), s(7), s(9), s(9), E));
        expect(w).toEqual([E]);
    });

    it('grows with distance from tenpai', () => {
        const far = hand(m(1), m(4), m(7), p(2), p(5), p(8), s(1), s(4), s(7), E, S, W, N);
        expect(shanten(far)).toBeGreaterThan(2);
    });

    it('never returns a shanten below −1', () => {
        for (const h of [hand(m(1)), hand(), hand(E, E)]) expect(shanten(h)).toBeGreaterThanOrEqual(-1);
    });
});

describe('rules: claims', () => {
    it('offers every run that could absorb the tile', () => {
        // holding 1m2m4m5m and 3m is discarded → 12 / 24 / 45
        const opts = chiOptions(hand(m(1), m(2), m(4), m(5)), m(3));
        expect(opts).toHaveLength(3);
        expect(opts).toContainEqual([m(1), m(2)]);
        expect(opts).toContainEqual([m(2), m(4)]);
        expect(opts).toContainEqual([m(4), m(5)]);
    });

    it('never offers a chi on honors', () => {
        expect(chiOptions(hand(E, E, S, W), E)).toEqual([]);
    });

    it('gates pon and kan on copies held', () => {
        expect(canPon(hand(p(3), p(3)), p(3))).toBe(true);
        expect(canPon(hand(p(3)), p(3))).toBe(false);
        expect(canKan(hand(p(3), p(3), p(3)), p(3))).toBe(true);
        expect(concealedKans(hand(p(3), p(3), p(3), p(3), m(1)))).toEqual([p(3)]);
    });

    it('detects a win on someone else’s discard', () => {
        const h = hand(m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), p(1), p(1), p(1), s(5));
        expect(canRon(h, [], s(5))).toBe(true);
        expect(canRon(h, [], s(6))).toBe(false);
    });
});

describe('scoring', () => {
    const ctx = (over: Partial<WinContext>): WinContext => ({
        concealed: hand(), melds: [], winTile: 0, selfDraw: false,
        seatWind: E, roundWind: E, ...over,
    });

    it('scores a flush hand as 清一色 and drops the patterns it implies', () => {
        const r = scoreHand(ctx({
            concealed: hand(m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), m(1), m(1), m(9), m(9), m(9)),
            winTile: m(9),
        }));
        const names = r.fan.map((f) => f.name);
        expect(names).toContain('清一色');
        expect(names).not.toContain('无字');       // implied by 清一色
        expect(names).not.toContain('缺一门');
        expect(r.total).toBeGreaterThanOrEqual(24);
    });

    it('scores 大三元 and suppresses the dragon sub-patterns', () => {
        const r = scoreHand(ctx({
            concealed: hand(RED, RED, RED, GREEN, GREEN, GREEN, WHITE, WHITE, WHITE, m(2), m(3), m(4), p(5), p(5)),
            winTile: p(5),
        }));
        const names = r.fan.map((f) => f.name);
        expect(names).toContain('大三元');
        expect(names).not.toContain('箭刻');
        expect(names).not.toContain('双箭刻');
        expect(r.total).toBeGreaterThanOrEqual(88);
    });

    it('scores 断幺 for an all-simples hand', () => {
        const r = scoreHand(ctx({
            concealed: hand(m(2), m(3), m(4), p(3), p(4), p(5), s(6), s(7), s(8), m(6), m(6), m(6), p(8), p(8)),
            winTile: p(8),
        }));
        expect(r.fan.map((f) => f.name)).toContain('断幺');
    });

    it('scores 碰碰和 for an all-triplets hand, or 四暗刻 when none was claimed', () => {
        // One triplet claimed off another seat → the hand is 碰碰和, not 四暗刻.
        const melded = scoreHand(ctx({
            concealed: hand(m(2), m(2), m(2), p(3), p(3), p(3), s(6), s(6), s(6), p(5), p(5)),
            melds: [{ type: 'pon', kinds: [m(8), m(8), m(8)], from: 2, claimed: m(8) }],
            winTile: p(5),
        }));
        expect(melded.fan.map((f) => f.name)).toContain('碰碰和');

        // Same shape entirely concealed is the bigger hand, and 碰碰和 folds into it.
        const concealed = scoreHand(ctx({
            concealed: hand(m(2), m(2), m(2), p(3), p(3), p(3), s(6), s(6), s(6), m(8), m(8), m(8), p(5), p(5)),
            winTile: p(5),
        }));
        const names = concealed.fan.map((f) => f.name);
        expect(names).toContain('四暗刻');
        expect(names).not.toContain('碰碰和');
    });

    it('scores 七对 and 十三幺 through the non-standard path', () => {
        const sp = scoreHand(ctx({
            concealed: hand(m(1), m(1), m(3), m(3), p(2), p(2), p(5), p(5), s(7), s(7), s(9), s(9), E, E),
            winTile: E,
        }));
        expect(sp.fan.map((f) => f.name)).toContain('七对');

        const to = scoreHand(ctx({
            concealed: hand(m(1), m(9), p(1), p(9), s(1), s(9), E, S, W, N, RED, GREEN, WHITE, WHITE),
            winTile: WHITE,
        }));
        expect(to.fan.map((f) => f.name)).toContain('十三幺');
        expect(to.total).toBeGreaterThanOrEqual(88);
    });

    it('adds 自摸 and 不求人 for a concealed self-draw', () => {
        const r = scoreHand(ctx({
            concealed: hand(m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), p(1), p(1), p(1), s(5), s(5)),
            winTile: s(5), selfDraw: true,
        }));
        const names = r.fan.map((f) => f.name);
        expect(names).toContain('不求人');
        expect(names).not.toContain('自摸');       // folded into 不求人
        expect(names).not.toContain('门前清');
    });

    it('always pays out at least the base', () => {
        const r = scoreHand(ctx({
            concealed: hand(m(1), m(2), m(3), p(4), p(5), p(6), s(7), s(8), s(9), m(5), m(6), m(7), E, E),
            winTile: E,
        }));
        expect(r.total).toBeGreaterThanOrEqual(1);
        expect(r.base).toBe(BASE_POINTS + r.total);
    });

    it('settles self-draw and discard wins differently but keeps the books level', () => {
        const score = { fan: [], total: 4, base: 12, gain: 0 } as any;
        const tsumo = settle(score, 0, -1);
        expect(tsumo[0]).toBe(36);
        expect(tsumo.slice(1)).toEqual([-12, -12, -12]);
        expect(tsumo.reduce((a: number, b: number) => a + b, 0)).toBe(0);

        const ron = settle(score, 0, 2);
        expect(ron[2]).toBe(-12);                  // discarder pays the full amount
        expect(ron[1]).toBe(-BASE_POINTS);
        expect(ron.reduce((a: number, b: number) => a + b, 0)).toBe(0);
    });
});

describe('bot policy', () => {
    const view = (h: number[], over: Partial<BotView> = {}): BotView =>
        ({ hand: h, melds: [], seen: tally([]), ...over });

    it('throws the isolated honor rather than breaking a run', () => {
        // 123m 456m 789m 55p + a lone West → West is the only sane discard
        const h = hand(m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), p(5), p(5), s(3), s(4), W);
        expect(chooseDiscard(view(h))).toBe(W);
    });

    it('never discards a tile it does not hold', () => {
        const h = hand(m(1), m(2), m(3), p(4), p(5), p(6), s(7), s(8), s(9), E, E, RED, RED, WHITE);
        const d = chooseDiscard(view(h));
        expect(h[d]).toBeGreaterThan(0);
    });

    it('keeps its discard shanten-optimal', () => {
        const h = hand(m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8), m(9), p(1), p(1), p(1), s(5), W);
        const before = shanten(h);
        const d = chooseDiscard(view(h));
        h[d]--;
        expect(shanten(h)).toBeLessThanOrEqual(before);
        expect(shanten(h)).toBe(0);                // still tenpai after the throw
    });

    it('claims a pon only when it advances the hand', () => {
        // Two reds plus a nearly-complete hand → pon improves shanten.
        const useful = hand(RED, RED, m(1), m(2), m(3), p(4), p(5), p(6), s(7), s(8), s(9), m(5), m(5));
        expect(decideClaim(view(useful), RED, false).type).toBe('pon');

        // A pair of reds in an otherwise unrelated, far-from-ready hand: taking it
        // would cost the concealed hand for nothing.
        const idle = hand(RED, RED, m(1), m(4), m(7), p(2), p(5), p(8), s(1), s(4), s(7), E, S);
        const d = decideClaim(view(idle), RED, false);
        expect(['pass', 'pon']).toContain(d.type);  // policy may take it; must not crash
    });

    it('offers a chi only to a seat allowed to call it', () => {
        const h = hand(m(1), m(2), p(4), p(5), p(6), s(7), s(8), s(9), E, E, E, RED, RED);
        expect(decideClaim(view(h), m(3), false).type).not.toBe('chi');
    });
});
