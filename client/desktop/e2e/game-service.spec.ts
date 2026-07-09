import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForWorldReady, stepEngine } from './helpers';

// Pattern-A external game against the REAL services/game process (spawned by
// this spec) — the third rung after the in-page loopback and the
// route-intercepted fake of mahjong-server.spec: the DEFAULT transport tiering
// (ProbedGameApi) finds the live server, the start handshake goes over real
// HTTP, and the session state is held SERVER-side (proven via /v0/stats).
// Without this process running, the same flow silently falls back to loopback —
// which every other game e2e in this suite exercises.

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAME_DIR = join(__dirname, '../../../services/game');
const GAME = 'http://127.0.0.1:7787';
const MAHJONG_BLOCK: [number, number] = [2049, 2048];

let srv: ChildProcess;

test.beforeAll(async () => {
    srv = spawn('npm', ['start'], { cwd: GAME_DIR, stdio: 'ignore', detached: true }); // own process group — kill(-pid) reaps the tsx child too
    for (let i = 0; i < 30; i++) {
        try { if ((await fetch(`${GAME}/v0/health`)).ok) return; } catch { /* not yet */ }
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('game service did not come up');
});
test.afterAll(() => { try { if (srv?.pid) process.kill(-srv.pid, 'SIGKILL'); } catch { srv?.kill('SIGKILL'); } });

async function pumpUntil(page: any, cond: () => Promise<boolean>, maxRounds = 60): Promise<boolean> {
    for (let i = 0; i < maxRounds; i++) {
        await stepEngine(page, 3);
        if (await cond()) return true;
    }
    return false;
}

test('外部游戏走真进程:探测→HTTP start 握手→会话在服务端', async ({ page, request }) => {
    test.setTimeout(120_000);

    const before = await (await request.get(`${GAME}/v0/stats`)).json();

    page.on('console', (m) => { if (/\[games\]/.test(m.text())) console.log('  ↳', m.text()); });
    await page.goto('/');
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 90);
    await page.evaluate((b) => (window as any).loader.teleportSeptopus(b, [3, 3, 3]), MAHJONG_BLOCK);
    await stepEngine(page, 40);
    expect(await page.evaluate(() => (window as any).loader.engine.getWorld().gameZoneActive)).toBe(true);

    // Enter Game → ProbedGameApi probes 7787 (live!) → FetchGameApi handshake.
    await page.getByTestId('enter-game').click();
    const started = await pumpUntil(page, async () =>
        page.evaluate(() => !!(window as any).loader.mahjongState));
    expect(started, 'board arrived after the HTTP start handshake').toBe(true);

    // The session lives on the SERVER — its stats moved.
    const after = await (await request.get(`${GAME}/v0/stats`)).json();
    expect(after.calls, 'server actually served the calls').toBeGreaterThan(before.calls ?? 0);
    expect(after.sessions, 'a server-side session is open').toBeGreaterThanOrEqual(1);
});
