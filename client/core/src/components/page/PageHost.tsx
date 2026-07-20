import { useContext, useEffect, useState } from 'react';
import { PageActiveContext, PageStackItemsContext, usePages } from './PageStack';
import type { PageSpec, PageVariant } from './types';

/**
 * PageHost — renders the page stack as ONE surface over the 3D world.
 *
 * Shape (`variant`, taken from the stack ROOT): `auto` = centred modal card on a
 * wide viewport, bottom sheet on a narrow one, so a page definition is written
 * once and both shells (desktop 7777 / mobile 7778) present it natively.
 *
 * Pushed pages navigate INSIDE the surface: the top page is visible, the ones
 * below stay MOUNTED but `visibility:hidden` — they keep their DOM, their React
 * state and their layout box (a canvas page must not see its width collapse to
 * 0 while buried, and must not refetch on the way back). `visibility` rather
 * than `opacity` because hidden pages must also drop out of the tab order.
 *
 * Mount it inside the shell's positioned root, above the HUD (z-50): as a
 * half-height sheet its top edge lands mid-screen, exactly where the desktop
 * shell's right-hand mode rail sits — at z-40 the rail (rendered later) painted
 * over the header and swallowed clicks on ✕.
 */

const ANIM_MS = 300;
/** Fallback for `data-settled` when no animation runs at all (see below). */
const SETTLE_FALLBACK = ANIM_MS * 6;
const WIDE_QUERY = '(min-width: 768px)';

/** Keys the engine must not see while a page is up (InputProvider listens on
 *  `document`, so an unguarded WASD walks the player behind the map). */
function isEditable(el: EventTarget | null): boolean {
    const t = el as HTMLElement | null;
    if (!t || !t.tagName) return false;
    return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
}

function useWideViewport(): boolean {
    const [wide, setWide] = useState(() =>
        typeof window === 'undefined' ? true : window.matchMedia(WIDE_QUERY).matches);
    useEffect(() => {
        const mq = window.matchMedia(WIDE_QUERY);
        const on = () => setWide(mq.matches);
        mq.addEventListener('change', on);
        setWide(mq.matches);
        return () => mq.removeEventListener('change', on);
    }, []);
    return wide;
}

