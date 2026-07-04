import { test, expect } from '@playwright/test';
import { waitForWorldReady, stepEngine, walkUntil, worldFlags, playerPosition } from './helpers';

// 仙剑微缩 RPG「灵草记」完整通关 — the full data-driven RPG loop in the REAL
// client: dialogue UI (React panel → chooseDialogue) → slope-stop mountain
// ascent → trigger-borne Game entry → attack verb + contact damage → loot
// pickup → quest turn-in → reward → reload persistence. The level is pure
// AuthoredLevel JSON (?level=xianjian); zero quest code anywhere.

const VX = 2048, VY = 2048, PY = 2049, SY = 2050;

const AUNT_COLOR = 4482252, WOLF_COLOR = 8926003;

/** SPP northing of the player within block row `by`. */
const septopusN = async (page: any, by: number) => {
    const [, , z] = await playerPosition(page);
    return -z - (by - 1) * 16;
};
const altOf = async (page: any) => (await playerPosition(page))[1];

const teleport = (page: any, block: [number, number], pos: [number, number, number]) =>
    page.evaluate(([b, p]: any) => (window as any).loader.teleportSeptopus(b, p), [block, pos] as any);

const mode = (page: any) => page.evaluate(() => String((window as any).loader.engine.getWorld().mode));

/** Click (interact.primary) an NPC found by its authored visual colour, with the
 *  player's REAL distance in the payload — the same event the raycaster emits. */
const clickNpc = (page: any, color: number) => page.evaluate((c: number) => {
    const w = (window as any).loader.engine.getWorld();
    const pid = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
    const pt = w.getComponent(pid, 'TransformComponent');
    for (const eid of w.getEntitiesWith(['AdjunctComponent'])) {
        const std = w.getComponent(eid, 'AdjunctComponent')?.stdData;
        if (std?.typeId !== 0xba || std?.visual?.color !== c) continue;
        const t = w.getComponent(eid, 'TransformComponent');
        const d = Math.hypot(t.position[0] - pt.position[0], t.position[2] - pt.position[2]);
        w.events.emit('interact.primary', { metadata: null, distance: d, point: [0, 0, 0] }, { target: eid, actor: pid });
        return d;
    }
    return -1;
}, color);

/** Click the first live b5 item entity (loot pickup). */
const clickItem = (page: any) => page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const pid = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
    const items = w.getEntitiesWith(['ItemComponent']);
    if (!items.length) return false;
    w.events.emit('interact.primary', { metadata: null, distance: 2, point: [0, 0, 0] }, { target: items[0], actor: pid });
    return true;
});

const inventory = (page: any) => page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const pid = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
    const out: Record<string, number> = {};
    for (const it of w.getComponent(pid, 'InventoryComponent')?.items ?? []) {
        out[it.id] = (out[it.id] ?? 0) + (it.quantity ?? 0);
    }
    return out;
});

