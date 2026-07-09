import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { AdjunctType } from '../../src/core/types/AdjunctType';
import level from '../../../client/core/src/levels/gallery.level.json';
import xianjianLevel from '../../../client/core/src/levels/xianjian.level.json';
import coasterLevel from '../../../client/core/src/levels/coaster.level.json';
import parkourLevel from '../../../client/core/src/levels/parkour.level.json';
import { levelSceneProvider } from '../../src/core/services/AuthoredLevel';

// The gallery's NEW tail blocks (1013–1017: b4 three-shape stops · b9 spawner ·
// c2 motif arch · c1 track · e5 board · ⑲ holdem game block) verified headless with the SAME client JSON the
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

describe('画廊新展块(⑭–⑲):语义 headless 验证', () => {
    it('⑭ b4 三形状碰撞体齐备,⑰ c1 轨道建实体,⑱ e5 留言板,每块一本书', async () => {
        const { world } = await bootTail();
        const stops = adjunctsOf(world, AdjunctType.Stop);
        expect(stops.length, 'box + ball + slope').toBe(3);
        const shapes = stops.map((s: any) => s.stdData?.stopShape).sort();
        expect(new Set(shapes).size, 'three DISTINCT shapes').toBe(3);

        expect(adjunctsOf(world, AdjunctType.Track).length, 'the S-curve tube').toBe(1);
        expect(adjunctsOf(world, AdjunctType.Book).length, 'numbered books + plaza gate signs').toBe(10);
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


describe('⑳ 传送广场:include 组合 + 锚点制传送(数据形状)', () => {
    const CONTENT: Record<string, any> = { xianjian: xianjianLevel, coaster: coasterLevel, parkour: parkourLevel };
    const p = levelSceneProvider(level as any, (ref: string) => CONTENT[ref] ?? null);
    const b8rows = (raw: any) => (raw[2] as any[]).find((g) => g[0] === 0x00b8)?.[1] ?? [];
    const anchors = (raw: any) => b8rows(raw).map((r: any) => r[6]?.name).filter(Boolean);
    const teleports = (raw: any) => b8rows(raw)
        .flatMap((r: any) => (r[5] ?? []) as any[])
        .flatMap((ev: any) => ev.actions ?? [])
        .filter((a: any) => a.method === 'teleport')
        .map((a: any) => a.target);

    it('广场块:自身锚 + 三座门各指一个目的锚', () => {
        const plaza = p.block(2000, 1019);
        expect(anchors(plaza)).toContain('gallery-plaza');
        expect(teleports(plaza).sort()).toEqual(['g-coaster', 'g-parkour', 'g-xianjian']);
    });

    it('三个目的地经 include 迁移到位,各带到达锚 + 返回门(指回广场)', () => {
        for (const [x, y, name] of [[2010, 1010, 'g-xianjian'], [2004, 1004, 'g-coaster'], [2006, 1010, 'g-parkour']] as const) {
            const raw = p.block(x, y);
            expect(raw, `${name} 目的块已组合`).toBeTruthy();
            expect(anchors(raw), `${name} 到达锚`).toContain(name);
            expect(teleports(raw), `${name} 返回门`).toContain('gallery-plaza');
        }
    });

    it('include 只迁键不改内容:仙剑村原坐标在画廊文档里为空(fallback 兜底面)', () => {
        // 原村庄 [2048,2048] 未在画廊授权 → 不应出现村庄内容
        const raw = p.block(2048, 2048);
        const groups = raw?.[2] ?? [];
        const rowCount = groups.reduce((n: number, g: any) => n + g[1].length, 0);
        expect(rowCount, '原址无内容泄漏').toBeLessThanOrEqual(1); // 至多 fallback 地面
    });
});
