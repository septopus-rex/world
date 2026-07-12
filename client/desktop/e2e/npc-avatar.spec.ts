import { test, expect } from '@playwright/test';
import { waitForWorldReady, stepEngine } from './helpers';

// NPC with a MODULE visual (gallery ②: visual = {module:33 soldier.glb}) — the
// ba row rides the same load-once/placeholder→swap pipeline as a4 and the
// player avatar, and the swap now registers the model's clips (rig root = the
// MeshComponent group), so NPCSystem's walk/idle feed animates the skeleton.
// This drives the REAL renderer end to end: model swapped in (SkinnedMesh
// present), mixer ticking, walk state while wandering, facing the travel
// direction, idle again when the player steps close (behavior transition).

// Gallery block [2000,1001] (exhibit ②), npc home at local [5.5, 9] → engine coords:
const NPC_X = (2000 - 1) * 16 + 5.5;
const NPC_Z = -((1001 - 1) * 16 + 9);

/** Snapshot the gallery ② NPC: position/yaw + animation rig state + mesh kind. */
const npcState = (page: any) => page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    for (const eid of w.getEntitiesWith(['AdjunctComponent'])) {
        const a = w.getComponent(eid, 'AdjunctComponent');
        if (a?.stdData?.typeId !== 0x00ba || !String(a?.adjunctId).includes('2000_1001')) continue;
        const t = w.getComponent(eid, 'TransformComponent');
        const handle = w.getComponent(eid, 'MeshComponent')?.handle;
        let skinned = 0; handle?.traverse?.((c: any) => { if (c.isSkinnedMesh) skinned++; });
        const anim = w.renderEngine.getAnimationDebug?.(handle) ?? null;
        return {
            pos: [t.position[0], t.position[1], t.position[2]],
            yaw: t.rotation[1],
            skinned,
            clips: anim?.clips?.length ?? 0,
            state: anim?.state ?? null,
            activeTime: anim?.activeTime ?? 0,
            running: anim?.activeRunning ?? false,
        };
    }
    return null;
});

const placePlayer = (page: any, pos: number[]) => page.evaluate((p: number[]) => {
    const w = (window as any).loader.engine.getWorld();
    const pid = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
    const t = w.getComponent(pid, 'TransformComponent');
    t.position[0] = p[0]; t.position[1] = p[1]; t.position[2] = p[2];
}, pos);

