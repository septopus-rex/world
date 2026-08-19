import { useEffect, useRef, useState } from 'react';
import { kindName, handProgress, tally } from '@engine/core/mahjong';
import type { DesktopLoader } from '../lib/DesktopLoader';

/**
 * MahjongTableHUD — the overlay for the NATIVE 3D table (MahjongSystem).
 *
 * Distinct from `MahjongHUD`, which drives the external mahjong app through the
 * whitelisted-method transport: the tiles here are real 3D entities on the felt,
 * so this overlay does NOT redraw the board. It supplies only what the 3D scene
 * cannot say by itself —
 *   · the calls you may make right now (碰/杠/吃/胡), which exist for a few
 *     seconds and would otherwise be invisible; a call you cannot see is a rule
 *     that does not exist for the player,
 *   · how close your hand is (聽牌 / N 向聽), which no arrangement of tiles shows,
 *   · the settlement — which 番 scored and what it paid.
 *
 * State is POLLED (setInterval, not rAF): the engine is the owner and publishes
 * no per-change event, and under e2e the engine is stopped so rAF never fires —
 * the same reason ParkourHUD polls.
 */

type Offer = { seat: number; action: string; kinds?: number[] };

const ACTION_LABEL: Record<string, string> = {
    pon: '碰', kan: '杠', ankan: '暗杠', chi: '吃', ron: '胡', tsumo: '自摸',
};

/** A small tile chip — used for melds and the settlement hand, not the live rack
 *  (that one is on the felt in 3D). */
function Chip({ kind, dim }: { kind: number; dim?: boolean }) {
    const honor = kind >= 27;
    const suit = kind < 9 ? '#b3271e' : kind < 18 ? '#1e5aa8' : kind < 27 ? '#17703a' : '#333';
    return (
        <span style={{
            display: 'inline-block', minWidth: 22, padding: '2px 4px', margin: '0 2px 2px 0',
            borderRadius: 4, background: dim ? '#cfc9b6' : '#f7f2e2', color: honor ? '#333' : suit,
            fontSize: 12, fontWeight: 700, textAlign: 'center', lineHeight: 1.25,
            border: '1px solid rgba(0,0,0,0.25)',
        }}>{kindName(kind)}</span>
    );
}

