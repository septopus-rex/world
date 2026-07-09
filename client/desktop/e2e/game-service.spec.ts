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
const SERVICES = join(__dirname, '../../../services');
const GAME = 'http://127.0.0.1:7787';   // mahjong's own server
const HOLDEM = 'http://127.0.0.1:7784'; // holdem's own server
const MAHJONG_BLOCK: [number, number] = [2049, 2048];
const HOLDEM_BLOCK: [number, number] = [2047, 2047];

// MULTI-GAME: each Pattern-A game runs as its OWN physical service — both are
// spawned here, and the tests prove each table dials only ITS server.
const procs: ChildProcess[] = [];

async function waitHealth(base: string, what: string): Promise<void> {
    for (let i = 0; i < 30; i++) {
        try { if ((await fetch(`${base}/v0/health`)).ok) return; } catch { /* not yet */ }
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(`${what} service did not come up`);
}
test.beforeAll(async () => {
    for (const name of ['mahjong', 'holdem']) {
        procs.push(spawn('npm', ['start'], { cwd: join(SERVICES, name), stdio: 'ignore', detached: true }));
    }
    await Promise.all([waitHealth(GAME, 'mahjong'), waitHealth(HOLDEM, 'holdem')]);
});
test.afterAll(() => {
    for (const p of procs) { try { if (p.pid) process.kill(-p.pid, 'SIGKILL'); } catch { p.kill('SIGKILL'); } }
});

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
    await page.goto('/?level=demo');
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 90);
    await page.evaluate((b) => (window as any).loader.teleportSeptopus(b, [3, 3, 3]), MAHJONG_BLOCK);
    await stepEngine(page, 40);
    expect(await page.evaluate(() => (window as any).loader.engine.getWorld().gameZoneActive)).toBe(true);

    // Deterministic gate: the PAGE must reach the service before we enter —
    // converts any environment/timing flake into an immediate, named failure.
    const probe = await page.evaluate(async () => {
        try {
            const ok = await (window as any).loader.net.http('game:mahjong').probe();
            return { ok };
        } catch (e) { return { ok: false, err: String(e) }; }
    });
    expect(probe.ok, `page-side probe reached the game service (${JSON.stringify(probe)})`).toBe(true);

    // Enter Game → ProbedGameApi finds the cached online probe → FetchGameApi handshake.
    await page.getByTestId('enter-game').click();
    const started = await pumpUntil(page, async () =>
        page.evaluate(() => !!(window as any).loader.mahjongState));
    expect(started, 'board arrived after the HTTP start handshake').toBe(true);
    const transport = await page.evaluate(() => (window as any).__SEPTOPUS_GAME_TRANSPORT__);
    expect(transport, 'the start went over HTTP, not loopback').toBe('http');

    // The session lives on the SERVER — its stats moved.
    const after = await (await request.get(`${GAME}/v0/stats`)).json();
    expect(after.calls, 'server actually served the calls').toBeGreaterThan(before.calls ?? 0);
    expect(after.sessions, 'a server-side session is open').toBeGreaterThanOrEqual(1);
});


test('多游戏隔离:德州拨德州的服务器,麻将的账本不动', async ({ page, request }) => {
    test.setTimeout(120_000);
    const mjBefore = await (await request.get(`${GAME}/v0/stats`)).json();
    const hdBefore = await (await request.get(`${HOLDEM}/v0/stats`)).json();

    await page.goto('/?level=demo');
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 90);
    await page.evaluate((b) => (window as any).loader.teleportSeptopus(b, [8, 5, 2]), HOLDEM_BLOCK);
    await stepEngine(page, 40);
    expect(await page.evaluate(() => (window as any).loader.engine.getWorld().gameZoneActive), 'holdem zone').toBe(true);

    const probe = await page.evaluate(() => (window as any).loader.net.http('game:holdem').probe());
    expect(probe, 'page reaches the holdem service').toBe(true);

    // Enter → the hold'em HUD arrives over HTTP; play a street via the HUD.
    await page.getByTestId('enter-game').click();
    const started = await pumpUntil(page, async () =>
        page.evaluate(() => !!document.querySelector('[data-testid="holdem-hud"]')));
    expect(started, 'holdem HUD arrived after the start handshake').toBe(true);
    await expect(page.getByTestId('hd-phase')).toHaveText('preflop');
    await expect(page.getByTestId('hd-pot')).toHaveText('20');

    await page.getByTestId('hd-act-bet').click();
    const flopped = await pumpUntil(page, async () =>
        page.evaluate(() => document.querySelector('[data-testid="hd-phase"]')?.textContent === 'flop'));
    expect(flopped, 'bet advanced to the flop via the server').toBe(true);
    await expect(page.getByTestId('hd-pot')).toHaveText('60');

    // Ledgers: the holdem server served this session; mahjong's did NOT move.
    const mjAfter = await (await request.get(`${GAME}/v0/stats`)).json();
    const hdAfter = await (await request.get(`${HOLDEM}/v0/stats`)).json();
    expect(hdAfter.calls, 'holdem server served the calls').toBeGreaterThan(hdBefore.calls ?? 0);
    expect(hdAfter.sessions).toBeGreaterThanOrEqual(1);
    expect(mjAfter.calls, 'mahjong server untouched by the holdem table').toBe(mjBefore.calls ?? 0);
    await page.screenshot({ path: 'test-results/holdem-table.png' });
});
