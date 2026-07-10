import type { ServiceHub } from '../../net/ServiceHub';

export interface BookState { title: string; pages: string[]; page: number }
export interface BoardMessage { author: string; text: string; at: number }
export interface BoardState { channel: string; title: string; messages: BoardMessage[] | null; offline: boolean }

/**
 * PanelState — the client-side display state for the two READ-mostly e-series
 * panels: e4 book (paged static text) and e5 board (server-backed message wall).
 * Extracted from DesktopLoader (2026-07): pure UI mirror state, no engine logic —
 * clicking a book/board still routes through interact.primary in the loader,
 * which then calls openBook/openBoard here. DesktopLoader keeps a thin delegating
 * surface (openBook/turnBookPage/closeBook/openBoard/postBoardMessage/closeBoard +
 * the state getters + onBook/onBoard) so `window.loader.*` is unchanged.
 *
 * `net` is passed as a lazy accessor so the loader's field-init order (this is
 * constructed before the ServiceHub field) doesn't matter.
 */
export class PanelState {
    private _book: BookState | null = null;
    private _onBook: ((b: BookState | null) => void) | null = null;
    private _board: BoardState | null = null;
    private _onBoard: ((b: BoardState | null) => void) | null = null;

    constructor(private net: () => ServiceHub) {}

    // ── book (e4) — paging a static string[] is a pure view action, so the page
    //    index lives here, not in the engine (same discipline as e1's window.open).
    public get bookState(): BookState | null { return this._book; }
    public onBook(cb: (b: BookState | null) => void): void { this._onBook = cb; }
    /** Open a book with its pages (ignores an empty book). */
    public openBook(pages: string[], title = ''): void {
        if (!Array.isArray(pages) || pages.length === 0) return;
        this._book = { title, pages, page: 0 };
        this._onBook?.(this._book);
    }
    /** Turn the page, clamped to [0, last] — no wrap, so the reader never falls off either end. */
    public turnBookPage(delta: number): void {
        if (!this._book) return;
        const next = Math.max(0, Math.min(this._book.pages.length - 1, this._book.page + delta));
        if (next === this._book.page) return;
        this._book = { ...this._book, page: next };
        this._onBook?.(this._book);
    }
    public closeBook(): void {
        if (!this._book) return;
        this._book = null;
        this._onBook?.(null);
    }

    // ── board (e5) — server-backed message wall; the channel's messages live on
    //    services/board (offline → read-only empty).
    public get boardPanelState(): BoardState | null { return this._board; }
    public onBoard(cb: (b: BoardState | null) => void): void { this._onBoard = cb; }
    /** Open a board panel and (re)load its channel from the board service. */
    public async openBoard(channel: string, title = ''): Promise<void> {
        this._board = { channel, title, messages: null, offline: false };
        this._onBoard?.(this._board);
        try {
            const data = await this.net().http('board').getJson(`/v0/list?channel=${encodeURIComponent(channel)}`, { timeoutMs: 2000 });
            if (this._board?.channel !== channel) return; // closed/switched meanwhile
            this._board = { ...this._board, messages: data.messages ?? [], offline: false };
        } catch {
            if (this._board?.channel !== channel) return;
            this._board = { ...this._board, messages: [], offline: true };
        }
        this._onBoard?.(this._board);
    }
    /** Post to the open board's channel, then refresh the list. */
    public async postBoardMessage(text: string, author = '游客'): Promise<boolean> {
        const b = this._board;
        if (!b || !text.trim()) return false;
        try {
            await this.net().http('board').postJson('/v0/post', { channel: b.channel, author, text });
            await this.openBoard(b.channel, b.title); // refresh
            return true;
        } catch { return false; }
    }
    public closeBoard(): void { this._board = null; this._onBoard?.(null); }
}
