import { FACE_NAMES } from '../scenes/sandboxScene';

/**
 * SppFacePanel — the SPP sandbox's face config card (Editor 1, two-level pick).
 *
 * Shows the LIVE library of the effective theme: both pools (挡 closed / 通 open)
 * exactly as the engine lists them via Engine.listVariants — never a hard-coded
 * option set (spp-editors.md §2.2). One click applies [state, key] and the
 * structure re-expands in place, so the panel doubles as a preview switcher:
 * click through options and watch the wall morph. The active option highlights.
 *
 * Pure presentation: state lives in SppStudio (loader.sandboxFaceOptions()),
 * the host polls it and hands the snapshot in as `info`.
 */

export interface SppFaceInfo {
    cell: number;
    face: number;
    theme: string;
    state: number;
    variantKey: string | null;
    open: Array<{ key: string; name: string }>;
    closed: Array<{ key: string; name: string }>;
}

export function SppFacePanel({ info, onApply, onClose }: {
    info: SppFaceInfo;
    onApply: (state: number, key: string) => void;
    onClose: () => void;
}) {
    const group = (label: string, state: number, options: SppFaceInfo['open']) => (
        <div>
            <div className="text-[10px] text-amber-200/60 font-semibold tracking-wider mb-1">{label}</div>
            <div className="flex flex-col gap-1">
                {options.map((o) => {
                    const active = info.state === state && info.variantKey === o.key;
                    return (
                        <button
                            key={o.key}
                            data-testid={`face-opt-${state === 1 ? 'closed' : 'open'}-${o.key}`}
                            onClick={() => onApply(state, o.key)}
                            className={`px-3 py-1.5 rounded-lg text-left text-xs font-bold border transition ${
                                active
                                    ? 'bg-cyan-400/30 border-cyan-300/60 text-cyan-50'
                                    : 'bg-amber-400/10 border-amber-300/30 text-amber-100/80 hover:bg-amber-400/20'
                            }`}
                        >{o.name}</button>
                    );
                })}
                {options.length === 0 && (
                    <span className="px-3 py-1.5 text-[10px] text-amber-100/40">（此库无选项）</span>
                )}
            </div>
        </div>
    );

    return (
        <div
            data-testid="face-panel"
            // right-16 keeps the panel out of the right-edge ActionRail's lane
            // (App reserves pr-16 for it) — at right-4 the rail sits on top and
            // swallows the panel's clicks. top-44 clears the avatar button row.
            className="absolute top-44 right-16 z-40 w-44 pointer-events-auto flex flex-col gap-3 px-4 py-3 rounded-2xl bg-amber-950/80 border border-amber-400/30 backdrop-blur-md shadow-2xl"
        >
            <div className="flex items-center justify-between">
                <span className="text-amber-100 text-sm font-bold">
                    {FACE_NAMES[info.face] ?? info.face} 面
                    <span className="ml-1.5 text-[10px] font-semibold text-amber-200/50">cell {info.cell}</span>
                </span>
                <button
                    data-testid="face-panel-close"
                    onClick={onClose}
                    aria-label="关闭"
                    className="inline-flex items-center justify-center w-6 h-6 rounded-md text-amber-200/70 hover:text-amber-50 hover:bg-amber-400/20 transition"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                </button>
            </div>
            {group('挡 · 结构', 1, info.closed)}
            {group('通 · 通行', 0, info.open)}
            {/* Which library these options came from — flips live with the style switcher. */}
            <div data-testid="face-panel-theme" className="text-[10px] text-amber-200/40 border-t border-amber-400/15 pt-2">
                库：{info.theme}
            </div>
        </div>
    );
}
