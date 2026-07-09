import { useEffect, useState } from 'react';
import { BlockPreview } from './BlockPreview';

const TYPE_NAMES: Record<number, string> = {
    0x00a1: 'wall', 0x00a2: 'box', 0x00a3: 'light', 0x00a4: 'module', 0x00a5: 'water',
    0x00a6: 'cone', 0x00a7: 'ball', 0x00b4: 'stop', 0x00b5: 'item', 0x00b6: 'spp',
    0x00b8: 'trigger', 0x00b9: 'spawner', 0x00ba: 'npc', 0x00c1: 'track', 0x00c2: 'motif',
    0x00e1: 'link', 0x00e2: 'audio', 0x00e3: 'video', 0x00e4: 'book', 0x00e5: 'board',
};
const SLOTS = ['elevation 地面高度', 'status 状态', 'adjuncts 附属物', 'animations 动画', 'game 可玩标记'];

/**
 * BlockInspector — a dev/understanding panel for the CURRENT block, opened from
 * the StatusPanel. Two tabs:
 *   · 观察 — an INDEPENDENT preview renderer (own Engine + canvas) orbiting the
 *     block, decoupled from the live world (built for future multi-block game
 *     previews); see BlockPreview / BlockPreviewLoader.
 *   · 原始数据 — the effective 5-slot BlockRaw (seed + draft merge): slot legend,
 *     an adjunct-group breakdown (typeId → name × count), and the raw JSON.
 * Self-contained: reads through loader.currentBlockRaw.
 */
export function BlockInspector({ loader, open, onClose }: { loader: any; open: boolean; onClose: () => void }) {
    const [tab, setTab] = useState<'observe' | 'raw'>('observe');
    const [data, setData] = useState<{ block: [number, number]; raw: any; isDraft: boolean } | null>(null);

    useEffect(() => {
        if (!open) return;
        loader?.currentBlockRaw?.().then(setData).catch(() => setData(null));
    }, [open, loader]);

    if (!open) return null;

    const groups: Array<[number, any[]]> = Array.isArray(data?.raw?.[2]) ? data!.raw[2] : [];

    return (
        <div data-testid="block-inspector" className="absolute inset-0 z-40 flex items-start justify-center bg-black/40" onClick={onClose}>
            <div className="mt-16 w-[24rem] max-w-[92vw] max-h-[74vh] flex flex-col rounded-2xl border border-cyan-500/30 bg-stone-950/95 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
                    <div className="text-cyan-200 text-sm font-bold">
                        检视 · Block <span className="font-mono text-cyan-400">{data ? `${data.block[0]}, ${data.block[1]}` : '…'}</span>
                        {data?.isDraft && <span className="ml-2 text-[9px] text-amber-400/80">草稿</span>}
                    </div>
                    <button data-testid="inspector-close" className="text-stone-400 hover:text-white text-lg leading-none" onClick={onClose}>×</button>
                </div>

                {/* tabs */}
                <div className="flex gap-1 px-3 pt-2">
                    {([['observe', '👁 观察'], ['raw', '{ } 原始数据']] as const).map(([id, label]) => (
                        <button key={id} data-testid={`inspector-tab-${id}`} onClick={() => setTab(id)}
                            className={`px-3 py-1 rounded-t-lg text-xs font-bold ${tab === id ? 'bg-white/10 text-cyan-200' : 'text-stone-500 hover:text-stone-300'}`}>
                            {label}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3 border-t border-white/10">
                    {tab === 'observe' && (
                        <div className="space-y-2">
                            <p className="text-stone-400 text-[11px] leading-relaxed">
                                独立渲染器:在自己的画布里用观察者相机(轨道)端详当前 block,
                                与主世界互不影响。为将来「多块 game 预览」预留。
                            </p>
                            {/* Independent preview renderer (own Engine + canvas). */}
                            <BlockPreview block={data ? { x: data.block[0], y: data.block[1], raw: data.raw } : null} />
                        </div>
                    )}

                    {tab === 'raw' && (
                        <div className="space-y-3">
                            {!data && <div className="text-stone-500 text-sm">加载中…</div>}
                            {data && (
                                <>
                                    <div className="space-y-1">
                                        {SLOTS.map((label, i) => (
                                            <div key={i} className="flex justify-between text-[11px] font-mono">
                                                <span className="text-stone-500">[{i}] {label}</span>
                                                <span className="text-cyan-300">{i === 2 ? `${groups.length} 组` : JSON.stringify(data.raw?.[i])}</span>
                                            </div>
                                        ))}
                                    </div>
                                    {groups.length > 0 && (
                                        <div className="pt-2 border-t border-white/10">
                                            <div className="text-[10px] text-stone-500 mb-1">附属物分组 (typeId → 类型 × 数量)</div>
                                            <div className="flex flex-wrap gap-1.5" data-testid="inspector-groups">
                                                {groups.map(([tid, rows], i) => (
                                                    <span key={i} className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] font-mono text-cyan-200">
                                                        {TYPE_NAMES[tid] ?? `0x${tid.toString(16)}`} × {Array.isArray(rows) ? rows.length : 0}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div className="pt-2 border-t border-white/10">
                                        <div className="text-[10px] text-stone-500 mb-1">BlockRaw (JSON)</div>
                                        <pre data-testid="inspector-json" className="text-[10px] font-mono text-stone-400 whitespace-pre-wrap break-all max-h-52 overflow-y-auto bg-black/40 rounded-lg p-2">
{JSON.stringify(data.raw, null, 1)}
                                        </pre>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
