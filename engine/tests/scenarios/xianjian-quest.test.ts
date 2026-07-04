import { describe, it, expect } from 'vitest';
import { makeHeadlessEngine, stepN } from '../helpers/make-world';
import { AdjunctType } from '../../src/core/types/AdjunctType';
import { registerDemoItemTemplates } from '../../src/core/mocks/ItemTemplates';
import level from '../../../client/desktop/src/levels/xianjian.level.json';

registerDemoItemTemplates(); // the client registers these at boot; headless must too

// THE RPG walkthrough (headless twin of e2e/rpg-xianjian.spec.ts): the 仙剑-
// flavoured quest loop driven end-to-end through the REAL systems — dialogue
// tree (F4) → slope ascent (b4 slope stops) → trigger-borne Game entry →
// attack verb + contact damage (combat) → loot pickup → quest turn-in. The
// level is the SAME client JSON the browser loads: pure data, zero quest code.

const VX = 2048, VY = 2048;          // village block
const PY = 2049, SY = 2050;          // path / summit rows

function playerOf(world: any) {
    return world.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
}

async function bootLevel() {
    const engine = await makeHeadlessEngine();
    const world: any = engine.getWorld()!;
    for (const b of (level as any).blocks) {
        engine.injectBlock({ x: b.x, y: b.y, world: 'main', elevation: b.raw[0], adjuncts: b.raw });
    }
    stepN(engine, 10);
    const pid = playerOf(world);
    const t = world.getComponent(pid, 'TransformComponent');
    const spp = (bx: number, by: number, e: number, n: number, alt: number) => {
        t.position[0] = (bx - 1) * 16 + e;
        t.position[1] = alt;
        t.position[2] = -((by - 1) * 16 + n);
        t.dirty = true;
    };
    const E = (bx: number) => t.position[0] - (bx - 1) * 16;
    const N = (by: number) => -t.position[2] - (by - 1) * 16;
    const alt = () => t.position[1];
    const walkUntil = (ix: number, iy: number, cond: () => boolean, maxFrames = 1500) => {
        (engine as any).setMoveIntent(ix, iy);
        let i = 0;
        for (; i < maxFrames && !cond(); i++) engine.step(1 / 60);
        (engine as any).setMoveIntent(0, 0);
        stepN(engine, 20);
        return i < maxFrames;
    };
    const npcByColor = (color: number) => world.getEntitiesWith(['AdjunctComponent']).find((e: number) => {
        const std = world.getComponent(e, 'AdjunctComponent')?.stdData;
        return std?.typeId === AdjunctType.Npc && std?.visual?.color === color;
    });
    const click = (eid: number, distance = 1.2) => {
        world.events.emit('interact.primary', { metadata: null, distance, point: [0, 0, 0] },
            { target: eid, actor: pid });
    };
    const dialogueLabels = () => {
        const d = world.activeDialogue;
        if (!d) return null;
        const node = d.doc.nodes[d.nodeId];
        return d.visible.map((i: number) => String(node.options[i].label));
    };
    const inventoryOf = () => {
        const inv = world.getComponent(pid, 'InventoryComponent');
        const out: Record<string, number> = {};
        for (const it of inv?.items ?? []) out[it.id] = (out[it.id] ?? 0) + (it.quantity ?? 0);
        return out;
    };
    return { engine, world, pid, t, spp, E, N, alt, walkUntil, npcByColor, click, dialogueLabels, inventoryOf };
}

