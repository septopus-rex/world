import { useEffect, useState } from 'react';
import type { DesktopLoader, MapCell } from '../lib/DesktopLoader';
import { usePages, type PageSpec } from './page';

/**
 * BlockDetailPage — the page you land on by tapping a block on the 2D map, and
 * the worked example of a SUB-page: pushed onto the same surface the map lives
 * on, with a back step to it (the map keeps its pan/zoom and streamed cells).
 *
 * It re-reads the cell through `loader.fetchMapCell` instead of trusting the
 * snapshot the map passed in: the map may have been clicked before that cell's
 * fetch landed, in which case the click carried an empty placeholder.
 *
 * Adding a per-block operation later (edit, publish, config) means one more
 * button here — and one more `pages.push(...)` if it needs a page of its own.
 */

const TYPE_NAMES: Record<number, string> = {
    0x00a1: 'wall', 0x00a2: 'box', 0x00a3: 'light', 0x00a4: 'module', 0x00a5: 'water',
    0x00a6: 'cone', 0x00a7: 'ball', 0x00a8: 'sign', 0x00b4: 'stop', 0x00b5: 'item',
    0x00b6: 'spp', 0x00b8: 'trigger', 0x00b9: 'spawner', 0x00ba: 'npc', 0x00c1: 'track',
    0x00c2: 'motif', 0x00e1: 'link', 0x00e2: 'audio', 0x00e3: 'video', 0x00e4: 'book',
    0x00e5: 'board',
};

/** A block's detail page. `onDismiss` fires when it leaves the stack by any route. */
export function blockDetailPage(loader: DesktopLoader | null, cell: MapCell, onDismiss?: () => void): PageSpec {
    return {
        id: `block-${cell.x}-${cell.y}`,
        title: '地块详情 · Block',
        subtitle: `[${cell.x}, ${cell.y}]`,
        onDismiss,
        content: <BlockDetail loader={loader} initial={cell} />,
    };
}

function BlockDetail({ loader, initial }: { loader: DesktopLoader | null; initial: MapCell }) {
    const pages = usePages();
    const [cell, setCell] = useState<MapCell>(initial);

    useEffect(() => {
        let alive = true;
        loader?.fetchMapCell(initial.x, initial.y)
            .then((fresh) => { if (alive) setCell(fresh); })
            .catch(() => { /* keep the snapshot the map handed us */ });
        return () => { alive = false; };
    }, [loader, initial.x, initial.y]);

    const anchors = cell.anchors ?? [];

    return (
        <div data-testid="block-detail" className="space-y-3 text-xs font-mono text-stone-200">
            <div className="space-y-1">
                <Row label="坐标 Coord" value={`[${cell.x}, ${cell.y}]`} />
                <Row label="内容 Adjuncts" value={String(cell.count)} testId="block-detail-count" />
                <Row label="可玩 Game" value={cell.game >= 1 ? 'yes' : 'no'} tone={cell.game >= 1 ? 'good' : 'dim'} />
                <Row label="海拔 Elev" value={String(cell.elevation)} />
            </div>

            <div className="pt-2 border-t border-white/10">
                <div className="text-[10px] text-purple-300 font-bold uppercase mb-1.5 tracking-wider">
                    传送锚点 Anchors {anchors.length === 0 && <span className="text-stone-500 font-normal normal-case">— 无</span>}
                </div>
                {anchors.map((a) => (
                    <button
                        key={a.name}
                        data-testid={`map2d-travel-${a.name}`}
                        onClick={() => loader?.fastTravel(a.name, [cell.x, cell.y])}
                        className="mt-1 w-full py-1.5 text-[11px] bg-purple-500/20 text-purple-200 rounded-lg border border-purple-400/40 hover:bg-purple-500/35 transition-all"
                    >⟡ {a.name} · 传送 Travel</button>
                ))}
            </div>

            <div className="pt-2 border-t border-white/10">
                <button
                    data-testid="block-detail-raw"
                    onClick={() => pages.push(blockRawPage(loader, cell.x, cell.y))}
                    className="w-full py-1.5 text-[11px] text-cyan-200 bg-cyan-500/15 rounded-lg border border-cyan-400/40 hover:bg-cyan-500/30 transition-all"
                >{'{ }'} 原始数据 · Raw ›</button>
            </div>
        </div>
    );
}

function Row({ label, value, tone = 'plain', testId }: {
    label: string; value: string; tone?: 'plain' | 'good' | 'dim'; testId?: string;
}) {
    const colour = tone === 'good' ? 'text-green-400' : tone === 'dim' ? 'text-stone-500' : 'text-cyan-300';
    return (
        <div className="flex justify-between gap-3">
            <span className="text-stone-500">{label}</span>
            <span data-testid={testId} className={colour}>{value}</span>
        </div>
    );
}

/** Third level: the effective BlockRaw at an arbitrary coord (BlockInspector's
 *  「原始数据」tab, for a block the player isn't standing in). */
export function blockRawPage(loader: DesktopLoader | null, x: number, y: number): PageSpec {
    return {
        id: `block-raw-${x}-${y}`,
        title: '原始数据 · BlockRaw',
        subtitle: `[${x}, ${y}]`,
        content: <BlockRaw loader={loader} x={x} y={y} />,
    };
}

function BlockRaw({ loader, x, y }: { loader: DesktopLoader | null; x: number; y: number }) {
    const [state, setState] = useState<{ raw: any; isDraft: boolean } | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        // view(x,y,ext=0) → the effective 1×1 window (seed + draft overlay).
        loader?.view(x, y, 0, 0)
            .then((win: any) => {
                if (!alive) return;
                const blk = Array.isArray(win) ? win.find((b: any) => b?.x === x && b?.y === y) ?? win[0] : win;
                if (blk?.raw) setState({ raw: blk.raw, isDraft: !!blk.isDraft });
                else setFailed(true);
            })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [loader, x, y]);

    if (failed) return <div className="text-stone-500 text-sm">读取失败——该块不在可读范围内。</div>;
    if (!state) return <div className="text-stone-500 text-sm">加载中…</div>;

    const groups: Array<[number, any[]]> = Array.isArray(state.raw?.[2]) ? state.raw[2] : [];

    return (
        <div data-testid="block-raw" className="space-y-3">
            {state.isDraft && <div className="text-[10px] text-amber-400/80 font-bold">草稿 · 含本地编辑</div>}
            {groups.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {groups.map(([tid, rows], i) => (
                        <span key={i} className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] font-mono text-cyan-200">
                            {TYPE_NAMES[tid] ?? `0x${tid.toString(16)}`} × {Array.isArray(rows) ? rows.length : 0}
                        </span>
                    ))}
                </div>
            )}
            <pre className="text-[10px] font-mono text-stone-400 whitespace-pre-wrap break-all bg-black/40 rounded-lg p-2">
{JSON.stringify(state.raw, null, 1)}
            </pre>
        </div>
    );
}
