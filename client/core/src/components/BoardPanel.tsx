import { useEffect, useRef, useState } from 'react';

/**
 * BoardPanel — the host-UI half of the e5 board adjunct. A pure view mirror of
 * DesktopLoader's board state (openBoard / postBoardMessage / closeBoard):
 * clicking a board in the world opens this panel; the messages are MUTABLE
 * SHARED STATE on services/board (offline → read-only). Same pattern as
 * BookReader (e4), plus one input row because a guestbook is writable.
 */
export function BoardPanel({ loader }: { loader: any }) {
    const [board, setBoard] = useState(loader.boardPanelState);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => { loader.onBoard(setBoard); }, [loader]);
    useEffect(() => {
        // Newest message into view whenever the list refreshes.
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }, [board?.messages?.length]);

    if (!board) return null;

    const post = async () => {
        if (!text.trim() || busy) return;
        setBusy(true);
        const ok = await loader.postBoardMessage(text.trim());
        setBusy(false);
        if (ok) setText('');
    };

    return (
        <div data-testid="board-panel"
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/50"
            onClick={() => loader.closeBoard()}>
            <div className="w-[26rem] max-w-[92vw] max-h-[80vh] flex flex-col rounded-xl border border-amber-700/60 bg-stone-900/95 shadow-2xl"
                onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-2 border-b border-amber-800/40">
                    <div className="text-amber-200 font-semibold text-sm">
                        📌 {board.title || '留言板'}
                        <span className="ml-2 text-amber-500/60 text-xs">#{board.channel}</span>
                        {board.offline && <span className="ml-2 text-red-400/80 text-xs" data-testid="board-offline">离线 · 只读</span>}
                    </div>
                    <button data-testid="board-close" className="text-stone-400 hover:text-white text-lg leading-none"
                        onClick={() => loader.closeBoard()}>×</button>
                </div>

                <div ref={listRef} data-testid="board-list" className="flex-1 min-h-[10rem] overflow-y-auto px-4 py-2 space-y-2">
                    {board.messages === null && <div className="text-stone-500 text-sm">加载中…</div>}
                    {board.messages?.length === 0 && <div className="text-stone-500 text-sm">还没有留言——写下第一条吧。</div>}
                    {board.messages?.map((m: { author: string; text: string; at: number }, i: number) => (
                        <div key={`${m.at}-${i}`} data-testid="board-msg" className="text-sm">
                            <span className="text-amber-400/90">{m.author}</span>
                            <span className="text-stone-500 text-xs ml-2">{new Date(m.at).toLocaleString()}</span>
                            <div className="text-stone-200 whitespace-pre-wrap break-words">{m.text}</div>
                        </div>
                    ))}
                </div>

                {!board.offline && (
                    <div className="flex gap-2 px-4 py-3 border-t border-amber-800/40">
                        <input data-testid="board-input" value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void post(); e.stopPropagation(); }}
                            onKeyUp={(e) => e.stopPropagation()}
                            placeholder="留下一句话…" maxLength={500}
                            className="flex-1 rounded bg-stone-800 border border-stone-700 px-2 py-1.5 text-sm text-stone-100 outline-none focus:border-amber-600" />
                        <button data-testid="board-post" disabled={busy || !text.trim()} onClick={() => void post()}
                            className="rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-40 px-3 py-1.5 text-sm text-white">
                            发布
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