describe('仙剑微缩 RPG — 灵草记 full quest walkthrough', () => {
    it('accept quest → climb the slopes → fight in the Game zone → loot → turn in', async () => {
        const q = await bootLevel();
        const { engine, world } = q;

        // ── 村庄:接任务 ────────────────────────────────────────────────
        q.spp(VX, VY, 8, 2, 0.95);
        stepN(engine, 20);
        expect(q.walkUntil(0, 1, () => q.N(VY) >= 8.3), 'walk up the village road').toBe(true);

        const aunt = q.npcByColor(4482252);
        expect(aunt, '婶婶 materialized').toBeDefined();
        q.click(aunt);
        stepN(engine, 2);
        expect(world.activeDialogue, 'dialogue opened').toBeTruthy();
        expect(q.dialogueLabels()).toEqual(['我这就去后山采灵草!', '告辞。']); // turn-in hidden
        engine.chooseDialogue(0);                       // accept the quest
        stepN(engine, 2);
        expect(world.globalFlags.quest_herb).toBe(true);
        expect(world.activeDialogue?.nodeId).toBe('accepted');
        engine.chooseDialogue(0);                       // "放心" → ends
        stepN(engine, 2);
        expect(world.activeDialogue).toBeFalsy();

        // ── 山路:踏云梯上山(slope stops,0 → 4 m)──────────────────────
        q.spp(VX, PY, 8, 0.6, 0.95);
        stepN(engine, 20);
        expect(q.walkUntil(0, 1, () => q.N(PY) >= 15.6), 'climb both slopes').toBe(true);
        expect(q.alt()).toBeGreaterThan(4.5);           // 4 m summit + body half-height

        // ── 山顶:trigger 进 Game,妖狼追咬,点击攻击 ─────────────────────
        expect(q.walkUntil(0, 1, () => q.N(SY) >= 3), 'cross into the summit block').toBe(true);
        stepN(engine, 5);
        expect(String(world.mode), 'game trigger fired on entry').toBe('game');

        const wolf = q.npcByColor(8926003);
        expect(wolf, '妖狼 materialized').toBeDefined();
        const hpBefore = world.getComponent(q.pid, 'HealthComponent')?.hp ?? 100;

        // Walk toward the lair until the wolf is in reach, then two sword blows
        // (25 dmg each, 0.4 s cooldown apart) put down the 50 hp wolf.
        const wolfDist = () => {
            const wt = world.getComponent(wolf, 'TransformComponent');
            return Math.hypot(wt.position[0] - q.t.position[0], wt.position[2] - q.t.position[2]);
        };
        expect(q.walkUntil(0, 1, () => wolfDist() < 3), 'close with the wolf').toBe(true);
        q.click(wolf, wolfDist());
        stepN(engine, 30);                              // ride out the cooldown (0.5 s)
        q.click(wolf, Math.min(wolfDist(), 3.4));
        stepN(engine, 5);
        expect(world.getComponent(wolf, 'BehaviorComponent')?.dead, 'wolf slain').toBe(true);
        expect(world.globalFlags.wolf_slain).toBe(true);

        // The chase bit us at least once on the way in — combat had teeth.
        const hpAfter = world.getComponent(q.pid, 'HealthComponent')?.hp ?? 100;
        expect(hpAfter).toBeLessThan(hpBefore);

        // ── 拾取灵草(妖狼老巢掉落)────────────────────────────────────
        stepN(engine, 5);
        const herb = world.getEntitiesWith(['ItemComponent'])[0];
        expect(herb, 'herb dropped at the lair').toBeDefined();
        q.click(herb, 2.0);
        stepN(engine, 3);
        expect(q.inventoryOf()['tpl_3'] ?? 0).toBeGreaterThanOrEqual(1);

        // ── 下山:走出战斗块自动回 Normal(ephemeral)────────────────────
        expect(q.walkUntil(0, -1, () => q.N(SY) <= -0.5, 2000), 'walk off the summit').toBe(true);
        stepN(engine, 10);
        expect(String(world.mode), 'ephemeral exit on leaving the block').toBe('normal');

        // ── 回村交任务 ──────────────────────────────────────────────────
        q.spp(VX, VY, 8, 8.3, 0.95);
        stepN(engine, 20);
        q.click(aunt);
        stepN(engine, 2);
        expect(q.dialogueLabels()).toEqual(['灵草采来了,给您。', '告辞。']); // accept hidden, turn-in shown
        engine.chooseDialogue(0);
        stepN(engine, 2);
        expect(world.globalFlags.quest_done, 'quest complete').toBe(true);
        expect(world.activeDialogue?.nodeId).toBe('thanks');
        engine.chooseDialogue(0);
        stepN(engine, 2);

        // 宝珠奖励:掉在婶婶脚边 → 拾取
        const gem = world.getEntitiesWith(['ItemComponent'])[0];
        expect(gem, 'reward gem spawned').toBeDefined();
        q.click(gem, 2.5);
        stepN(engine, 3);
        expect(q.inventoryOf()['itm_1_777'] ?? 0, 'gem in the bag').toBe(1);

        // 终局:再点婶婶,两个任务选项都消失,只剩告辞
        q.click(aunt);
        stepN(engine, 2);
        expect(q.dialogueLabels()).toEqual(['告辞。']);
        engine.endDialogue();
    }, 60_000);
});