export function MahjongTableHUD({ loader }: { loader: DesktopLoader }) {
    const [table, setTable] = useState<any>(null);
    const seated = useRef(false);

    useEffect(() => {
        // SHALLOW-COPY the snapshot. `mahjongState()` hands back the live
        // MahjongTableComponent — the same object every tick — and React's
        // `Object.is` check then treats every update as a no-op. Without the copy
        // the HUD renders once (null → table) and never again: the call buttons
        // never appear, the settlement never shows, and nothing looks broken
        // enough to notice. Caught by e2e, not by looking at it.
        const id = setInterval(() => {
            const t = loader.mahjongTableState();
            setTable(t ? { ...t } : null);
        }, 120);
        return () => clearInterval(id);
    }, [loader]);

    // Sitting down: switch to first person while a table is live. In third person
    // the player's own back is directly between the camera and their rack — the
    // one view from which the game is unplayable. Restored on leaving, and only
    // on the transitions, so it never fights a view the player picks mid-hand.
    const live = !!table;
    useEffect(() => {
        if (live && !seated.current) { seated.current = true; loader.setCameraView('first', true); }
        else if (!live && seated.current) { seated.current = false; loader.setCameraView('third', true); }
    }, [live, loader]);

    if (!table) return null;

    const seat = table.humanSeat;
    const hand: number[] = table.hands[seat] ?? [];
    const kinds: number[] = hand.map((t: number) => table.kinds[t]);
    const melds = table.melds[seat] ?? [];
    const offers: Offer[] = table.humanOffers ?? [];
    const myTurn = table.phase === 'turn' && table.turn === seat;
    const result = table.result;

    // "How close am I" — the rule core answers, so the HUD can never disagree
    // with what the engine would accept as a win.
    const progress = handProgress(
        tally(kinds),
        melds.map((m: any) => ({
            type: m.type, kinds: m.tileIds.map((t: number) => table.kinds[t]),
            from: m.from, claimed: table.kinds[m.claimed],
        })),
    );

    const claimPct = table.claimWindow > 0
        ? Math.max(0, Math.min(1, table.claimTimer / table.claimWindow)) : 0;

    return (
        <div
            data-testid="mahjong-table-hud"
            style={{
                position: 'absolute', left: 0, right: 0, bottom: 0, top: 0,
                pointerEvents: 'none', zIndex: 45, fontFamily: 'system-ui, sans-serif',
            }}
        >
            {/* Status strip — wall, winds, progress, scores. */}
            <div
                data-testid="mj3d-status"
                style={{
                    position: 'absolute', top: 68, left: '50%', transform: 'translateX(-50%)',
                    display: 'flex', gap: 16, alignItems: 'center', padding: '6px 14px',
                    borderRadius: 10, background: 'rgba(14,24,18,0.86)', color: '#e8e4d5',
                    fontSize: 12, letterSpacing: 0.5, border: '1px solid rgba(255,255,255,0.12)',
                }}
            >
                <span data-testid="mj3d-wall">牌山 {table.wall.length}</span>
                <span>{kindName(table.roundWind)}圈 · 门风 {kindName(table.seatWinds[seat])}</span>
                <span data-testid="mj3d-progress" style={{ color: progress === '聽牌' ? '#ffd54a' : '#e8e4d5' }}>
                    {progress}
                </span>
                <span style={{ opacity: 0.7 }}>
                    {table.scores.map((s: number, i: number) => (
                        <span key={i} style={{ marginLeft: i ? 8 : 0, color: i === seat ? '#ffd54a' : undefined }}>
                            {i === seat ? '我' : `家${i}`} {s > 0 ? `+${s}` : s}
                        </span>
                    ))}
                </span>
            </div>

            {/* My exposed melds, if any — the 3D table shows them, but not whose. */}
            {melds.length > 0 && (
                <div style={{
                    position: 'absolute', left: 18, bottom: 96, padding: '6px 10px', borderRadius: 8,
                    background: 'rgba(14,24,18,0.8)', color: '#ddd', fontSize: 11,
                }}>
                    <div style={{ opacity: 0.65, marginBottom: 3 }}>我的副露</div>
                    {melds.map((m: any, i: number) => (
                        <div key={i} data-testid={`mj3d-meld-${i}`}>
                            {m.tileIds.map((t: number, j: number) => <Chip key={j} kind={table.kinds[t]} />)}
                            <span style={{ opacity: 0.6, marginLeft: 4 }}>{ACTION_LABEL[m.type] ?? m.type}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Calls on offer. This is the part the 3D scene cannot express. */}
            {offers.length > 0 && !result && (
                <div
                    data-testid="mj3d-offers"
                    style={{
                        position: 'absolute', left: '50%', bottom: 108, transform: 'translateX(-50%)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                        pointerEvents: 'auto',
                    }}
                >
                    {table.phase === 'claim' && (
                        <div style={{ width: 220, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }}>
                            <div style={{
                                width: `${claimPct * 100}%`, height: '100%', borderRadius: 2,
                                background: '#ffd54a', transition: 'width 120ms linear',
                            }} />
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                        {offers.map((o, i) => (
                            <button
                                key={`${o.action}-${i}`}
                                data-testid={`mj3d-claim-${o.action}`}
                                onClick={() => loader.mahjongTableClaim(o.action, o.kinds)}
                                style={{
                                    padding: '8px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
                                    background: o.action === 'ron' || o.action === 'tsumo' ? '#ffd54a' : '#f2ede0',
                                    color: '#241f16', fontWeight: 800, fontSize: 15, letterSpacing: 1,
                                    boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
                                }}
                            >
                                {ACTION_LABEL[o.action] ?? o.action}
                                {o.action === 'chi' && o.kinds
                                    ? <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 4 }}>
                                        {o.kinds.map((k) => kindName(k)).join('')}
                                    </span>
                                    : null}
                            </button>
                        ))}
                        {table.phase === 'claim' && (
                            <button
                                data-testid="mj3d-pass"
                                onClick={() => loader.mahjongTablePass()}
                                style={{
                                    padding: '8px 18px', borderRadius: 10, cursor: 'pointer',
                                    border: '1px solid rgba(255,255,255,0.35)', background: 'transparent',
                                    color: '#ddd', fontWeight: 700, fontSize: 14, letterSpacing: 1,
                                }}
                            >过</button>
                        )}
                    </div>
                </div>
            )}

            {/* Turn hint — the tiles are clickable in 3D, which is not discoverable. */}
            {myTurn && offers.length === 0 && !result && (
                <div
                    data-testid="mj3d-turn"
                    style={{
                        position: 'absolute', left: '50%', bottom: 108, transform: 'translateX(-50%)',
                        padding: '6px 14px', borderRadius: 8, background: 'rgba(14,24,18,0.8)',
                        color: '#ffd54a', fontSize: 12, letterSpacing: 1,
                    }}
                >该你出牌 · 点桌上的牌打出</div>
            )}

            {/* Settlement. */}
            {result && (
                <div
                    data-testid="mj3d-result"
                    style={{
                        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                        width: 'min(460px, 92vw)', padding: '20px 22px', borderRadius: 14,
                        background: 'rgba(16,26,20,0.95)', color: '#eee', pointerEvents: 'auto',
                        border: '1px solid rgba(255,213,74,0.35)', boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
                    }}
                >
                    <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2, marginBottom: 10, color: '#ffd54a' }}>
                        {result.kind === 'draw' ? '流局'
                            : `${result.winner === seat ? '你' : `家${result.winner}`}${result.kind === 'tsumo' ? '自摸' : '和牌'}`}
                    </div>

                    {result.kind !== 'draw' && (
                        <>
                            <div style={{ marginBottom: 10 }}>
                                {result.hand.map((k: number, i: number) => <Chip key={i} kind={k} dim={k !== result.winTile} />)}
                            </div>
                            <div data-testid="mj3d-fan" style={{ fontSize: 12, lineHeight: 1.8, marginBottom: 10 }}>
                                {result.fan.map((f: any, i: number) => (
                                    <span key={i} style={{ marginRight: 12 }}>
                                        {f.name} <b style={{ color: '#ffd54a' }}>{f.points}</b>
                                    </span>
                                ))}
                                <div style={{ marginTop: 6, fontSize: 13 }}>
                                    共 <b style={{ color: '#ffd54a', fontSize: 16 }}>{result.total}</b> 番
                                </div>
                            </div>
                        </>
                    )}

                    <div style={{ display: 'flex', gap: 12, fontSize: 12, opacity: 0.85, marginBottom: 14 }}>
                        {result.delta.map((d: number, i: number) => (
                            <span key={i} style={{ color: d > 0 ? '#8fe08f' : d < 0 ? '#e08f8f' : '#999' }}>
                                {i === seat ? '我' : `家${i}`} {d > 0 ? `+${d}` : d}
                            </span>
                        ))}
                    </div>

                    <button
                        data-testid="mj3d-leave"
                        onClick={() => loader.leaveGame()}
                        style={{
                            padding: '8px 18px', borderRadius: 10, border: '1px solid #888',
                            background: 'transparent', color: '#ddd', cursor: 'pointer', fontSize: 13,
                        }}
                    >离桌 · 走出这一局</button>
                </div>
            )}
        </div>
    );
}
