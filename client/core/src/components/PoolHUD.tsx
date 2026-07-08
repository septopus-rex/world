import { useState } from 'react';
import type { PoolState } from '../games/pool/PoolGame';
import type { DesktopLoader } from '../lib/DesktopLoader';

/**
 * PoolHUD — the in-world pool overlay (the second game). Top-view of the table fed
 * by the server/mock-held state; aim (angle) + power, then Shoot. Moves go through
 * loader.gameAction('shoot', …) → the engine's whitelist → the pool transport. The
 * HUD never imports the engine — only the loader seam, same as MahjongHUD.
 */
const VIEW_W = 420, VIEW_H = 210, PAD = 12;

export function PoolHUD({ state, loader }: { state: PoolState; loader: DesktopLoader }) {
    const [angle, setAngle] = useState(0);     // degrees
    const [power, setPower] = useState(60);     // 0..100
    const { w, h, ballR, pocketR } = state.table;
    const sx = (VIEW_W - PAD * 2) / w, sy = (VIEW_H - PAD * 2) / h;
    const px = (x: number) => PAD + x * sx;
    const py = (y: number) => PAD + y * sy;
    const cue = state.balls[0];
    const finished = state.finished;

    // Aim line from the cue ball in the chosen direction.
    const a = (angle * Math.PI) / 180;
    const aimLen = 60;

    return (
        <div
            data-testid="pool-hud"
            style={{
                position: 'absolute', left: '50%', bottom: 24, transform: 'translateX(-50%)',
                padding: '14px 16px', borderRadius: 12, background: 'rgba(16,28,20,0.93)', color: '#eee',
                zIndex: 50, boxShadow: '0 8px 30px rgba(0,0,0,0.5)', fontFamily: 'system-ui, sans-serif',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ fontSize: 14, letterSpacing: 1 }}>🎱 桌球 · Pool</strong>
                <span style={{ fontSize: 12, opacity: 0.8 }}>
                    <span data-testid="pool-potted">入袋 Potted: {state.pottedCount}</span>
                    {'  ·  '}<span data-testid="pool-shots">杆数 Shots: {state.shots}</span>
                </span>
            </div>

            {/* Top-view table. */}
            <svg width={VIEW_W} height={VIEW_H} style={{ background: '#15602f', borderRadius: 8, border: '3px solid #6b3', display: 'block' }}>
                {state.pockets.map(([qx, qy], i) => (
                    <circle key={`p${i}`} cx={px(qx)} cy={py(qy)} r={pocketR * Math.min(sx, sy)} fill="#0a0a0a" />
                ))}
                {state.balls.filter(b => !b.potted).map(b => (
                    <circle
                        key={b.id} cx={px(b.x)} cy={py(b.y)} r={Math.max(3, ballR * Math.min(sx, sy))}
                        fill={b.id === 0 ? '#fafafa' : '#e8c33a'} stroke="#333" strokeWidth={0.5}
                    />
                ))}
                {!finished && !cue.potted && (
                    <line
                        x1={px(cue.x)} y1={py(cue.y)}
                        x2={px(cue.x) + Math.cos(a) * aimLen} y2={py(cue.y) + Math.sin(a) * aimLen}
                        stroke="#fff" strokeWidth={1.5} strokeDasharray="4 3"
                    />
                )}
            </svg>

            {finished ? (
                <div data-testid="pool-end-banner" style={{ marginTop: 8, color: '#ffd54a', fontWeight: 700 }}>
                    🎉 清台！Cleared in {state.result?.shots} shots
                </div>
            ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, fontSize: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        角度 {angle}°
                        <input data-testid="pool-angle" type="range" min={0} max={359} value={angle}
                            onChange={e => setAngle(Number(e.target.value))} />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        力度 {power}
                        <input data-testid="pool-power" type="range" min={5} max={100} value={power}
                            onChange={e => setPower(Number(e.target.value))} />
                    </label>
                    <button
                        data-testid="pool-shoot"
                        onClick={() => loader.gameAction('shoot', [angle, power])}
                        style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#ffd54a', color: '#222', fontWeight: 700, cursor: 'pointer' }}
                    >击球 Shoot</button>
                </div>
            )}

            <div style={{ marginTop: 8, textAlign: 'right' }}>
                <button
                    data-testid="pool-leave"
                    onClick={() => loader.leaveGame()}
                    style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #777', background: 'transparent', color: '#ddd', cursor: 'pointer' }}
                >离桌 Leave</button>
            </div>
        </div>
    );
}
