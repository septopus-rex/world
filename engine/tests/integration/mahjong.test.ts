import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { SystemMode } from '../../src/core/types/SystemMode';
import { tally, shanten, isWinningHand, chooseDiscard } from '../../src/core/mahjong';

// L3 — the in-world 3D mahjong table (MahjongSystem): the DISCRETE, turn-based
// native case. configure deals a seeded shuffle + spawns tiles as adjunct
// entities; seats draw, discard, call 碰/杠/吃 and win by 自摸/点炮, with the rule
// core (core/mahjong) answering every legality and scoring question.

const CFG = {
    block: [2048, 2048] as [number, number],
    origin: [8, 8] as [number, number],
    surfaceZ: 0.95,
    seed: 1337,
};

async function bootMahjong(extra: Partial<typeof CFG> & { botDelay?: number; faceCids?: string[]; claimWindow?: number } = {}) {
    const engine = await makeHeadlessEngine(); // player defaults into block [2048,2048]
    engine.injectBlock({ x: 2048, y: 2048, world: 'main', adjuncts: [], elevation: 0 } as any);
    stepN(engine, 3);
    engine.setupMahjong({ ...CFG, ...extra });          // arm the table
    engine.setMode(SystemMode.Game, { force: true });   // enter Game in this block → deal
    stepN(engine, 2);                                   // session starts (1) + meshes build (2)
    return engine;
}

function tiles(engine: any) {
    const w = engine.getWorld();
    const out: any[] = [];
    for (const eid of w.getEntitiesWith(['MahjongTileComponent', 'TransformComponent'])) {
        const tc = w.getComponent(eid, 'MahjongTileComponent');
        const t = w.getComponent(eid, 'TransformComponent');
        out.push({ eid, ...tc, pos: [...t.position] });
    }
    return out;
}

/**
 * Drive a whole hand to its ending with the human seat played by the same policy
 * as the bots: take a win when offered, otherwise pass on calls and discard the
 * rule core's choice. Returns the finished table.
 */
function playOut(engine: any, maxFrames = 6000) {
    const table = engine.mahjongState();
    for (let f = 0; f < maxFrames && table.phase !== 'over'; f++) {
        if (table.humanOffers.length > 0) {
            const win = table.humanOffers.find((o: any) => o.action === 'tsumo' || o.action === 'ron');
            if (win) engine.mahjongClaim(win.action);
            else engine.mahjongPass();
        } else if (table.phase === 'turn' && table.turn === table.humanSeat) {
            const hand = table.hands[table.humanSeat];
            const counts = tally(hand.map((t: number) => table.kinds[t]));
            const melds = table.melds[table.humanSeat].map((m: any) => ({
                type: m.type, kinds: m.tileIds.map((t: number) => table.kinds[t]),
                from: m.from, claimed: table.kinds[m.claimed],
            }));
            const kind = chooseDiscard({ hand: counts, melds, seen: tally([]) });
            const tid = hand.find((t: number) => table.kinds[t] === kind) ?? hand[0];
            engine.mahjongDiscard(tid);
        }
        stepN(engine, 1);
    }
    return table;
}

