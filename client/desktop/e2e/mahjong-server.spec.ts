import { test, expect, type Route, type Request } from '@playwright/test';
import { waitForWorldReady, stepEngine } from './helpers';
import { MahjongGame } from '../src/games/mahjong/MahjongGame';

// FULL game-setting mode against a SPECIFIED SERVER, as ONE continuous run — not
// segment-by-segment. The mahjong table sits in the world; entering its zone makes
// the engine resolve the Game Setting and connect to the server declared by its
// `baseurl` (game.md §2/§3): start handshake → several moves → end, every call a
// REAL fetch leaving the engine. The server here is route-intercepted and runs the
// mahjong logic server-side (state held by gameId), so the client genuinely talks
// to a server over HTTP — the in-page mock is not involved (the client uses
// FetchGameApi via `?mjserver`).

const MAHJONG_BLOCK: [number, number] = [2049, 2048];
const SERVER_SEED = 12345; // deterministic deal on the "server"

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

    // ── The specified server: route-intercepted, runs the mahjong game server-side.
    const games = new Map<string, MahjongGame>();
    const serverHits: string[] = [];
    await page.route('**/api/mahjong/**', async (route: Route, request: Request) => {
        const method = new URL(request.url()).pathname.split('/').pop()!;
        const body = (request.postDataJSON() ?? {}) as { gameId?: string; params?: any[] };
        serverHits.push(method);
        const json = (obj: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj) });
        try {
            if (method === 'start') {
                const g = new MahjongGame(SERVER_SEED);
                games.set(g.gameId, g);
                return json({ gameId: g.gameId, state: g.start() });
            }
            const g = games.get(body.gameId ?? '');
            if (!g) return route.fulfill({ status: 404, body: 'no such game' });
            if (method === 'state') return json({ state: g.state() });
            if (method === 'discard') return json({ state: g.discard(Number(body.params?.[0])) });
            if (method === 'win') return json({ state: g.win() });
            if (method === 'end') { const result = g.end(); games.delete(g.gameId); return json({ state: g.state(), result }); }
            return route.fulfill({ status: 400, body: 'bad method' });
        } catch (e) {
            return route.fulfill({ status: 500, body: String(e) });
        }
    });

    // Boot the client in server mode (?mjserver → FetchGameApi dials baseurl).
    await page.goto('/?mjserver=1');
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