test('NPC 模型化身:soldier 换入 → 骨骼动画 walk/idle → 随移动转向', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/'); // bare entry = the gallery corridor
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 90);

    // Stand 5 m south of the NPC's home (outside its 2 m "player near" idle
    // transition) — streaming pulls block [2000,1001] in around the player.
    await placePlayer(page, [NPC_X, 1.0, NPC_Z + 5]);

    // Poll: block streamed → npc entity exists → async GLB swap done (SkinnedMesh).
    let s: any = null;
    for (let i = 0; i < 60 && !(s && s.skinned > 0 && s.clips > 0); i++) {
        await stepEngine(page, 15);
        s = await npcState(page);
    }
    expect(s, 'npc entity streamed in').not.toBeNull();
    expect(s.skinned, 'soldier model (SkinnedMesh) swapped in — not the placeholder').toBeGreaterThan(0);
    expect(s.clips, 'animation clips registered on the adjunct rig').toBeGreaterThan(0);

    // ── wander: walk state, mixer ticking, actually displacing ────────────────
    await stepEngine(page, 180); // 3 s: idle(2s) → wander
    const p1 = await npcState(page);
    await stepEngine(page, 60);  // 1 s of travel
    const p2 = await npcState(page);
    const moved = Math.hypot(p2.pos[0] - p1.pos[0], p2.pos[2] - p1.pos[2]);
    expect(moved, 'npc displaced while wandering').toBeGreaterThan(0.2);
    expect(p2.state, 'walk state while moving').toBe('walk');
    expect(p2.running, 'walk action is playing').toBe(true);
    // >0 proves the mixer ticks with simulation steps (an un-started rig stays
    // at exactly 0). Not >some-duration: arriving at a wander target flickers
    // walk→idle→walk, and the re-entry resets action.time — sampling can land
    // right after such a leg boundary.
    expect(p2.activeTime, 'mixer advanced with simulation steps').toBeGreaterThan(0);

    // ── facing: yaw matches the travel direction (soldier facing = 0) ─────────
    const q1 = await npcState(page);
    await stepEngine(page, 6); // 0.1 s — well inside one wander leg
    const q2 = await npcState(page);
    const dx = q2.pos[0] - q1.pos[0], dz = q2.pos[2] - q1.pos[2];
    if (Math.hypot(dx, dz) > 0.05) { // still travelling (not at a leg boundary)
        const want = Math.atan2(-dx, -dz);
        const diff = Math.abs(Math.atan2(Math.sin(q2.yaw - want), Math.cos(q2.yaw - want)));
        expect(diff, 'model faces its travel direction').toBeLessThan(0.2);
    }

    // ── player steps close (<2 m) → behavior transition → idle animation ──────
    const here = await npcState(page);
    await placePlayer(page, [here.pos[0] + 1.0, 1.0, here.pos[2]]);
    await stepEngine(page, 30);
    const near = await npcState(page);
    expect(near.state, 'greets the approach by settling to idle').toBe('idle');

    // ── talk: REALLY click the soldier (canvas pixel → raycast → dialogue) ────
    // Not an emitted event: the real path is what regressed twice — the model
    // clone missing the raycast layer, and payload.distance carrying camera
    // distance past the TALK_RANGE gate.
    await clickNpcOnCanvas(page);
    await stepEngine(page, 8);

    const panel = page.getByTestId('dialogue-panel');
    await expect(panel, 'clicking the soldier opens his dialogue').toBeVisible();
    await expect(page.getByTestId('dialogue-text')).toContainText('巡逻');

    await page.getByTestId('dialogue-option-0').click(); // 「你怎么和我长得一样?」
    await stepEngine(page, 5);
    await expect(page.getByTestId('dialogue-text'), 'option navigated the tree').toContainText('同一个模型');

    await page.getByTestId('dialogue-close').click();
    await stepEngine(page, 5);
    await expect(panel, 'dialogue closes cleanly').toHaveCount(0);
});

/** Project the NPC's chest to screen pixels and genuinely click there. */
async function clickNpcOnCanvas(page: any): Promise<void> {
    const pt = await page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        for (const eid of w.getEntitiesWith(['AdjunctComponent'])) {
            const a = w.getComponent(eid, 'AdjunctComponent');
            if (a?.stdData?.typeId === 0x00ba && String(a?.adjunctId).includes('2000_1001')) {
                const t = w.getComponent(eid, 'TransformComponent');
                return w.renderEngine.worldToScreen(t.position[0], t.position[1] + 0.9, t.position[2]);
            }
        }
        return null;
    });
    const box = (await page.locator('canvas[data-engine]').boundingBox())!;
    await page.mouse.click(box.x + pt.x * box.width, box.y + pt.y * box.height);
}

test('NPC 对话(mobile 壳):真实点击 → 面板开', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/?ui=mobile');
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 90);
    await placePlayer(page, [NPC_X, 1.0, NPC_Z + 2.2]);
    let s: any = null;
    for (let i = 0; i < 60 && !(s && s.skinned > 0); i++) {
        await stepEngine(page, 15);
        s = await npcState(page);
    }
    await stepEngine(page, 60); // settle: within 2 m → the npc idles in place
    await clickNpcOnCanvas(page);
    await stepEngine(page, 8);
    await expect(page.getByTestId('dialogue-panel'), 'mobile shell opens the dialogue too').toBeVisible();
    await expect(page.getByTestId('dialogue-text')).toContainText('巡逻');
});
