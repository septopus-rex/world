import { test, expect } from '@playwright/test';
import { waitForWorldReady, stepEngine } from './helpers';

// Block-scoped editing on the MOBILE shell (design 2026-07-21):
//   · the EDIT toggle (right-thumb stack) enters Edit for the block you STAND ON
//     — the engine locks it as the session target (EditSessionManager)
//   · the engine's own DOM palette (DefaultUIProvider) comes up; an armed type
//     + a surface point places an adjunct (the same channel a canvas tap feeds)
//   · walking into a NEIGHBOURING block does NOT end the session — that is the
//     point: you place, then step out to inspect the build from outside
//   · DONE exits Edit and persists the block draft.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('移动壳编辑:EDIT 锁定脚下块 → palette 摆放 → 走到邻块会话仍在 → DONE 存草稿退出', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await expect(page.getByTestId('mobile-app')).toBeVisible();
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 90); // settle: land on the ground

    // ── enter Edit through the block-scoped toggle ────────────────────────────
    await expect(page.getByTestId('m-edit-toggle')).toHaveAttribute('aria-label', '编辑此块');
    await page.getByTestId('m-edit-toggle').tap();
    await stepEngine(page, 10); // EditSystem locks the session on the next frames
    await expect(page.getByTestId('status-toggle')).toHaveAttribute('aria-label', /edit/i);
    await expect(page.getByTestId('m-edit-toggle')).toHaveAttribute('aria-label', '完成编辑');

    // The engine locked the block under the player…
    const lock = await page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        if (w.activeEditBlockId === null) return null;
        const b = w.getComponent(w.activeEditBlockId, 'BlockComponent');
        return b ? { x: b.x, y: b.y } : null;
    });
    expect(lock, 'edit session locked to the block under the player').not.toBeNull();
    // …and its DOM palette is tappable.
    await expect(page.locator('.sept-ui-group button', { hasText: 'Box' })).toBeVisible();
    await page.screenshot({ path: 'test-results/mobile-edit-0-palette.png' });

    // ── boundary visuals are a COMPASS: slab edge ↔ colour is a contract ──────
    // (DIRECTION_COLORS in render/EditorHelpers; north = engine −Z, red like the
    // MiniCompass needle). Positions are handle-relative → floating-origin-proof.
    const visuals = await page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        const handle = w.getComponent(w.activeEditBlockId, 'MeshComponent')?.handle;
        const hw = new handle.position.constructor();
        handle.getWorldPosition(hw);
        const slabs: Record<string, { rel: number[]; color: string }> = {};
        let rays = 0;
        handle.traverse((o: any) => {
            if (o.name?.startsWith('boundary-')) {
                const p = new hw.constructor();
                o.getWorldPosition(p);
                slabs[o.name.slice('boundary-'.length)] = {
                    rel: [Math.round(p.x - hw.x), Math.round(p.z - hw.z)],
                    color: '#' + o.material.color.getHexString(),
                };
            }
            if (o.name === 'corner-ray') rays++;
        });
        return { slabs, rays };
    });
    expect(visuals.rays, '4 corners × 3 fading segments').toBe(12);
    expect(visuals.slabs).toEqual({
        north: { rel: [8, -16], color: '#ef4444' }, // −Z edge, red (= compass needle)
        south: { rel: [8, 0], color: '#facc15' },
        east: { rel: [16, -8], color: '#3b82f6' },
        west: { rel: [0, -8], color: '#22c55e' },
    });

    // ── place a box: armed type + a surface point inside the active block ─────
    const placed = await page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        const before = w.queryEntities('AdjunctComponent').length;
        const editSys: any = w.systems.findSystemByName('EditSystem');
        editSys.placingTypeId = 0x00a2;

        const blockEid = w.activeEditBlockId;
        const block = w.getComponent(blockEid, 'BlockComponent');
        // Engine coords of Septopus (5, 5, 0) in the active block.
        const ex = (block.x - 1) * 16 + 5;
        const ez = -((block.y - 1) * 16 + 5);
        w.events.emit('interact.primary',
            { metadata: {}, distance: 5, point: [ex, 0, ez] },
            { target: blockEid, actor: w.queryEntities('TransformComponent', 'InputStateComponent')[0] });
        for (let i = 0; i < 3; i++) (window as any).loader.engine.step(1 / 60);
        return { delta: w.queryEntities('AdjunctComponent').length - before };
    });
    expect(placed.delta, 'armed palette type + surface point placed one adjunct').toBe(1);

    // ── walk out: put the player in the neighbouring block — session survives ─
    await page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        const pid = w.queryEntities('TransformComponent', 'InputStateComponent')[0];
        w.getComponent(pid, 'TransformComponent').position[0] += 16; // one block east
    });
    await stepEngine(page, 30);
    const after = await page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        const b = w.activeEditBlockId !== null ? w.getComponent(w.activeEditBlockId, 'BlockComponent') : null;
        return { mode: w.mode, x: b?.x, y: b?.y };
    });
    expect(after.mode, 'still in Edit after leaving the block').toBe('edit');
    expect([after.x, after.y], 'session still targets the ORIGINAL block').toEqual([lock!.x, lock!.y]);
    await page.screenshot({ path: 'test-results/mobile-edit-1-neighbour.png' });

    // ── DONE exits Edit and the placement persisted into the block draft ──────
    await page.getByTestId('m-edit-toggle').tap();
    await stepEngine(page, 10);
    await expect(page.getByTestId('status-toggle')).toHaveAttribute('aria-label', /normal/i);
    await expect(page.getByTestId('m-edit-toggle')).toHaveAttribute('aria-label', '编辑此块');

    const survived = await page.evaluate(async ([bx, by]: number[]) => {
        const w = (window as any).loader.engine.getWorld();
        await w.draftStore.flush();
        const draft = w.draftStore.load(0, bx, by);
        const boxes = draft?.raw?.[2]?.find((g: any[]) => g[0] === 0x00a2)?.[1] ?? [];
        return boxes.some((row: any[]) => row[1][0] === 5 && row[1][1] === 5);
    }, [lock!.x, lock!.y]);
    expect(survived, 'placed box persisted into the block draft').toBe(true);
});
