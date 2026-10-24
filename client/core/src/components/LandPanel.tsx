import { useEffect, useState } from 'react';
import type { DesktopLoader, LandUiSnapshot } from '../lib/DesktopLoader';

function shortAddr(a: string | null): string {
    return a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '—';
}

function fmtAmount(base: number, decimals: number): string {
    const v = base / 10 ** decimals;
    return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * LandPanel — the hybrid-chain UI for block ownership + marketplace + on-chain
 * content publishing (protocol/cn|en/land.md). Renders NOTHING when the land
 * registry is inactive (pure build or offline validator), so the standalone
 * client chrome is unchanged.
 */
export function LandPanel({ loader, ready }: { loader: DesktopLoader | null; ready: boolean }) {
    const [open, setOpen] = useState(false);
    const [snap, setSnap] = useState<LandUiSnapshot | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [askSol, setAskSol] = useState('0.5');
    const [lastTx, setLastTx] = useState<string | null>(null);

    useEffect(() => {
        if (!loader || !ready) return;
        const sync = () => setSnap(loader.landSnapshot());
        sync();
        const off = loader.onLandChange(sync);
        const timer = setInterval(sync, 400);
        return () => { off(); clearInterval(timer); };
    }, [loader, ready]);

    if (!ready || !loader || !snap?.enabled || !snap.block) return null;

    const b = snap.block;
    const isOwner = !!snap.wallet && b.owner === snap.wallet;
    const scale = 10 ** snap.decimals;

    const run = async (label: string, fn: () => Promise<unknown>) => {
        setBusy(label);
        setError(null);
        try {
            const res = await fn();
            if (typeof res === 'string') setLastTx(res);
            else if (res && typeof (res as any).signature === 'string') setLastTx((res as any).signature);
            setSnap(loader.landSnapshot());
        } catch (e: any) {
            setError(String(e?.message ?? e));
        } finally {
            setBusy(null);
        }
    };

    const statusBadge = b.status === 'unminted'
        ? { text: '未认领 UNMINTED', cls: 'bg-slate-500/25 border-slate-400/40 text-slate-200' }
        : b.status === 'listed'
            ? { text: `在售 ${fmtAmount(b.price, snap.decimals)} ${snap.unit}`, cls: 'bg-amber-500/25 border-amber-400/50 text-amber-200' }
            : b.status === 'banned'
                ? { text: '已封禁 BANNED', cls: 'bg-rose-500/25 border-rose-400/50 text-rose-200' }
                : isOwner
                    ? { text: '我的地块 OWNED', cls: 'bg-emerald-500/25 border-emerald-400/50 text-emerald-200' }
                    : { text: `已认领 · ${shortAddr(b.owner)}`, cls: 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200' };

    return (
        <div className="absolute top-12 left-4 z-30 pointer-events-auto select-none font-mono text-xs">
            <button
                data-testid="land-toggle"
                onClick={() => { setOpen((v) => !v); void loader.landRefresh(); }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/65 hover:bg-black/80 border border-cyan-400/35 backdrop-blur-md shadow-lg transition"
            >
                <span className="text-cyan-300 font-bold">⛓</span>
                <span data-testid="land-coord" className="text-white/90 font-bold">[{b.x}, {b.y}]</span>
                <span data-testid="land-status-pill" className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusBadge.cls}`}>
                    {statusBadge.text}
                </span>
                {snap.wallet && (
                    <span data-testid="land-wallet-pill" className="text-[10px] text-cyan-300/80">
                        {shortAddr(snap.wallet)}
                    </span>
                )}
            </button>

            {open && (
                <div
                    data-testid="land-panel"
                    className="mt-2 w-80 p-3.5 rounded-2xl bg-black/80 border border-cyan-400/30 backdrop-blur-xl shadow-2xl space-y-2.5 text-[11px]"
                >
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <div>
                            <div className="text-[10px] uppercase tracking-widest text-cyan-300/70">
                                BTC 锚 · {snap.chain?.toUpperCase()} ({snap.cluster})
                            </div>
                            <div className="text-white font-bold">
                                地块 [{b.x}, {b.y}] · 世界 {snap.world}
                            </div>
                        </div>
                        <button
                            data-testid="land-refresh"
                            onClick={() => void run('refresh', () => loader.landRefresh())}
                            className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15 border border-white/15 text-white/70"
                            title="刷新链上状态"
                        >↻</button>
                    </div>

                    {/* Wallet row */}
                    <div className="flex items-center justify-between bg-white/5 rounded-xl px-2.5 py-2 border border-white/10">
                        {snap.wallet ? (
                            <>
                                <div>
                                    <div className="text-[10px] text-white/50">
                                        钱包 ({snap.walletKind === 'injected' ? '浏览器' : '本地测试'})
                                    </div>
                                    <div data-testid="land-wallet" className="text-cyan-200 font-bold" title={snap.wallet}>
                                        {shortAddr(snap.wallet)} · {fmtAmount(snap.balance, snap.decimals)} {snap.unit}
                                    </div>
                                </div>
                                <button
                                    data-testid="land-disconnect"
                                    onClick={() => void run('disconnect', () => loader.landDisconnect())}
                                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-[10px]"
                                >断开</button>
                            </>
                        ) : (
                            <>
                                <span className="text-white/60">未连接钱包</span>
                                <button
                                    data-testid="land-connect"
                                    disabled={!!busy}
                                    onClick={() => void run('connect', () => loader.landConnect())}
                                    className="px-3 py-1 rounded-lg bg-cyan-500/25 hover:bg-cyan-500/40 border border-cyan-300/50 text-cyan-100 font-bold"
                                >连接钱包</button>
                            </>
                        )}
                    </div>

                    {/* Block details */}
                    <div className="space-y-1 text-white/75">
                        <div className="flex justify-between">
                            <span className="text-white/45">状态</span>
                            <span data-testid="land-status" className="font-bold text-white">{b.status}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-white/45">所有者</span>
                            <span data-testid="land-owner" title={b.owner ?? ''}>
                                {b.owner ? (isOwner ? `${shortAddr(b.owner)} (你)` : shortAddr(b.owner)) : '—'}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-white/45">链上内容 CID</span>
                            <span data-testid="land-cid" className="text-cyan-300" title={b.cid ?? ''}>
                                {b.cid ? `${b.cid.slice(0, 10)}… (v${b.revision})` : '未发布'}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-white/45">本地草稿</span>
                            <span data-testid="land-draft" className={snap.hasDraft ? 'text-amber-300 font-bold' : 'text-white/50'}>
                                {snap.hasDraft ? '● 有未上链修改' : '无'}
                            </span>
                        </div>
                    </div>

                    {/* Actions by state */}
                    {snap.wallet && b.status === 'unminted' && (
                        <button
                            data-testid="land-mint"
                            disabled={!!busy}
                            onClick={() => void run('mint', () => loader.landMint())}
                            className="w-full py-2 rounded-xl bg-emerald-500/25 hover:bg-emerald-500/40 border border-emerald-400/60 text-emerald-100 font-bold"
                        >
                            ⛏ 认领铸造地块 ({fmtAmount(snap.mintPrice, snap.decimals)} {snap.unit})
                        </button>
                    )}

                    {isOwner && b.status === 'owned' && (
                        <div className="space-y-2 pt-1 border-t border-white/10">
                            <button
                                data-testid="land-publish"
                                disabled={!!busy}
                                onClick={() => void run('publish', () => loader.landPublish())}
                                className="w-full py-2 rounded-xl bg-cyan-500/25 hover:bg-cyan-500/40 border border-cyan-300/60 text-cyan-100 font-bold"
                            >
                                ⬆ 发布当前地块内容上链 (IPFS → Solana)
                            </button>
                            <div className="flex items-center gap-1.5">
                                <input
                                    data-testid="land-list-price"
                                    value={askSol}
                                    onChange={(e) => setAskSol(e.target.value)}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    placeholder="SOL"
                                    className="w-24 px-2 py-1.5 rounded-lg bg-black/50 border border-white/20 text-amber-200 outline-none focus:border-amber-400"
                                />
                                <button
                                    data-testid="land-list"
                                    disabled={!!busy}
                                    onClick={() => {
                                        const n = Number(askSol);
                                        if (!Number.isFinite(n) || n <= 0) { setError('价格必须 > 0'); return; }
                                        void run('list', () => loader.landList(Math.round(n * scale)));
                                    }}
                                    className="flex-1 py-1.5 rounded-lg bg-amber-500/25 hover:bg-amber-500/40 border border-amber-400/50 text-amber-100 font-bold"
                                >
                                    🏷 挂单出售 ({snap.unit})
                                </button>
                            </div>
                        </div>
                    )}

                    {isOwner && b.status === 'listed' && (
                        <button
                            data-testid="land-delist"
                            disabled={!!busy}
                            onClick={() => void run('delist', () => loader.landDelist())}
                            className="w-full py-2 rounded-xl bg-amber-500/25 hover:bg-amber-500/40 border border-amber-400/60 text-amber-100 font-bold"
                        >
                            ↩ 撤回挂单 ({fmtAmount(b.price, snap.decimals)} {snap.unit})
                        </button>
                    )}

                    {snap.wallet && !isOwner && b.status === 'listed' && (
                        <button
                            data-testid="land-buy"
                            disabled={!!busy}
                            onClick={() => void run('buy', () => loader.landBuy())}
                            className="w-full py-2 rounded-xl bg-emerald-500/30 hover:bg-emerald-500/45 border border-emerald-300/60 text-emerald-100 font-bold"
                        >
                            💎 立即购买 ({fmtAmount(b.price, snap.decimals)} {snap.unit})
                        </button>
                    )}

                    {busy && (
                        <div data-testid="land-busy" className="text-cyan-300 text-[10px]">⏳ 链上交易处理中 ({busy})…</div>
                    )}
                    {error && (
                        <div data-testid="land-error" className="text-rose-300 text-[10px] break-words">⚠ {error}</div>
                    )}
                    {lastTx && !error && (
                        <div data-testid="land-tx" className="text-emerald-300/80 text-[10px] truncate" title={lastTx}>
                            ✓ tx {lastTx.slice(0, 16)}…
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
