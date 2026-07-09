import { describe, it, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ReconnectingSocket } from '../../../client/core/src/net/ReconnectingSocket';
import { WebSocketLiveSource } from '../../../client/core/src/lib/live/WebSocketLiveSource';

// REAL-socket lifecycle integration — no mocks anywhere: a real services/mahjong
// process (HTTP + ws/live on one port), a real Node WebSocket under
// ReconnectingSocket, and a REAL process kill in the middle. Proves the whole
// transport split end to end: subscribe → HTTP move → push frame arrives →
// server DIES → truthful 'closed' → server returns → auto-reconnect +
// auto-resubscribe → push flows again.

const PORT = 17877; // off the dev range — never collides with a running dashboard
const BASE = `http://127.0.0.1:${PORT}`;
const SRV_DIR = join(__dirname, '../../../services/mahjong');
const HAVE_DEPS = existsSync(join(SRV_DIR, 'node_modules', '.bin', 'tsx'));

function launch(): ChildProcess {
    return spawn('npm', ['start'], {
        cwd: SRV_DIR, stdio: 'ignore', detached: true,
        env: { ...process.env, PORT: String(PORT) },
    });
}
function killGroup(p: ChildProcess): void {
    try { if (p.pid) process.kill(-p.pid, 'SIGKILL'); } catch { p.kill('SIGKILL'); }
}
async function waitFor(cond: () => boolean | Promise<boolean>, ms: number, what: string): Promise<void> {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        if (await cond()) return;
        await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`timeout waiting for ${what}`);
}
const healthUp = async () => {
    try { return (await fetch(`${BASE}/v0/health`)).ok; } catch { return false; }
};

describe.skipIf(!HAVE_DEPS)('real-socket lifecycle: push channel survives a server death', () => {
    it('subscribe → push on HTTP moves → SIGKILL → reconnect → resubscribed push', async () => {
        let srv = launch();
        const sock = new ReconnectingSocket(`ws://127.0.0.1:${PORT}/live`, { maxBackoffMs: 1000 });
        const live = new WebSocketLiveSource(sock);
        live.subscribe('game');
        try {
            await waitFor(healthUp, 15_000, 'server up');
            await waitFor(() => live.status === 'open', 10_000, 'ws open');

            // HTTP (pull) causes a WS (push) frame — the two channels of one server.
            const start = await (await fetch(`${BASE}/api/mahjong/start`, {
                method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"params":[]}',
            })).json();
            expect(start.gameId).toMatch(/mahjong/);
            const drained: any[] = [];
            await waitFor(() => { drained.push(...live.poll()); return drained.some((m) => m.data?.event === 'started'); },
                5_000, 'started push frame');
            expect(drained.find((m) => m.data?.event === 'started')).toMatchObject({
                topic: 'game', data: { game: 'mahjong', gameId: start.gameId },
            });

            // ── THE EXTREME: the server process dies mid-session ──────────────
            killGroup(srv);
            await waitFor(() => live.status === 'closed', 10_000, 'truthful closed status');

            // The operator brings it back — the client heals itself: reconnect
            // (backoff) + automatic re-subscribe, no consumer code involved.
            srv = launch();
            await waitFor(healthUp, 15_000, 'server back up');
            await waitFor(() => live.status === 'open', 15_000, 'ws auto-reconnected');

            await fetch(`${BASE}/api/mahjong/start`, {
                method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"params":[]}',
            });
            const drained2: any[] = [];
            await waitFor(() => { drained2.push(...live.poll()); return drained2.some((m) => m.data?.event === 'started'); },
                5_000, 'push after reconnect (auto-resubscribed)');
        } finally {
            live.dispose();
            killGroup(srv);
        }
    }, 60_000);
});