describe('3D mahjong (MahjongSystem)', () => {
    it('deals a seeded 136-tile shuffle: dealer draws to 14, opponents hold 13', async () => {
        const engine = await bootMahjong();
        const table = engine.mahjongState();
        expect(table.kinds.length).toBe(136);
        const counts = new Map<number, number>();
        for (const k of table.kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
        expect(counts.size).toBe(34);
        expect([...counts.values()].every((c) => c === 4)).toBe(true);

        expect(table.hands[0].length).toBe(14);
        expect(table.hands[1].length).toBe(13);
        expect(table.wall.length).toBe(136 - 53);
        expect(table.turn).toBe(0);
        expect(table.phase).toBe('turn');

        const t = tiles(engine);
        expect(t.length).toBe(53); // only on-table tiles are spawned (wall isn't)
    });

    it('keeps opponents concealed (hidden information)', async () => {
        const engine = await bootMahjong();
        const t = tiles(engine);
        const human = t.filter((x) => x.zone === 'hand' && x.seat === 0);
        const opp = t.filter((x) => x.zone === 'hand' && x.seat === 1);
        expect(human.length).toBe(14);
        expect(human.every((x) => x.faceUp)).toBe(true);   // your hand is open
        expect(opp.every((x) => !x.faceUp)).toBe(true);    // theirs is face down
    });

    it('stands hands upright and lays discards flat', async () => {
        const engine = await bootMahjong();
        const t = tiles(engine);
        expect(t.filter((x) => x.zone === 'hand').every((x) => x.upright)).toBe(true);
        const engine2 = await bootMahjong({ botDelay: 5, claimWindow: 0 });
        const table = engine2.mahjongState();
        engine2.mahjongDiscard(table.hands[0][0]);
        stepN(engine2, 1);
        const disc = tiles(engine2).filter((x: any) => x.zone === 'discard');
        expect(disc.length).toBeGreaterThan(0);
        expect(disc.every((x: any) => !x.upright)).toBe(true);
    });

    it('a human discard removes the tile, reveals it face-up, and play moves on', async () => {
        const engine = await bootMahjong({ botDelay: 5, claimWindow: 0 });
        const table = engine.mahjongState();
        const tid = table.hands[0][0];
        expect(engine.mahjongDiscard(tid)).toBe(true);
        stepN(engine, 1);

        expect(table.hands[0].length).toBe(13);          // back to 13
        expect(table.discards[0]).toContain(tid);
        const disc = tiles(engine).find((x) => x.zone === 'discard' && x.tileId === tid);
        expect(disc).toBeTruthy();
        expect(disc.faceUp).toBe(true);                   // discards are always open
        // a discard out of turn is refused
        expect(engine.mahjongDiscard(table.hands[0][0])).toBe(false);
    });

    it('bots play a policy, not 摸打 — the discard is chosen, never just the drawn tile', async () => {
        const engine = await bootMahjong({ botDelay: 0.1, claimWindow: 0 });
        const table = engine.mahjongState();
        let choseSomethingElse = 0;
        for (let round = 0; round < 12 && table.phase !== 'over'; round++) {
            if (table.phase === 'turn' && table.turn === table.humanSeat) {
                engine.mahjongDiscard(table.hands[0][0]);
            }
            if (table.humanOffers.length) engine.mahjongPass();
            const before = table.turn;
            const drawn = table.drawnTile;
            stepN(engine, 12);                              // > botDelay
            if (before !== table.humanSeat && table.discards[before].length) {
                const last = table.discards[before][table.discards[before].length - 1];
                if (drawn != null && last !== drawn) choseSomethingElse++;
            }
        }
        // 摸打 would make this zero every single time.
        expect(choseSomethingElse).toBeGreaterThan(0);
    });

    it('a bot discard never worsens its own hand', { timeout: 30_000 }, async () => {
        const engine = await bootMahjong({ botDelay: 0, claimWindow: 0 });
        const table = engine.mahjongState();
        let compared = 0;
        for (let i = 0; i < 60 && table.phase !== 'over'; i++) {
            const seat = table.turn;
            if (seat === table.humanSeat) { engine.mahjongDiscard(table.hands[0][0]); stepN(engine, 1); continue; }
            if (table.humanOffers.length) { engine.mahjongPass(); continue; }
            if (table.phase !== 'turn') { stepN(engine, 1); continue; }
            const melds = table.melds[seat].length;
            const discards = table.discards[seat].length;
            const before = shanten(tally(table.hands[seat].map((t: number) => table.kinds[t])), melds);
            stepN(engine, 1);
            // Only compare a plain draw→discard turn. A CALL moves tiles out of the
            // hand into a meld, so `meldCount` changes and the two shanten numbers
            // are measured against different hand shapes — comparing them is
            // meaningless, not a policy failure.
            if (table.melds[seat].length !== melds) continue;
            if (table.discards[seat].length === discards) continue;
            const after = shanten(tally(table.hands[seat].map((t: number) => table.kinds[t])), melds);
            expect(after, `seat ${seat} discarded itself further from tenpai`).toBeLessThanOrEqual(before);
            compared++;
        }
        expect(compared, 'the loop actually compared some turns').toBeGreaterThan(3);
    });

    // A whole hand is ~70 draws × 4 seats of real shanten search, so these two
    // need more than the 5 s default when the suite runs alongside everything else.
    it('plays a full hand to a real ending, with a scored win or an honest draw', { timeout: 60_000 }, async () => {
        const seeds = [1337, 7, 42, 99, 2026];
        let wins = 0, draws = 0;
        for (const seed of seeds) {
            const engine = await bootMahjong({ seed, botDelay: 0, claimWindow: 0 });
            const table = playOut(engine);
            expect(table.phase, `seed ${seed} never finished`).toBe('over');
            expect(table.result).toBeTruthy();
            if (table.result.kind === 'draw') { draws++; expect(table.wall.length).toBe(0); continue; }
            wins++;
            const r = table.result;
            // The winning hand really is a winning hand, by the shared rule core.
            expect(isWinningHand(tally(r.hand), r.melds.map((m: any) => ({
                type: m.type, kinds: m.tileIds.map((t: number) => table.kinds[t]),
                from: m.from, claimed: table.kinds[m.claimed],
            })))).toBe(true);
            expect(r.total).toBeGreaterThanOrEqual(1);        // 番 was actually counted
            expect(r.fan.length).toBeGreaterThan(0);
            expect(r.delta.reduce((a: number, b: number) => a + b, 0)).toBe(0); // books balance
            expect(r.delta[r.winner]).toBeGreaterThan(0);
        }
        // The whole point of the rewrite: hands now END in wins, not only 流局.
        expect(wins, `no seed produced a win (${draws} draws)`).toBeGreaterThan(0);
    });

    it('reveals every hand once the game is over', { timeout: 30_000 }, async () => {
        const engine = await bootMahjong({ seed: 1337, botDelay: 0, claimWindow: 0 });
        playOut(engine);
        const hidden = tiles(engine).filter((x) => x.zone === 'hand' && !x.faceUp);
        expect(hidden).toHaveLength(0);
    });

    it('exposes melds on the felt when a call is made', { timeout: 60_000 }, async () => {
        // Search seeds until some seat calls — with a real bot policy this is
        // common, and the assertion is about the TABLE showing the meld.
        for (const seed of [1337, 7, 42, 99, 2026, 555, 31415, 8, 11, 23]) {
            const engine = await bootMahjong({ seed, botDelay: 0, claimWindow: 0 });
            const table = playOut(engine);
            const melded = table.melds.findIndex((m: any[]) => m.length > 0);
            if (melded < 0) continue;
            const meld = table.melds[melded][0];
            expect(['chi', 'pon', 'kan', 'ankan']).toContain(meld.type);
            expect(meld.tileIds.length).toBeGreaterThanOrEqual(3);
            // every tile of the meld is a real entity sitting in the meld zone
            const onFelt = tiles(engine).filter((x) => x.zone === 'meld' && x.seat === melded);
            expect(onFelt.length).toBeGreaterThanOrEqual(3);
            expect(onFelt.every((x) => x.faceUp)).toBe(true);
            return;
        }
        throw new Error('no seed produced a call in 10 hands');
    });

    // ── placeable: the table arms itself from ITS OWN block data ──────────────

    /** A block whose only content is a b8 game trigger declaring a mahjong table. */
    function tableBlock(seed: number) {
        return [0, 1, [[0x00b8, [[
            [5, 5, 3], [8, 8, 1.5], [0, 0, 0], 1, 0,
            [{
                type: 'in', oneTime: false,
                actions: [{
                    type: 'player', method: 'enterGame',
                    params: [{ exitPolicy: 'confirm', game: { kind: 'mahjong', origin: [8, 8], surfaceZ: 0.95, seed } }],
                }],
            }],
        ]]]], [], 1];
    }

    function movePlayerTo(engine: any, bx: number, by: number) {
        const w = engine.getWorld();
        const eid = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
        const t = w.getComponent(eid, 'TransformComponent');
        const e = w.metrics.septopusToEngine([8, 8, 2], [bx, by]);
        t.position[0] = e[0]; t.position[1] = e[1]; t.position[2] = e[2];
        t.dirty = true;
    }

    it('is placeable: two blocks of the same table data arm two independent tables, with no host call', async () => {
        const engine = await makeHeadlessEngine();
        // Two tables, different seeds, declared ONLY by their block data. Note what
        // is absent: no engine.setupMahjong(), no coordinate known to any host.
        engine.injectBlock({ x: 2048, y: 2048, world: 'main', elevation: 0, adjuncts: tableBlock(111) } as any);
        engine.injectBlock({ x: 2049, y: 2048, world: 'main', elevation: 0, adjuncts: tableBlock(222) } as any);
        stepN(engine, 4);   // block init → game.declare → both tables arm themselves

        movePlayerTo(engine, 2048, 2048);
        engine.setMode(SystemMode.Game, { force: true });
        stepN(engine, 2);
        const a = engine.mahjongState();
        expect(a, 'the west table dealt').toBeTruthy();
        expect(a.block).toEqual([2048, 2048]);
        const dealA = a.hands.map((h: number[]) => h.map((t) => a.kinds[t]).join()).join('|');

        // Walk away: the hand tears down, the ARMING survives.
        engine.setMode(SystemMode.Normal, { force: true });
        stepN(engine, 2);
        expect(engine.mahjongState(), 'leaving ends the hand').toBeNull();

        movePlayerTo(engine, 2049, 2048);
        engine.setMode(SystemMode.Game, { force: true });
        stepN(engine, 2);
        const b = engine.mahjongState();
        expect(b, 'the east table dealt too').toBeTruthy();
        expect(b.block).toEqual([2049, 2048]);
        expect(b.hands[b.humanSeat].length).toBe(14);
        const dealB = b.hands.map((h: number[]) => h.map((t) => b.kinds[t]).join()).join('|');

        // Its own seed → its own shuffle. Same System, two tables, no interference.
        expect(dealB).not.toEqual(dealA);

        // Going back deals the first table FRESH (arcade-cabinet model).
        engine.setMode(SystemMode.Normal, { force: true });
        stepN(engine, 2);
        movePlayerTo(engine, 2048, 2048);
        engine.setMode(SystemMode.Game, { force: true });
        stepN(engine, 2);
        const again = engine.mahjongState();
        expect(again.block).toEqual([2048, 2048]);
        expect(again.hands.map((h: number[]) => h.map((t: number) => again.kinds[t]).join()).join('|')).toEqual(dealA);
    });

    it('tile art is a world resource: injected late, live tiles pick it up', async () => {
        const engine = await bootMahjong();          // no faceCids
        const w = engine.getWorld();
        const texOf = () => {
            const out: any[] = [];
            for (const eid of w.getEntitiesWith(['MahjongTileComponent', 'AdjunctComponent'])) {
                out.push(w.getComponent(eid, 'AdjunctComponent').stdData?.material?.texture ?? null);
            }
            return out;
        };
        expect(texOf().every((t) => t == null), 'blank before the art arrives').toBe(true);

        const faces = Array.from({ length: 34 }, (_, k) => `face-${k}`);
        engine.setMahjongFaces(faces, 'tile-back');
        stepN(engine, 1);

        const after = texOf();
        expect(after.length).toBe(53);
        expect(after.every((t) => typeof t === 'string'), 'every live tile got art').toBe(true);
        expect(after.filter((t) => t === 'tile-back').length, 'three concealed hands').toBe(39);
    });

    it('refuses a call that was never offered', async () => {
        const engine = await bootMahjong();
        expect(engine.mahjongClaim('pon', [0])).toBe(false);
        expect(engine.mahjongPass()).toBe(false);        // nothing pending
    });

    it('is fully deterministic for a fixed seed + script', { timeout: 30_000 }, async () => {
        const play = async () => {
            const engine = await bootMahjong({ botDelay: 0, claimWindow: 0 });
            const table = playOut(engine);
            return JSON.stringify({
                discards: table.discards, hands: table.hands,
                melds: table.melds, result: table.result,
            });
        };
        expect(await play()).toEqual(await play());
    });

    it('readable faces: face-up tiles carry their kind image in box slot 7, concealed tiles do not', async () => {
        const faceCids = Array.from({ length: 34 }, (_, k) => `face-cid-${k}`);
        const engine = await bootMahjong({ faceCids } as any);
        const w = engine.getWorld();
        const table = engine.mahjongState();

        let checkedFaceUp = 0, checkedDown = 0;
        for (const eid of w.getEntitiesWith(['MahjongTileComponent', 'AdjunctComponent'])) {
            const tc = w.getComponent(eid, 'MahjongTileComponent');
            const adj = w.getComponent(eid, 'AdjunctComponent');
            const tex = adj.stdData?.material?.texture;
            if (tc.faceUp) {
                expect(tex, `face-up tile ${tc.tileId} shows its kind`).toBe(`face-cid-${table.kinds[tc.tileId]}`);
                expect(adj.stdData?.material?.fit, `face tile ${tc.tileId} fits the image`).toBe(true);
                checkedFaceUp++;
            } else {
                expect(tex, `concealed tile ${tc.tileId} is blank`).toBeUndefined();
                checkedDown++;
            }
        }
        expect(checkedFaceUp).toBe(14);                 // the dealer's open hand
        expect(checkedDown).toBe(13 * 3);               // three concealed opponents
    });

    it('without faceCids tiles stay blank (pre-readable behaviour preserved)', async () => {
        const engine = await bootMahjong();
        const w = engine.getWorld();
        for (const eid of w.getEntitiesWith(['MahjongTileComponent', 'AdjunctComponent'])) {
            expect(w.getComponent(eid, 'AdjunctComponent').stdData?.material?.texture).toBeUndefined();
        }
    });

    it('writes tile entity transforms so the meshes spread across the felt', async () => {
        const engine = await bootMahjong();
        const human = tiles(engine).filter((x) => x.zone === 'hand' && x.seat === 0).sort((a, b) => a.slot - b.slot);
        const dx = Math.abs(human[human.length - 1].pos[0] - human[0].pos[0]);
        expect(dx).toBeGreaterThan(2.0);
        // Each seat's rack sits on its own side of the table.
        const byseat = (s: number) => tiles(engine).filter((x) => x.zone === 'hand' && x.seat === s)[0].pos;
        expect(byseat(0)[2]).toBeGreaterThan(byseat(2)[2]);   // south rack is further +Z (south) than north
    });
});