export function PageHost() {
    const stack = useContext(PageStackItemsContext);
    const pages = usePages();
    const wide = useWideViewport();
    const depth = stack.length;
    const root = stack[0];
    const top = stack[depth - 1];

    // `settled` publishes the end of the entry animation as `data-settled`:
    // anything that MEASURES the surface (e2e hit-testing above all) must not aim
    // at a moving target. `animationend` is the primary signal — a bare duration
    // timer assumes the animation also STARTED on time, and on a loaded machine
    // it doesn't. The timer stays as a fallback (deliberately generous, so it
    // cannot pre-empt a late-but-honest animation) for the case where no
    // animation runs at all and `animationend` therefore never fires: a hang is
    // worse than slack.
    const [settled, setSettled] = useState(false);
    useEffect(() => {
        if (!depth) { setSettled(false); return; }
        const t = window.setTimeout(() => setSettled(true), SETTLE_FALLBACK);
        return () => window.clearTimeout(t);
        // Re-armed per OPEN, not per push: pushing a sub-page navigates inside an
        // already-settled surface and must not re-open the measurement window.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [depth > 0]);

    // Keyboard guard + Esc. Capture on `window` runs before the engine's
    // document-level listeners, and stopPropagation there keeps the whole event
    // from reaching them. Editable targets are exempt, or a page's own text
    // input would lose its key handlers (React delegates from a root INSIDE
    // document, so the same stopPropagation would cut those off too).
    useEffect(() => {
        if (!depth) return;
        const guard = (e: KeyboardEvent) => {
            if (isEditable(e.target)) return;
            e.stopPropagation();
            if (e.type === 'keydown' && e.key === 'Escape' && top?.dismissable !== false) pages.pop();
        };
        window.addEventListener('keydown', guard, true);
        window.addEventListener('keyup', guard, true);
        return () => {
            window.removeEventListener('keydown', guard, true);
            window.removeEventListener('keyup', guard, true);
        };
    }, [depth, top, pages]);

    if (!depth || !root || !top) return null;

    const variant: Exclude<PageVariant, 'auto'> =
        !root.variant || root.variant === 'auto' ? (wide ? 'modal' : 'sheet') : root.variant;
    const size = root.size ?? 'half';

    const shape = variant === 'sheet'
        ? `absolute inset-x-0 bottom-0 rounded-t-2xl border-t ${
            size === 'tall' ? 'h-[80%]' : size === 'auto' ? 'max-h-[80%]' : 'h-1/2 min-h-[260px]'}`
        : variant === 'full'
            ? 'absolute inset-0'
            // Modal width follows `size` rather than adding a field of its own:
            // a page that declares a FIXED height does so because it hosts a
            // canvas or a long list, and those want room horizontally too; an
            // `auto`-height page is a form/confirm, which reads better narrow.
            : `absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-w-[92vw] rounded-2xl border ${
                size === 'tall' ? 'w-[46rem] h-[80vh]' : size === 'auto' ? 'w-[30rem] max-h-[80vh]' : 'w-[46rem] h-[60vh]'}`;

    // The entry animation is a CSS ANIMATION, not a transition: an animation
    // plays from mount, so there is no "render off-screen, flip on the next
    // frame" dance — and that dance needs requestAnimationFrame, which an idle
    // headless page starves (e2e helpers.ts documents the same trap), leaving
    // the surface parked off-screen while everything downstream measured it.
    // `page-pop` carries the modal's own centring translate in its keyframes, so
    // it must NOT be used for the full-screen variant (which has no translate of
    // its own and would be dragged off by a quarter screen).
    const enter = variant === 'sheet' ? 'page-rise' : variant === 'full' ? 'page-fade' : 'page-pop';

    return (
        <div
            data-testid="page-host"
            data-depth={depth}
            className="absolute inset-0 z-50 select-none"
            // Keep the wheel off the engine's camera zoom while a page is up.
            // Runs AFTER the page's own handlers (React bubbles), so a page that
            // uses the wheel itself (the map) still gets it first.
            onWheel={(e) => e.stopPropagation()}
        >
            <style>{`
@keyframes page-rise{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes page-pop{from{opacity:0;transform:translate(-50%,-50%) scale(.96)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
@keyframes page-fade{from{opacity:0}to{opacity:1}}
@keyframes page-slide-in{from{opacity:0;transform:translateX(9%)}to{opacity:1;transform:translateX(0)}}
`}</style>

            {/* Scrim: dims the world and dismisses the WHOLE stack, so a sheet
                can't be left open swallowing clicks meant for the 3D. (Esc is the
                one-level-back gesture; tapping outside means "I'm done here".) */}
            <div
                data-testid="page-scrim"
                onClick={() => { if (top.dismissable !== false) pages.close(); }}
                className="absolute inset-0 bg-black/45"
            />

            <div
                data-testid="page-surface"
                data-variant={variant}
                data-settled={settled ? '1' : '0'}
                onAnimationEnd={(e) => { if (e.animationName === enter) setSettled(true); }}
                style={{ animation: `${enter} ${ANIM_MS}ms cubic-bezier(0.16,1,0.3,1)` }}
                className={`${shape} flex flex-col overflow-hidden border-cyan-500/30 bg-[#0a0e14]/95 shadow-[0_-8px_40px_rgba(0,0,0,0.55)]`}
            >
                {/* grab handle — the affordance that says "sheet", not "page" */}
                {variant === 'sheet' && (
                    <div className="flex justify-center pt-2 pb-0.5 shrink-0">
                        <div className="w-10 h-1 rounded-full bg-white/25" />
                    </div>
                )}

                {/* The stage is the positioning context for the buried pages:
                    `absolute inset-0` against the SURFACE would also cover the
                    grab handle, making a buried page ~14 px taller than the same
                    page when active — enough to bounce a canvas's size on the
                    way back. Against the stage, buried and active pages occupy
                    exactly the same box. */}
                <div className="relative flex-1 min-h-0 flex flex-col">
                    {stack.map((spec, i) => (
                        <PageFrame
                            key={spec.id}
                            spec={spec}
                            active={i === depth - 1}
                            depth={i}
                            onBack={() => pages.pop()}
                            onClose={() => pages.close()}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

function PageFrame({ spec, active, depth, onBack, onClose }: {
    spec: PageSpec;
    active: boolean;
    depth: number;
    onBack: () => void;
    onClose: () => void;
}) {
    return (
        <PageActiveContext.Provider value={active}>
            <section
                data-testid={`page-${spec.id}`}
                data-active={active ? '1' : '0'}
                aria-hidden={!active}
                // Buried pages keep their layout box (see the header note) but go
                // `invisible`, which also removes them from the tab order.
                className={active
                    ? 'relative flex-1 min-h-0 flex flex-col'
                    : 'absolute inset-0 flex flex-col invisible pointer-events-none'}
                style={active && depth > 0 ? { animation: `page-slide-in ${ANIM_MS}ms cubic-bezier(0.16,1,0.3,1)` } : undefined}
            >
                {/* Header sized for the narrowest shell (390 px): short labels and
                    nowrap, or the title and the buttons each wrap onto two lines.
                    Only the ACTIVE page carries the generic test ids: buried
                    pages keep their DOM, so `[data-testid="page-back"]` would
                    otherwise resolve to one node per stack level and every
                    global locator would hit a strict-mode violation. The
                    elements themselves stay (unlabelled) so that the header's
                    height is identical buried and active — a canvas page must
                    not resize on the way back. */}
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-cyan-500/25 shrink-0">
                    {depth > 0 && (
                        <button
                            data-testid={active ? 'page-back' : undefined}
                            onClick={onBack}
                            aria-label="返回"
                            className="w-7 h-7 shrink-0 grid place-items-center rounded-lg text-sm font-black text-cyan-200 bg-cyan-500/15 border border-cyan-400/40 hover:bg-cyan-500/30 transition-all"
                        >‹</button>
                    )}
                    <div className="min-w-0 flex-1">
                        <div data-testid={active ? 'page-title' : undefined} className="text-[11px] font-black tracking-[0.18em] text-cyan-300/85 uppercase truncate">
                            {spec.title}
                        </div>
                        {spec.subtitle && (
                            <div className="text-[10px] font-mono text-stone-400 truncate">{spec.subtitle}</div>
                        )}
                    </div>
                    {spec.actions}
                    <button
                        data-testid={active ? 'page-close' : undefined}
                        onClick={onClose}
                        aria-label="关闭"
                        className="w-7 h-7 shrink-0 grid place-items-center rounded-lg text-xs font-black text-gray-300 bg-white/10 border border-white/20 hover:bg-white/20 transition-all"
                    >✕</button>
                </div>

                {/* Two body modes, and the difference is structural, not just
                    padding. Padded (default): a block-level scroll container —
                    ordinary content flows and scrolls. Full-bleed
                    (`padded: false`): a FLEX COLUMN that does not scroll, so a
                    child claiming `flex-1` fills the page. A canvas page needs
                    the latter — its canvas and overlays are absolutely
                    positioned, so in a block container the wrapper has nothing
                    to derive a height from and collapses to zero. */}
                <div className={spec.padded === false
                    ? 'flex-1 min-h-0 flex flex-col overflow-hidden'
                    : 'flex-1 min-h-0 overflow-y-auto px-4 py-3'}>
                    {spec.content}
                </div>
            </section>
        </PageActiveContext.Provider>
    );
}
