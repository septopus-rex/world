import { useEffect, useState } from 'react';

interface BookView {
    title: string;
    pages: string[];
    page: number;
}

/**
 * BookReader — the host-UI half of the e4 book adjunct. A pure view mirror of
 * DesktopLoader's book state (openBook / turnBookPage / closeBook): clicking a
 * book adjunct fires interact.primary → the loader opens the reader; this panel
 * renders the current page and pages ◀ N/M ▶ through the loader. Zero book logic
 * lives here — it's the inanimate sibling of DialogueUI (which mirrors the ba
 * NPC's dialogue tree). Arrow keys page; Escape closes.
 */
export function BookReader({ loader }: { loader: any }) {
    const [view, setView] = useState<BookView | null>(null);

    useEffect(() => {
        if (!loader?.onBook) return;
        loader.onBook((b: BookView | null) => setView(b));
        // Adopt any book already open (e.g. a re-render after mount).
        setView(loader.bookState ?? null);
        return () => loader.onBook?.(() => { });
    }, [loader]);

    // Keyboard paging — only while a book is open, so WASD movement is untouched
    // when it's closed.
    useEffect(() => {
        if (!view) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') { loader.turnBookPage?.(1); e.preventDefault(); }
            else if (e.key === 'ArrowLeft') { loader.turnBookPage?.(-1); e.preventDefault(); }
            else if (e.key === 'Escape') { loader.closeBook?.(); e.preventDefault(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [view, loader]);

    if (!view) return null;

    const total = view.pages.length;
    const atFirst = view.page <= 0;
    const atLast = view.page >= total - 1;

    return (
        <div
            data-testid="book-panel"
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => loader.closeBook?.()}
        >
            <div
                className="relative w-[min(620px,92vw)] rounded-2xl border border-amber-300/30 bg-[#2a2016] shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-3 border-b border-amber-300/20 bg-black/20">
                    <span data-testid="book-title" className="text-sm font-black tracking-wide text-amber-200/90 truncate">
                        {view.title || '书'}
                    </span>
                    <button
                        data-testid="book-close"
                        onClick={() => loader.closeBook?.()}
                        className="text-amber-200/60 hover:text-white text-lg leading-none px-1"
                        aria-label="合上书本"
                    >×</button>
                </div>

                <div
                    data-testid="book-page-text"
                    className="px-7 py-8 min-h-[220px] text-[15px] leading-8 text-amber-50/90 whitespace-pre-wrap font-serif"
                >
                    {view.pages[view.page] ?? ''}
                </div>

                <div className="flex items-center justify-between px-5 py-3 border-t border-amber-300/20 bg-black/20">
                    <button
                        data-testid="book-prev"
                        disabled={atFirst}
                        onClick={() => loader.turnBookPage?.(-1)}
                        className="text-sm px-4 py-1.5 rounded-lg border border-amber-300/25 bg-amber-300/5 text-amber-100 enabled:hover:bg-amber-300/15 disabled:opacity-30 transition-colors"
                    >← 上一页</button>
                    <span data-testid="book-page-indicator" className="text-xs text-amber-200/60 tabular-nums">
                        {view.page + 1} / {total}
                    </span>
                    <button
                        data-testid="book-next"
                        disabled={atLast}
                        onClick={() => loader.turnBookPage?.(1)}
                        className="text-sm px-4 py-1.5 rounded-lg border border-amber-300/25 bg-amber-300/5 text-amber-100 enabled:hover:bg-amber-300/15 disabled:opacity-30 transition-colors"
                    >下一页 →</button>
                </div>
            </div>
        </div>
    );
}