test('灵草记:接任务 → 上山 → 战妖狼 → 采药 → 交任务 → 重载存续', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/?level=xianjian');
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 90); // settle spawn

    // ── 村庄:沿路北行,找婶婶接任务(真实对话 UI)────────────────────────
    expect(await walkUntil(page, [0, 1], async () => (await septopusN(page, VY)) >= 8.3, 900),
        'walk up the village road').toBe(true);
    expect(await clickNpc(page, AUNT_COLOR), 'aunt within talk range').toBeLessThanOrEqual(3.5);
    await stepEngine(page, 3);

    const panel = page.getByTestId('dialogue-panel');
    await expect(panel, 'dialogue panel opened').toBeVisible();
    await expect(page.getByTestId('dialogue-text')).toContainText('灵草');
    await expect(page.getByTestId('dialogue-option-0')).toContainText('我这就去后山采灵草');

    await page.getByTestId('dialogue-option-0').click();   // 接任务
    await stepEngine(page, 3);
    await expect(page.getByTestId('dialogue-text')).toContainText('妖狼凶得很');
    expect((await worldFlags(page)).quest_herb, 'quest accepted').toBe(true);
    await page.getByTestId('dialogue-option-0').click();   // 「放心」→ 关闭
    await stepEngine(page, 3);
    await expect(panel).toHaveCount(0);

    // ── 山路:踏云梯上山(slope stops,海拔 0 → 4m)────────────────────────
    await teleport(page, [VX, PY], [8, 0.6, 0.5]);
    await stepEngine(page, 20);
    expect(await walkUntil(page, [0, 1], async () => (await septopusN(page, PY)) >= 15.6, 1500),
        'climb both cloud-ladder slopes').toBe(true);
    expect(await altOf(page), 'reached the 4 m summit plateau').toBeGreaterThan(4.5);

    // ── 山顶:game trigger 自动进 Game,妖狼追咬,两剑毙之 ───────────────────
    expect(await walkUntil(page, [0, 1], async () => (await septopusN(page, SY)) >= 3, 600),
        'cross into the summit block').toBe(true);
    await stepEngine(page, 10);
    expect(await mode(page), 'trigger-borne Game entry').toBe('game');

    const wolfDist = () => page.evaluate((c: number) => {
        const w = (window as any).loader.engine.getWorld();
        const pid = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
        const pt = w.getComponent(pid, 'TransformComponent');
        for (const eid of w.getEntitiesWith(['BehaviorComponent'])) {
            const std = w.getComponent(eid, 'AdjunctComponent')?.stdData;
            if (std?.visual?.color === c) {
                const t = w.getComponent(eid, 'TransformComponent');
                return Math.hypot(t.position[0] - pt.position[0], t.position[2] - pt.position[2]);
            }
        }
        return Infinity;
    }, WOLF_COLOR);

    expect(await walkUntil(page, [0, 1], async () => (await wolfDist()) < 3, 900),
        'close with the chasing wolf').toBe(true);
    await clickNpc(page, WOLF_COLOR);      // 第一剑 25
    await stepEngine(page, 30);            // 攻击冷却
    await clickNpc(page, WOLF_COLOR);      // 第二剑 25 → 毙
    await stepEngine(page, 10);
    expect((await worldFlags(page)).wolf_slain, 'wolf slain').toBe(true);

    // ── 灵草掉落 → 点击拾取 ────────────────────────────────────────────────
    expect(await clickItem(page), 'herb dropped').toBe(true);
    await stepEngine(page, 5);
    expect((await inventory(page))['tpl_3'] ?? 0, 'herb in the bag').toBeGreaterThanOrEqual(1);

    // ── 下山:走出战斗块,ephemeral 自动退回 Normal ─────────────────────────
    expect(await walkUntil(page, [0, -1], async () => (await septopusN(page, SY)) <= -0.5, 2000),
        'walk off the summit').toBe(true);
    await stepEngine(page, 10);
    expect(await mode(page), 'ephemeral exit back to normal').toBe('normal');

    // ── 回村交任务(对话分支按 flags+inventory 切换)→ 宝珠奖励 ─────────────
    await teleport(page, [VX, VY], [8, 8.3, 0.5]);
    await stepEngine(page, 20);
    await clickNpc(page, AUNT_COLOR);
    await stepEngine(page, 3);
    await expect(page.getByTestId('dialogue-option-0')).toContainText('灵草采来了');
    await page.getByTestId('dialogue-option-0').click();   // 交任务
    await stepEngine(page, 3);
    await expect(page.getByTestId('dialogue-text')).toContainText('宝珠');
    expect((await worldFlags(page)).quest_done, 'quest complete').toBe(true);
    await page.getByTestId('dialogue-option-0').click();   // 「却之不恭」→ 关闭
    await stepEngine(page, 5);

    await page.screenshot({ path: 'e2e/__screenshots__/rpg-xianjian-village.png' });

    expect(await clickItem(page), 'reward gem spawned').toBe(true);
    await stepEngine(page, 5);
    expect((await inventory(page))['itm_1_777'] ?? 0, 'gem in the bag').toBe(1);

    // ── 重载:任务状态 + 背包持久;对话选项收敛到终局 ────────────────────────
    await page.reload();
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 90);

    expect((await worldFlags(page)).quest_done, 'quest_done survives reload').toBe(true);
    const bag = await inventory(page);
    expect(bag['tpl_3'] ?? 0, 'herb survives reload').toBeGreaterThanOrEqual(1);
    expect(bag['itm_1_777'] ?? 0, 'gem survives reload').toBe(1);

    // 终局对话:两个任务选项都收敛,只剩「告辞」——经真实 UI 断言。
    expect(await walkUntil(page, [0, 1], async () => (await septopusN(page, VY)) >= 8.3, 900)).toBe(true);
    await clickNpc(page, AUNT_COLOR);
    await stepEngine(page, 3);
    await expect(page.getByTestId('dialogue-option-0')).toContainText('告辞');
    await expect(page.getByTestId('dialogue-option-1')).toHaveCount(0);
    await page.getByTestId('dialogue-close').click();

    // eslint-disable-next-line no-console
    console.log('RPG-XIANJIAN', JSON.stringify({ quest: 'complete', bag }));
});
