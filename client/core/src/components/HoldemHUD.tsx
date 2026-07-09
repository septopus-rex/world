/**
 * HoldemHUD — the host-UI half of the Texas Hold'em table (Pattern A, game id
 * 44). A pure view mirror of the generic game state (loader.gameAction routes
 * every button through GameRuntime's methods whitelist → the game transport,
 * loopback or services/holdem). Same conventions as MahjongHUD/PoolHUD.
 */

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const rankLabel = (r: number) => RANKS[r] ?? String(r);
const cardLabel = (c: number) => `${rankLabel(2 + (c >> 2))}${SUITS[c & 3]}`;
const isRed = (c: number) => (c & 3) === 1 || (c & 3) === 2;

function Card({ c, hidden }: { c?: number; hidden?: boolean }) {
    return (
        <span style={{
            display: 'inline-block', minWidth: 34, textAlign: 'center', margin: 2, padding: '6px 4px',
            borderRadius: 6, background: hidden ? '#334' : '#f8f8f2', border: '1px solid #222',
            color: hidden ? '#667' : (c !== undefined && isRed(c) ? '#c0392b' : '#111'),
            fontWeight: 700, fontSize: 15,
        }}>{hidden || c === undefined ? '🂠' : cardLabel(c)}</span>
    );
}

export function HoldemHUD({ state, loader }: { state: any; loader: any }) {
    if (!state) return null;
    const { phase, hole = [], community = [], pot, chips, canAct, finished, won, result } = state;
    const act = (a: string) => loader.gameAction('act', [a]);

    return (
        <div data-testid="holdem-hud" style={{
            position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)',
            background: 'rgba(12, 40, 24, 0.92)', border: '1px solid #2e7d4f', borderRadius: 12,
            padding: '10px 14px', color: '#dfe', font: '13px/1.5 ui-monospace, monospace', zIndex: 30,
            textAlign: 'center', minWidth: 340,
        }}>
            <div style={{ marginBottom: 4 }}>
                <b>德州扑克</b>
                <span style={{ margin: '0 8px', color: '#8fc' }} data-testid="hd-phase">{phase}</span>
                彩池 <b data-testid="hd-pot">{pot}</b> · 筹码 <b data-testid="hd-chips">{chips}</b>
            </div>
            <div data-testid="hd-community" style={{ minHeight: 40 }}>
                {[0, 1, 2, 3, 4].map((i) => <Card key={i} c={community[i]} hidden={community[i] === undefined} />)}
            </div>
            <div style={{ margin: '2px 0 6px' }}>
                <span style={{ color: '#8fc', marginRight: 6 }}>手牌</span>
                {hole.map((c: number, i: number) => <Card key={i} c={c} />)}
            </div>
            {canAct && !finished && (
                <div>
                    <button data-testid="hd-act-check" onClick={() => act('check')} style={btn('#2e7d4f')}>过牌</button>
                    <button data-testid="hd-act-bet" onClick={() => act('bet')} style={btn('#b8860b')}>下注 10</button>
                    <button data-testid="hd-act-fold" onClick={() => act('fold')} style={btn('#8b3a3a')}>弃牌</button>
                </div>
            )}
            {finished && (
                <div data-testid="hd-result" style={{ color: won ? '#7f7' : '#faa' }}>
                    {result?.reason === 'fold' ? '已弃牌' : (won ? `你赢了 ${result?.pot}!` : '对手获胜')}
                    {result?.hands && ` · ${result.hands.map((h: any) => `座${h.seat}:${h.name}`).join(' ')}`}
                    <button data-testid="hd-leave" onClick={() => loader.leaveGame()} style={{ ...btn('#555'), marginLeft: 8 }}>离桌</button>
                </div>
            )}
        </div>
    );
}

const btn = (bg: string): React.CSSProperties => ({
    margin: '0 4px', padding: '4px 14px', borderRadius: 6, border: 'none',
    background: bg, color: '#fff', fontWeight: 700, cursor: 'pointer',
});
