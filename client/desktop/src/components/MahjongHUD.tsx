import { tileLabel, type MahjongState } from '../games/mahjong/MahjongGame';
import type { DesktopLoader } from '../lib/DesktopLoader';

/**
 * MahjongHUD — the in-world mahjong board overlay. It renders the state the engine
 * mirrors out of the external mahjong game and drives moves back through the
 * loader (which routes them via world.gameRuntime.call → the methods whitelist).
 *
 * This is the "rich 3D application inside the world" surface: the 3D scene hosts
 * the table + entry, this overlay is the game's UI, and the game logic lives in
 * the standalone mock. The HUD never imports the engine — only the loader seam.
 */

const SUIT_COLORS: Record<string, string> = { m: '#d33', p: '#28c', s: '#2a2' };

function Tile({ t, onClick, highlight }: { t: number; onClick?: () => void; highlight?: boolean }) {
    const label = tileLabel(t);
    const suit = label.slice(-1);
    return (
        <button
            onClick={onClick}
            disabled={!onClick}
            data-testid={onClick ? `mj-tile-${t}` : undefined}
            style={{
                width: 30, height: 42, margin: 2, borderRadius: 5,
                border: highlight ? '2px solid #ffd54a' : '1px solid #cbb',
                background: '#fffdf5', color: SUIT_COLORS[suit] ?? '#333',
                fontWeight: 700, fontSize: 15, cursor: onClick ? 'pointer' : 'default',
                boxShadow: highlight ? '0 0 8px #ffd54a' : '0 1px 2px rgba(0,0,0,0.3)',
            }}
        >{label}</button>
    );
}

export function MahjongHUD({ state, loader }: { state: MahjongState; loader: DesktopLoader }) {
    const won = state.won;
    const finished = state.finished;
    return (
        <div
            data-testid="mahjong-hud"
            style={{
                position: 'absolute', left: '50%', bottom: 24, transform: 'translateX(-50%)',
                width: 'min(680px, 94vw)', padding: '14px 16px', borderRadius: 12,
                background: 'rgba(18,28,22,0.92)', color: '#eee', zIndex: 50,
                boxShadow: '0 8px 30px rgba(0,0,0,0.5)', fontFamily: 'system-ui, sans-serif',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ fontSize: 14, letterSpacing: 1 }}>🀄 麻将 · Mahjong</strong>
                <span style={{ fontSize: 12, opacity: 0.8 }} data-testid="mj-wall">牌山 Wall: {state.wallRemaining}</span>
            </div>

            {/* Opponents' discard counts — a glimpse of the 3 bots playing. */}
            <div style={{ display: 'flex', gap: 14, fontSize: 11, opacity: 0.7, marginBottom: 6 }}>
                {[1, 2, 3].map((s) => (
                    <span key={s}>Bot {s} 弃 {state.discards[s]?.length ?? 0}</span>
                ))}
            </div>

            {/* Your hand — click a tile to discard it. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                {state.hand.map((t, i) => (
                    <Tile
                        key={`${t}-${i}`}
                        t={t}
                        highlight={state.drawn === t && i === state.hand.lastIndexOf(t)}
                        onClick={finished ? undefined : () => loader.mahjongDiscard(t)}
                    />
                ))}
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {won ? (
                    <span data-testid="mj-win-banner" style={{ color: '#ffd54a', fontWeight: 700 }}>
                        🎉 自摸！You win (tsumo)
                    </span>
                ) : finished ? (
                    <span data-testid="mj-end-banner" style={{ opacity: 0.85 }}>
                        牌局结束 · {state.result?.reason}
                    </span>
                ) : state.canWin ? (
                    <button
                        data-testid="mj-win"
                        onClick={() => loader.mahjongWin()}
                        style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#ffd54a', color: '#222', fontWeight: 700, cursor: 'pointer' }}
                    >自摸 Win</button>
                ) : (
                    <span style={{ fontSize: 12, opacity: 0.7 }}>点一张牌打出 · click a tile to discard</span>
                )}
                <span style={{ flex: 1 }} />
                <button
                    data-testid="mj-leave"
                    onClick={() => loader.mahjongLeave()}
                    style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #777', background: 'transparent', color: '#ddd', cursor: 'pointer' }}
                >离桌 Leave</button>
            </div>
        </div>
    );
}
