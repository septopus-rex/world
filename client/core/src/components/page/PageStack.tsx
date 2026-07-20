import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ConfirmOptions, PageSpec, PageStackState, PagesApi } from './types';

/**
 * PageStack — the shared 2D page-navigation stack for both shells.
 *
 * The 3D world is the app; every 2D surface over it (map, block detail, config,
 * confirmations) is a PAGE on ONE stack. Pushing navigates DEEPER INSIDE the
 * same surface (iOS-style: back arrow, container keeps its shape) rather than
 * stacking a second window — which is what "open the map → tap a block → open
 * its detail page" needs.
 *
 * Why a stack rather than one `open` boolean per panel (the pattern this
 * replaces — `show2DMap`, `inspecting`, `sheet === 'map'`, …):
 *   · a sub-page needs a BACK step, not just a close;
 *   · lower pages must stay MOUNTED — returning from a block's detail page must
 *     land on the map exactly as it was (pan, zoom, streamed cell cache), and a
 *     re-mount would refetch the whole visible region;
 *   · one surface = one scrim, one Esc handler, one keyboard guard, instead of
 *     N panels each re-deriving them (and each re-discovering the same traps).
 *
 * Usage:
 *   <PageProvider>            {/* context only, renders no DOM *\/}
 *     <div className="relative w-screen h-screen">
 *       …app…
 *       <PageHost />          {/* the surface, wherever it should stack *\/}
 *     </div>
 *   </PageProvider>
 *
 *   const pages = usePages();
 *   pages.push({ id: 'map2d', title: '2D 地图', content: <WorldMap2D … />, … });
 *
 * `content` is a SNAPSHOT taken at push time: it does not re-render when the
 * pusher's state changes. Pages own their live state internally (own hooks /
 * loader subscriptions) — that keeps a page independent of whichever shell,
 * button, or in-world interaction opened it.
 */

const PagesContext = createContext<PagesApi | null>(null);
const StackContext = createContext<PageStackState>({ depth: 0, ids: [], topId: null });
/** Read by pages themselves (see usePageActive) — true only for the top page. */
export const PageActiveContext = createContext(true);

/** Internal: the live stack, for PageHost. */
export const PageStackItemsContext = createContext<PageSpec[]>([]);

export function PageProvider({ children }: { children: ReactNode }) {
    const [stack, setStack] = useState<PageSpec[]>([]);
    const seq = useRef(0);

    // A ref mirrors the stack and is the truth source for the mutators. Deriving
    // the popped pages inside a setState updater would be wrong twice over: an
    // updater may run later (concurrent render) so the `onDismiss` side effect
    // would fire out of order or not at all, and it may run TWICE (StrictMode),
    // which would resolve a confirm or clear a selection twice.
    const stackRef = useRef<PageSpec[]>([]);
    const commit = useCallback((next: PageSpec[], victims: PageSpec[] = []) => {
        stackRef.current = next;
        setStack(next);
        for (let i = victims.length - 1; i >= 0; i--) victims[i].onDismiss?.();
    }, []);

    const push = useCallback((spec: PageSpec) => {
        const s = stackRef.current;
        if (s.some((p) => p.id === spec.id)) return;   // double-click guard
        commit([...s, spec]);
    }, [commit]);

    const pop = useCallback(() => {
        const s = stackRef.current;
        if (!s.length) return;
        commit(s.slice(0, -1), s.slice(-1));
    }, [commit]);

    const close = useCallback(() => {
        const s = stackRef.current;
        if (!s.length) return;
        commit([], s);
    }, [commit]);

    const popTo = useCallback((id: string) => {
        const s = stackRef.current;
        const i = s.findIndex((p) => p.id === id);
        if (i < 0 || i === s.length - 1) return;
        commit(s.slice(0, i + 1), s.slice(i + 1));
    }, [commit]);

    /** Remove `id` and everything above it — how a page dismisses ITSELF without
     *  assuming it is still on top (a confirm answered after another push). */
    const removeFrom = useCallback((id: string) => {
        const s = stackRef.current;
        const i = s.findIndex((p) => p.id === id);
        if (i < 0) return;
        commit(s.slice(0, i), s.slice(i));
    }, [commit]);

    const replace = useCallback((spec: PageSpec) => {
        const s = stackRef.current;
        if (!s.length) { push(spec); return; }
        commit([...s.slice(0, -1), spec], s.slice(-1));
    }, [commit, push]);

    const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => {
        const id = `confirm-${++seq.current}`;
        let settled = false;
        const answer = (v: boolean) => {
            if (settled) return;          // dismissal after an explicit answer
            settled = true;
            resolve(v);
        };
        const pick = (v: boolean) => { answer(v); removeFrom(id); };
        push({
            id,
            title: opts.title,
            size: 'auto',
            onDismiss: () => answer(false),   // scrim / Esc / ✕ = cancel
            content: (
                <div className="space-y-4" data-testid="page-confirm">
                    {opts.message && <div className="text-sm leading-relaxed text-stone-300">{opts.message}</div>}
                    <div className="flex justify-end gap-2">
                        <button
                            data-testid="page-confirm-cancel"
                            onClick={() => pick(false)}
                            className="px-4 py-1.5 rounded-lg text-xs font-bold text-stone-300 bg-white/10 border border-white/20 hover:bg-white/20 transition-all"
                        >{opts.cancelLabel ?? '取消'}</button>
                        <button
                            data-testid="page-confirm-ok"
                            onClick={() => pick(true)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all ${opts.danger
                                ? 'text-red-100 bg-red-500/30 border-red-400/60 hover:bg-red-500/45'
                                : 'text-cyan-100 bg-cyan-500/25 border-cyan-400/60 hover:bg-cyan-500/40'}`}
                        >{opts.confirmLabel ?? '确定'}</button>
                    </div>
                </div>
            ),
        });
    }), [push, removeFrom]);

    // Stable across renders: `usePages()` results are safe in dependency lists,
    // so a page's effects don't re-run every time the stack changes depth.
    const api = useMemo<PagesApi>(
        () => ({ push, pop, replace, close, popTo, confirm }),
        [push, pop, replace, close, popTo, confirm],
    );
    const state = useMemo<PageStackState>(
        () => ({ depth: stack.length, ids: stack.map((p) => p.id), topId: stack[stack.length - 1]?.id ?? null }),
        [stack],
    );

    return (
        <PagesContext.Provider value={api}>
            <PageStackItemsContext.Provider value={stack}>
                <StackContext.Provider value={state}>{children}</StackContext.Provider>
            </PageStackItemsContext.Provider>
        </PagesContext.Provider>
    );
}

/** Stack actions (stable identity). Throws outside a PageProvider — a page that
 *  silently no-ops would be far harder to diagnose than a mount-time error. */
export function usePages(): PagesApi {
    const api = useContext(PagesContext);
    if (!api) throw new Error('[PageStack] usePages() outside <PageProvider>');
    return api;
}

/** Reactive stack view — for chrome mirroring it (e.g. a highlighted button). */
export function usePageStack(): PageStackState {
    return useContext(StackContext);
}

/**
 * True only while THIS page is the top of the stack. Pages that run a loop
 * (canvas redraw, polling) should idle when inactive — they stay mounted while
 * buried, which is the point, but they shouldn't keep burning frames.
 */
export function usePageActive(): boolean {
    return useContext(PageActiveContext);
}
