import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForWorldReady, stepEngine } from './helpers';

// e5 board — the server-backed message wall, END TO END against the REAL
// services/board process (spawned by this spec): click the gallery board →
// panel opens (live channel) → post a message over HTTP → it lists → reload
// the page → the message SURVIVED (server-side persistence, not page state).
// Offline degradation is the world's default elsewhere (no service → read-only).

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOARD_DIR = join(__dirname, '../../../services/board');
const BOARD = 'http://127.0.0.1:7786';
const GALLERY_BOARD_BLOCK: [number, number] = [2000, 1017];

let srv: ChildProcess;

test.beforeAll(async () => {
    rmSync(join(BOARD_DIR, 'data'), { recursive: true, force: true }); // deterministic run
    srv = spawn('npm', ['start'], { cwd: BOARD_DIR, stdio: 'ignore', detached: true }); // own process group — kill(-pid) reaps the tsx child too
    for (let i = 0; i < 30; i++) {
        try { if ((await fetch(`${BOARD}/v0/health`)).ok) return; } catch { /* not yet */ }
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('board service did not come up');
});
test.afterAll(() => { try { if (srv?.pid) process.kill(-srv.pid, 'SIGKILL'); } catch { srv?.kill('SIGKILL'); } });

/** Click the board entity via the same interact.primary the raycaster emits. */
const clickBoard = (page: any) => page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    const eid = w.getEntitiesWith(['AdjunctComponent'])
        .find((id: any) => w.getComponent(id, 'AdjunctComponent')?.stdData?.typeId === 0x00e5);
    if (eid === undefined) return false;
    const pid = w.getEntitiesWith(['TransformComponent', 'InputStateComponent'])[0];
    w.events.emit('interact.primary', { metadata: null, distance: 2, point: [0, 0, 0] }, { target: eid, actor: pid });
    return true;
});

test('e5 留言板:点击开板 → 发布留言 → 重载后留言仍在(服务器持久化)', async ({ page }) => {
    test.setTimeout(120_000);
    const MSG = `你好,画廊!(${Date.now()})`;

    await page.goto('/?level=gallery');
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await page.evaluate((b) => (window as any).loader.teleportSeptopus(b, [8, 6, 1]), GALLERY_BOARD_BLOCK);
    await stepEngine(page, 60);

    // Click the board → panel opens on the LIVE channel (not offline).
    expect(await clickBoard(page), 'found and clicked the e5 board').toBe(true);
    await stepEngine(page, 5);
    await expect(page.getByTestId('board-panel')).toBeVisible();
    await expect(page.getByTestId('board-offline')).toHaveCount(0);

    // Post over real HTTP → it appears in the list.
    await page.getByTestId('board-input').fill(MSG);
    await page.getByTestId('board-post').click();
    await expect(page.getByTestId('board-list')).toContainText(MSG, { timeout: 10_000 });

    // Reload the world — the message survived on the SERVER, not in page state.
    await page.reload();
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await page.evaluate((b) => (window as any).loader.teleportSeptopus(b, [8, 6, 1]), GALLERY_BOARD_BLOCK);
    await stepEngine(page, 60);
    expect(await clickBoard(page)).toBe(true);
    await stepEngine(page, 5); // flush the boundary event
    await expect(page.getByTestId('board-list')).toContainText(MSG, { timeout: 10_000 });
    await page.screenshot({ path: 'test-results/board.png' });
});
