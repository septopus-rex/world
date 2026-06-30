import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { SystemMode } from '../../src/core/types/SystemMode';

// L3 — the in-world 3D mahjong table (MahjongSystem): the DISCRETE, turn-based
// native case. configure deals a seeded shuffle + spawns tiles as adjunct
// entities, a discard advances the turn, bots auto-play 摸打, hidden hands stay
// hidden, and the wall eventually exhausts. Mirrors pool.test.ts in shape.

const CFG = {
    block: [2048, 2048] as [number, number],
    origin: [8, 8] as [number, number],
    surfaceZ: 0.95,
    seed: 1337,
};

async function bootMahjong(extra: Partial<typeof CFG> & { botDelay?: number; faceCids?: string[] } = {}) {
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

describe('3D mahjong (MahjongSystem)', () => {
    it('deals a seeded 136-tile shuffle: human draws to 14, opponents hold 13', async () => {
        const engine = await bootMahjong();
        const table = engine.mahjongState();
        // full deck identity: 34 kinds × 4 copies
        expect(table.kinds.length).toBe(136);
        const counts = new Map<number, number>();
        for (const k of table.kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
        expect(counts.size).toBe(34);
        expect([...counts.values()].every((c) => c === 4)).toBe(true);

        // human (seat 0) drew the 14th; others hold 13; wall = 136 - 53
        expect(table.hands[0].length).toBe(14);
        expect(table.hands[1].length).toBe(13);
        expect(table.wall.length).toBe(136 - 53);
        expect(table.turn).toBe(0);
        expect(table.phase).toBe('playing');

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

    it('a human discard removes the tile, reveals it face-up, and passes the turn', async () => {
        const engine = await bootMahjong({ botDelay: 5 }); // freeze bots so we observe the pass
        const table = engine.mahjongState();
        const tid = table.hands[0][0];
        expect(engine.mahjongDiscard(tid)).toBe(true);
        stepN(engine, 1);

        expect(table.hands[0].length).toBe(13);          // back to 13
        expect(table.discards[0]).toEqual([tid]);
        expect(table.turn).toBe(1);                       // passed to the next seat
        const disc = tiles(engine).find((x) => x.zone === 'discard' && x.tileId === tid);
        expect(disc).toBeTruthy();
        expect(disc.faceUp).toBe(true);                   // discards are always open
        // a discard out of turn is refused
        expect(engine.mahjongDiscard(table.hands[0][0])).toBe(false);
    });

    it('bots auto-play 摸打 after their think delay', async () => {
        const engine = await bootMahjong({ botDelay: 0.3 });
        const table = engine.mahjongState();
        expect(engine.mahjongDiscard(table.hands[0][0])).toBe(true); // hand to seat 1 (bot)
        expect(table.turn).toBe(1);
        stepN(engine, 30); // 0.5s > botDelay → seat 1 discards and passes on
        expect(table.discards[1].length).toBe(1);
        expect(table.turn).toBe(2);
    });

    it('is fully deterministic for a fixed seed + script', async () => {
        const play = async () => {
            const engine = await bootMahjong({ botDelay: 0 });
            const table = engine.mahjongState();
            // drive a fixed script: on every human turn discard the first tile,
            // let bots play instantly, for a bounded number of frames.
            for (let f = 0; f < 600 && table.phase === 'playing'; f++) {
                if (table.turn === 0) engine.mahjongDiscard(table.hands[0][0]);
                stepN(engine, 1);
                if (table.discards.reduce((s: number, d: number[]) => s + d.length, 0) >= 20) break;
            }
            return JSON.stringify({ kinds: table.kinds, discards: table.discards, hands: table.hands });
        };
        expect(await play()).toEqual(await play());
    });

    it('exhausts the wall → 流局 (phase over)', async () => {
        const engine = await bootMahjong({ botDelay: 0 });
        const table = engine.mahjongState();
        for (let i = 0; i < 4000 && table.phase === 'playing'; i++) {
            if (table.turn === 0) engine.mahjongDiscard(table.hands[0][0]);
            stepN(engine, 1);
        }
        expect(table.phase).toBe('over');
        expect(table.wall.length).toBe(0);
    });

    it('readable faces: face-up tiles carry their kind image in box slot 7, concealed tiles do not', async () => {
        // kind(0..33) → a content-addressed locator. A face-up tile must reference
        // its kind's image (so it is readable); a concealed tile must reference none.
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
                // the face is a fitted label (full image on the face), not size-tiled
                expect(adj.stdData?.material?.fit, `face tile ${tc.tileId} fits the image`).toBe(true);
                checkedFaceUp++;
            } else {
                expect(tex, `concealed tile ${tc.tileId} is blank`).toBeUndefined();
                checkedDown++;
            }
        }
        expect(checkedFaceUp).toBe(14);                 // the human's open hand
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
        // a 14-tile fan spreads along the row: the ends differ noticeably in X.
        const dx = Math.abs(human[human.length - 1].pos[0] - human[0].pos[0]);
        expect(dx).toBeGreaterThan(2.0);
    });
});
