import { useEffect, useState } from 'react';

interface DialogueView {
    adjunctId: string;
    text: string;
    options: string[];
}

/**
 * Dialogue panel — the host-UI half of the F4 contract (DialogueSystem walks
 * the tree, emits dialogue.started/node/ended with text + VISIBLE option
 * labels; this panel is a pure view that renders them and calls back through
 * Engine.chooseDialogue / endDialogue). Zero dialogue logic lives here: the
 * JSONLogic gating already happened engine-side, so options arrive pre-filtered.
 */
export function DialogueUI({ loader }: { loader: any }) {
    const [view, setView] = useState<DialogueView | null>(null);

    useEffect(() => {
        if (!loader?.engine) return;
        const onNode = (payload: any) => setView({
            adjunctId: String(payload?.adjunctId ?? ''),
            text: String(payload?.text ?? ''),
            options: Array.isArray(payload?.options) ? payload.options.map(String) : [],
        });
        const onEnd = () => setView(null);
        loader.engine.on('dialogue.started', onNode);
        loader.engine.on('dialogue.node', onNode);
        loader.engine.on('dialogue.ended', onEnd);
        return () => {
            loader.engine?.off('dialogue.started', onNode);
            loader.engine?.off('dialogue.node', onNode);
            loader.engine?.off('dialogue.ended', onEnd);
        };
    }, [loader]);

    if (!view) return null;

    return (
        <div
            data-testid="dialogue-panel"
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 w-[min(560px,90vw)]"
        >
            <div className="rounded-xl border border-amber-400/30 bg-black/80 backdrop-blur-md shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-amber-400/20">
                    <span className="text-[10px] font-black tracking-[0.25em] text-amber-300/80 uppercase">对话</span>
                    <button
                        data-testid="dialogue-close"
                        onClick={() => loader.engine?.endDialogue()}
                        className="text-neutral-400 hover:text-white text-sm leading-none px-1"
                        aria-label="结束对话"
                    >×</button>
                </div>
                <div data-testid="dialogue-text" className="px-4 py-3 text-sm text-neutral-100 whitespace-pre-wrap">
                    {view.text}
                </div>
                <div className="px-3 pb-3 flex flex-col gap-1.5">
                    {view.options.map((label, i) => (
                        <button
                            key={`${i}-${label}`}
                            data-testid={`dialogue-option-${i}`}
                            onClick={() => loader.engine?.chooseDialogue(i)}
                            className="text-left text-sm px-3 py-1.5 rounded-lg border border-amber-400/20 bg-amber-400/5 text-amber-100 hover:bg-amber-400/15 transition-colors"
                        >
                            {label}
                        </button>
                    ))}
                    {view.options.length === 0 && (
                        <button
                            data-testid="dialogue-option-none"
                            onClick={() => loader.engine?.endDialogue()}
                            className="text-left text-sm px-3 py-1.5 rounded-lg border border-neutral-500/20 bg-white/5 text-neutral-300 hover:bg-white/10 transition-colors"
                        >
                            （结束）
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
