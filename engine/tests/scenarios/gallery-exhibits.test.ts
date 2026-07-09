import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { AdjunctType } from '../../src/core/types/AdjunctType';
import level from '../../../client/core/src/levels/gallery.level.json';

// The gallery's NEW tail blocks (1013–1017: b4 three-shape stops · b9 spawner ·
// c2 motif arch · c1 track · e5 board) verified headless with the SAME client JSON the
// browser loads — the e2e walks the south corridor; this covers the exhibits'
// SEMANTICS (collision shapes exist, spawner actually spawns and caps, motif
// derives its boxes, track entity builds) without a 16-block walk.

const X = 2000;

function adjunctsOf(world: any, typeId: number) {
    return world.getEntitiesWith(['AdjunctComponent'])
        .map((id: any) => world.getComponent(id, 'AdjunctComponent'))
        .filter((a: any) => a?.stdData?.typeId === typeId);
}

async function bootTail() {
    const engine = await makeHeadlessEngine();
    const world: any = engine.getWorld()!;
    for (const b of (level as any).blocks) {
        if (b.y < 1013) continue;
        engine.injectBlock({ x: b.x, y: b.y, world: 'main', elevation: b.raw[0], adjuncts: b.raw });
    }
    stepN(engine, 10);
    return { engine, world };
}

describe('画廊新展块(⑭–⑱):语义 headless 验证', () => {
    it('⑭ b4 三形状碰撞体齐备,⑰ c1 轨道建实体,⑱ e5 留言板,每块一本书', async () => {
        const { world } = await bootTail();
        const stops = adjunctsOf(world, AdjunctType.Stop);
        expect(stops.length, 'box + ball + slope').toBe(3);
        const shapes = stops.map((s: any) => s.stdData?.stopShape).sort();
        expect(new Set(shapes).size, 'three DISTINCT shapes').toBe(3);

        expect(adjunctsOf(world, AdjunctType.Track).length, 'the S-curve tube').toBe(1);
        expect(adjunctsOf(world, AdjunctType.Book).length, 'one numbered book per new block').toBe(5);
        const boards = adjunctsOf(world, AdjunctType.Board);
        expect(boards.length, '⑱ the e5 message board').toBe(1);
        expect(boards[0].stdData?.channel, 'channel declared in data').toBe('gallery');
    });

    it('⑯ c2 motif arch 确定性展开为派生盒(两柱一楣)', async () => {
        const { world } = await bootTail();
        const derivedBoxes = adjunctsOf(world, AdjunctType.Box)
            .filter((a: any) => a.stdData?.derivedFrom);
        expect(derivedBoxes.length, 'arch = 2 pillars + 1 lintel').toBeGreaterThanOrEqual(3);
    });

    it('⑮ b9 spawner 按仿真时间生成并封顶 3 个', async () => {
        const { engine, world } = await bootTail();
        const spawned = () => adjunctsOf(world, AdjunctType.Ball)
            .filter((a: any) => a.stdData?.derivedFrom).length;
        expect(spawned(), 'nothing yet at t≈0').toBe(0);
        stepN(engine, 5 * 60);          // ~5 sim-seconds > 4s interval
        expect(spawned(), 'first ball after one interval').toBeGreaterThanOrEqual(1);
        stepN(engine, 20 * 60);         // run long past 3 intervals
        expect(spawned(), 'maxAlive caps the population').toBe(3);
    });
});
