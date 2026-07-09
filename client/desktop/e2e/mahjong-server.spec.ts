import { test, expect, type Route, type Request } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForWorldReady, stepEngine } from './helpers';

// FULL game-setting mode against a SPECIFIED SERVER, as ONE continuous run — not
// segment-by-segment. The mahjong table sits in the world; entering its zone makes
// the engine resolve the Game Setting and connect to the server declared by its
// `baseurl` (game.md §2/§3): start handshake → several moves → end, every call a
// REAL fetch leaving the engine. The route layer only REWRITES the data-declared
// relative baseurl ('/api/mahjong') onto the REAL services/game process spawned
// below — the game runs in a genuinely separate server process (2026-07-09; the
// in-test MahjongGame fake it replaced was a client-split casualty anyway).

const MAHJONG_BLOCK: [number, number] = [2049, 2048];
const GAME_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../services/mahjong');
const GAME = 'http://127.0.0.1:7787';

let srv: ChildProcess;
test.beforeAll(async () => {
    srv = spawn('npm', ['start'], { cwd: GAME_DIR, stdio: 'ignore', detached: true });
    for (let i = 0; i < 30; i++) {
        try { if ((await fetch(`${GAME}/v0/health`)).ok) return; } catch { /* not yet */ }
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('game service did not come up');
});
test.afterAll(() => { try { if (srv?.pid) process.kill(-srv.pid, 'SIGKILL'); } catch { srv?.kill('SIGKILL'); } });

/** Step in separate evaluates (real gaps) until `cond` holds — lets the async
 *  fetch round-trips resolve and their game.* events flush on a later step. */
async function pumpUntil(page: any, cond: () => Promise<boolean>, maxRounds = 60): Promise<boolean> {
    for (let i = 0; i < maxRounds; i++) {
        await stepEngine(page, 3);
        if (await cond()) return true;
    }
    return false;
}

test('full game-setting mode end to end: connect to the specified server and play', async ({ page }) => {
    test.setTimeout(120_000);

    // ── The specified server: the data-declared RELATIVE baseurl ('/api/mahjong')
    // is rewritten onto the real services/game process — every call still leaves
    // the engine as a genuine fetch, and the route layer records the hits.
    const serverHits: string[] = [];
    await page.route('**/api/mahjong/**', async (route: Route, request: Request) => {
        const method = new URL(request.url()).pathname.split('/').pop()!;
        serverHits.push(method);
        const res = await fetch(`${GAME}/api/mahjong/${method}`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: request.postData() ?? '{}',
        });
        await route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
    });

    // Boot the client in server mode (?mjserver → FetchGameApi dials baseurl).
    await page.goto('/?level=demo&mjserver=1');
    await waitForWorldReady(page);
    await page.evaluate(() => (window as any).loader.engine.stop());
    await stepEngine(page, 90);

    // Walk onto the table block (positioning is setup; the SERVER FLOW is the feature).
    await page.evaluate((b) => (window as any).loader.teleportSeptopus(b, [3, 3, 3]), MAHJONG_BLOCK);
    await stepEngine(page, 40);
    const zone = await page.evaluate(() => (window as any).loader.engine.getWorld().gameZoneActive);
    expect(zone, 'player is in the playable zone').toBe(true);

    // ── Enter Game → the engine resolves the Game Setting and connects to the server.
    await page.getByTestId('enter-game').click();
    // Pump on the CLIENT board state: it appears only once start's fetch resolved
    // AND the engine flushed game.started to the client — i.e. the whole handshake.
    const started = await pumpUntil(page, async () =>
        page.evaluate(() => !!(window as any).loader.mahjongState));
    expect(started, 'board arrived after the server start handshake').toBe(true);
    expect(await page.evaluate(() => !!(window as any).loader.engine.getWorld().gameRuntime?.started)).toBe(true);

    // The `start` call was a REAL request to the specified server.
    expect(serverHits).toContain('start');

    // Board overlay is up, fed by the server-dealt hand.
    await expect(page.getByTestId('mahjong-hud')).toBeVisible();
    const session = await page.evaluate(() => {
        const w = (window as any).loader.engine.getWorld();
        return {
            game: w.gameSetting?.game,
            baseurl: w.gameSetting?.baseurl,
            allowsDiscard: !!w.gameRuntime?.allows('discard'),
            allowsHack: !!w.gameRuntime?.allows('hack'),
            hand: (window as any).loader.mahjongState?.hand?.length,
        };
    });
    expect(session).toMatchObject({ game: 'mahjong', baseurl: '/api/mahjong', allowsDiscard: true, allowsHack: false, hand: 14 });

    // Whitelist still gates the NETWORK transport: a non-whitelisted method is
    // refused before any fetch — it never reaches the server.
    const hacked = await page.evaluate(async () => {
        try { await (window as any).loader.engine.getWorld().gameRuntime.call('hack', []); return 'sent'; }
        catch (e) { return 'refused'; }
    });
    expect(hacked).toBe('refused');
    expect(serverHits).not.toContain('hack');

    await page.screenshot({ path: 'test-results/mahjong-server-board.png' });

    // ── Play several moves — each discard is a round-trip to the server.
    for (let move = 0; move < 3; move++) {
        const before = await page.evaluate(() => {
            const s = (window as any).loader.mahjongState;
            return { wall: s.wallRemaining, botDiscards: s.discards[1].length, finished: s.finished };
        });
        if (before.finished) break;
        await page.locator('[data-testid^="mj-tile-"]').first().click();
        const advanced = await pumpUntil(page, async () =>
            page.evaluate((w) => (window as any).loader.mahjongState.wallRemaining < w, before.wall));
        expect(advanced, `move ${move} advanced via the server`).toBe(true);
    }
    const discardHits = serverHits.filter((m) => m === 'discard').length;
    expect(discardHits, 'multiple discards round-tripped to the server').toBeGreaterThanOrEqual(2);

    // ── Leave → exit Game → the engine calls the whitelisted `end` on the server.
    await page.getByTestId('mj-leave').click();
    // Pump on client state again: mahjongState clears only once game.ended (after
    // the server `end` call) flushed to the client.
    const ended = await pumpUntil(page, async () =>
        page.evaluate(() => (window as any).loader.mahjongState === null
            && (window as any).loader.currentMode === 'normal'));
    expect(ended, 'session ended + back to Normal').toBe(true);
    await expect(page.getByTestId('mahjong-hud')).toBeHidden();
    expect(serverHits).toContain('end');

    // The whole lifecycle ran as one flow, all over the server, in order.
    const firstStart = serverHits.indexOf('start');
    const lastEnd = serverHits.lastIndexOf('end');
    expect(firstStart).toBeGreaterThanOrEqual(0);
    expect(lastEnd).toBeGreaterThan(serverHits.indexOf('discard')); // end after the moves
    expect(serverHits.indexOf('discard')).toBeGreaterThan(firstStart); // discards after start
});
