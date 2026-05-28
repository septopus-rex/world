import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { BlockInfo } from '../hooks/useBlockInfo';
// @ts-ignore
import SeptopusContract from '../lib/contract';

const LAMPORTS = 1_000_000_000;

const STATUS_LABEL: Record<number, { text: string; color: string }> = {
    0: { text: 'Public',   color: 'text-cyan-400'   },
    1: { text: 'Private',  color: 'text-gray-400'   },
    2: { text: 'Selling',  color: 'text-green-400'  },
    3: { text: 'Banned',   color: 'text-red-400'    },
    4: { text: 'Locked',   color: 'text-orange-400' },
};

const shortKey = (k?: string) =>
    k && k.length > 12 ? `${k.slice(0, 4)}…${k.slice(-4)}` : (k ?? '—');

interface Props {
    info: BlockInfo;
    loading: boolean;
    onClose: () => void;
    onRefresh: () => void;
}

export function BlockInfoPanel({ info, loading, onClose, onRefresh }: Props) {
    const { publicKey, connected } = useWallet();
    const [pending, setPending]   = useState<string | null>(null);
    const [priceInput, setPriceInput] = useState('');
    const [showSellInput, setShowSellInput] = useState(false);
    const [txError, setTxError]   = useState<string | null>(null);

    const myKey    = publicKey?.toString();
    const isOwner  = info.minted && myKey === info.owner;
    const isSelling = info.status === 2;
    const status   = STATUS_LABEL[info.status ?? 0] ?? STATUS_LABEL[0];

    const call = async (label: string, act: string, param: any[]) => {
        setTxError(null);
        setPending(label);
        await SeptopusContract.call(act, (result: any) => {
            setPending(null);
            if (result?.error) { setTxError(result.error); return; }
            onRefresh();
        }, param);
    };

    const handleMint = () =>
        call('Minting…', 'mint_block', [info.x, info.y, info.world]);

    const handleSell = () => {
        const sol = parseFloat(priceInput);
        if (isNaN(sol) || sol <= 0) { setTxError('Enter a valid price in SOL'); return; }
        call('Listing…', 'sell_block', [info.x, info.y, info.world, Math.round(sol * LAMPORTS)]);
        setShowSellInput(false);
        setPriceInput('');
    };

    const handleWithdraw = () =>
        call('Withdrawing…', 'withdraw_block', [info.x, info.y, info.world]);

    const handleBuy = () => {
        if (!info.owner) return;
        call('Buying…', 'buy_block', [info.x, info.y, info.world, info.price, info.owner]);
    };

    return (
        <div className="w-72 bg-black/85 backdrop-blur-md border border-cyan-500/30 rounded-xl shadow-2xl text-white font-mono text-xs">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <span className="text-cyan-300 font-black tracking-widest uppercase text-[11px]">
                    Block [{info.x}, {info.y}]
                </span>
                <button
                    onClick={onClose}
                    className="text-gray-500 hover:text-white transition-colors text-base leading-none"
                >✕</button>
            </div>

            {/* Body */}
            <div className="px-4 py-3 space-y-2">
                {loading ? (
                    <p className="text-gray-400 animate-pulse text-center py-2">Loading…</p>
                ) : !info.minted ? (
                    <p className="text-gray-400">Not minted — available to claim.</p>
                ) : (
                    <>
                        <Row label="Status">
                            <span className={`font-bold ${status.color}`}>● {status.text}</span>
                        </Row>
                        <Row label="Owner">
                            <span className="text-white" title={info.owner}>{shortKey(info.owner)}</span>
                            {isOwner && <span className="ml-1 text-yellow-400 text-[9px] font-bold">[YOU]</span>}
                        </Row>
                        {isSelling && (
                            <Row label="Price">
                                <span className="text-green-300 font-bold">
                                    {((info.price ?? 0) / LAMPORTS).toFixed(4)} SOL
                                </span>
                            </Row>
                        )}
                    </>
                )}

                {txError && (
                    <p className="text-red-400 text-[10px] break-words border border-red-500/30 rounded px-2 py-1 bg-red-500/10">
                        {txError}
                    </p>
                )}
            </div>

            {/* Actions */}
            {connected && !loading && (
                <div className="px-4 pb-4 space-y-2">
                    <div className="border-t border-white/10 mb-2" />

                    {!info.minted && (
                        <ActionButton onClick={handleMint} pending={pending} label="Mint Block" pendingLabel="Minting…" color="cyan" />
                    )}

                    {isOwner && !isSelling && (
                        <>
                            {showSellInput ? (
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="SOL"
                                        value={priceInput}
                                        onChange={e => setPriceInput(e.target.value)}
                                        className="flex-1 bg-white/5 border border-white/20 rounded px-2 py-1 text-white text-xs outline-none focus:border-green-400/60"
                                    />
                                    <button
                                        onClick={handleSell}
                                        disabled={!!pending}
                                        className="px-2 py-1 bg-green-500/20 border border-green-400/40 rounded text-green-300 hover:bg-green-500/30 disabled:opacity-40 transition-all"
                                    >
                                        {pending === 'Listing…' ? '…' : 'OK'}
                                    </button>
                                    <button
                                        onClick={() => { setShowSellInput(false); setPriceInput(''); setTxError(null); }}
                                        className="px-2 py-1 text-gray-400 hover:text-white"
                                    >✕</button>
                                </div>
                            ) : (
                                <ActionButton onClick={() => setShowSellInput(true)} pending={pending} label="List for Sale" pendingLabel="" color="green" />
                            )}
                        </>
                    )}

                    {isOwner && isSelling && (
                        <ActionButton onClick={handleWithdraw} pending={pending} label="Delist" pendingLabel="Withdrawing…" color="yellow" />
                    )}

                    {!isOwner && isSelling && info.minted && (
                        <ActionButton onClick={handleBuy} pending={pending} label={`Buy — ${((info.price ?? 0) / LAMPORTS).toFixed(4)} SOL`} pendingLabel="Buying…" color="green" />
                    )}
                </div>
            )}
        </div>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex justify-between items-center">
            <span className="text-gray-500 uppercase tracking-wider text-[9px]">{label}</span>
            <span className="flex items-center gap-1">{children}</span>
        </div>
    );
}

const COLOR_MAP: Record<string, string> = {
    cyan:   'bg-cyan-500/10 border-cyan-400/30 text-cyan-300 hover:bg-cyan-500/20',
    green:  'bg-green-500/10 border-green-400/30 text-green-300 hover:bg-green-500/20',
    yellow: 'bg-yellow-500/10 border-yellow-400/30 text-yellow-300 hover:bg-yellow-500/20',
};

function ActionButton({ onClick, pending, label, pendingLabel, color }: {
    onClick: () => void; pending: string | null;
    label: string; pendingLabel: string; color: string;
}) {
    const active = pending === pendingLabel;
    return (
        <button
            onClick={onClick}
            disabled={!!pending}
            className={`w-full py-2 border rounded-lg font-black tracking-widest uppercase text-[10px] transition-all disabled:opacity-40 ${COLOR_MAP[color]}`}
        >
            {active ? pendingLabel : label}
        </button>
    );
}
