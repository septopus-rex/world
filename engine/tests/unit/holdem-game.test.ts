import { describe, it, expect } from 'vitest';
import { HoldemGame, score5, score7, compareScore, rankOf } from '../../../client/core/src/games/holdem/HoldemGame';
import { HoldemGameApi } from '../../../client/core/src/games/holdem/HoldemGameApi';

// The third Pattern-A game engine — pure logic tests (evaluator correctness is
// the meat of hold'em; the session flow mirrors the mahjong precedent).

/** Build a card id from rank (2..14) + suit (0..3). */
const C = (rank: number, suit: number): number => (rank - 2) * 4 + suit;

describe('hold\'em hand evaluator', () => {
    it('ranks every category correctly (5-card)', () => {
        const cases: Array<[number[], number, string]> = [
            [[C(14, 0), C(13, 0), C(12, 0), C(11, 0), C(10, 0)], 8, 'royal/straight flush'],
            [[C(9, 1), C(9, 2), C(9, 3), C(9, 0), C(4, 1)], 7, 'quads'],
            [[C(8, 1), C(8, 2), C(8, 3), C(5, 0), C(5, 1)], 6, 'full house'],
            [[C(14, 2), C(10, 2), C(8, 2), C(6, 2), C(3, 2)], 5, 'flush'],
            [[C(9, 0), C(8, 1), C(7, 2), C(6, 3), C(5, 0)], 4, 'straight'],
            [[C(7, 0), C(7, 1), C(7, 2), C(13, 3), C(2, 0)], 3, 'trips'],
            [[C(12, 0), C(12, 1), C(4, 2), C(4, 3), C(9, 0)], 2, 'two pair'],
            [[C(11, 0), C(11, 1), C(9, 2), C(6, 3), C(2, 0)], 1, 'pair'],
            [[C(14, 0), C(11, 1), C(9, 2), C(6, 3), C(2, 0)], 0, 'high card'],
        ];
        for (const [cards, cat, name] of cases) {
            expect(score5(cards)[0], name).toBe(cat);
        }
    });

    it('the wheel (A-2-3-4-5) is a straight with high 5 — beaten by 6-high', () => {
        const wheel = score5([C(14, 0), C(2, 1), C(3, 2), C(4, 3), C(5, 0)]);
        expect(wheel[0]).toBe(4);
        expect(wheel[1]).toBe(5);
        const sixHigh = score5([C(2, 1), C(3, 2), C(4, 3), C(5, 0), C(6, 1)]);
        expect(compareScore(sixHigh, wheel)).toBeGreaterThan(0);
    });

    it('tiebreaks: kickers decide equal pairs; score7 picks the best 5 of 7', () => {
        const pairAceK = score5([C(10, 0), C(10, 1), C(14, 2), C(13, 3), C(2, 0)]);
        const pairAceQ = score5([C(10, 2), C(10, 3), C(14, 1), C(12, 0), C(2, 1)]);
        expect(compareScore(pairAceK, pairAceQ)).toBeGreaterThan(0);

        // 7 cards holding a hidden flush — score7 must find it over the pair.
        const seven = [C(2, 2), C(5, 2), C(9, 2), C(11, 2), C(13, 2), C(13, 0), C(4, 1)];
        expect(score7(seven)[0]).toBe(5);
    });
});

describe('hold\'em session flow (deterministic seed)', () => {
    it('full hand: ante → four streets → showdown resolves winners and pot math', () => {
        const g = new HoldemGame(12345);
        const s0 = g.start();
        expect(s0.phase).toBe('preflop');
        expect(s0.hole).toHaveLength(2);
        expect(s0.community).toHaveLength(0);
        expect(s0.pot).toBe(20);            // 4 × ante 5
        expect(s0.chips).toBe(95);

        const s1 = g.act('bet');            // +10 each seat
        expect(s1.phase).toBe('flop');
        expect(s1.community).toHaveLength(3);
        expect(s1.pot).toBe(60);
        expect(s1.chips).toBe(85);

        const s2 = g.act('check');
        expect(s2.phase).toBe('turn');
        expect(s2.community).toHaveLength(4);
        const s3 = g.act('check');
        expect(s3.phase).toBe('river');
        expect(s3.community).toHaveLength(5);

        const s4 = g.act('check');
        expect(s4.phase).toBe('showdown');
        expect(s4.finished).toBe(true);
        expect(s4.result.reason).toBe('showdown');
        expect(s4.result.hands).toHaveLength(4);
        expect(s4.result.winners.length).toBeGreaterThanOrEqual(1);
        // pot conservation: winner(s) split exactly the pot
        if (s4.won) expect(s4.chips).toBe(85 + Math.floor(60 / s4.result.winners.length));
        else expect(s4.chips).toBe(85);
        // determinism: same seed → same deal → same outcome
        const g2 = new HoldemGame(12345);
        g2.start(); g2.act('bet'); g2.act('check'); g2.act('check');
        const r2 = g2.act('check');
        expect(r2.result.winners).toEqual(s4.result.winners);
        expect(r2.hole).toEqual(s4.hole);
    });

    it('fold ends the hand immediately; acting after finish is a no-op', () => {
        const g = new HoldemGame(7);
        g.start();
        const s = g.act('fold');
        expect(s.finished).toBe(true);
        expect(s.won).toBe(false);
        expect(s.result.reason).toBe('fold');
        expect(g.act('bet').phase, 'no zombie streets after folding').toBe('preflop');
    });

    it('API wrapper speaks the whitelist: start/state/act/end, rejects the unknown', async () => {
        const api = new HoldemGameApi(42);
        const s = await api.call('holdem', 'start');
        expect(rankOf(s.hole[0])).toBeGreaterThanOrEqual(2);
        await api.call('holdem', 'act', ['check']);
        const st = await api.call('holdem', 'state');
        expect(st.phase).toBe('flop');
        const end = await api.call('holdem', 'end');
        expect(end.gameId).toMatch(/^hd-/);
        await expect(api.call('holdem', 'cheat', [])).rejects.toThrow(/unsupported/);
        await expect(api.call('mahjong', 'start')).rejects.toThrow(/unknown game/);
    });
});
