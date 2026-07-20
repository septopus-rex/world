import type { ReactNode } from 'react';

/**
 * Shared page-stack vocabulary. Kept apart from the components so a module can
 * describe a page (a `PageSpec` factory) without importing React components.
 */

/**
 * Surface shape. `auto` = centred modal card on a wide viewport, bottom sheet on
 * a narrow one — one page definition, both shells (desktop 7777 / mobile 7778).
 */
export type PageVariant = 'auto' | 'sheet' | 'modal' | 'full';

/**
 * Surface height. `auto` fits the content (capped); `half`/`tall` are fixed
 * fractions — pick one of those for pages that own a canvas or a scroll list,
 * since those have no intrinsic height to fit.
 */
export type PageSize = 'half' | 'tall' | 'auto';

export interface PageSpec {
    /** Stable identity: the e2e handle (`data-testid="page-<id>"`) and the React
     *  key. Pushing an id already on the stack is a no-op — a double-click on an
     *  entry button must not stack two copies of the same page. */
    id: string;
    title: ReactNode;
    subtitle?: ReactNode;
    /** Header controls, left of the ✕ (e.g. the map's recentre button). */
    actions?: ReactNode;
    content: ReactNode;
    /**
     * Body layout. Default (`true`): a padded, block-level SCROLL container for
     * ordinary content. `false`: a full-bleed FLEX COLUMN that does not scroll —
     * the content owns the space and can claim it with `flex-1` (what a canvas
     * page needs; in a block container an absolutely-positioned canvas leaves
     * its wrapper nothing to derive a height from, and it collapses to zero).
     */
    padded?: boolean;
    /** Scrim tap and Esc dismiss this page. Default true; set false for a page
     *  that must be answered (a confirm). */
    dismissable?: boolean;
    /** Called when this page leaves the stack by ANY route (back, ✕, scrim, Esc,
     *  close()) — the seam for "clear the selection when the detail page goes". */
    onDismiss?: () => void;
    /** Shape/height of the whole surface. Only the STACK ROOT's values apply:
     *  pushing a sub-page navigates INSIDE the surface (iOS-style), it does not
     *  resize or reshape it — a container that jumps on every push reads as a
     *  new window rather than a step deeper. */
    variant?: PageVariant;
    size?: PageSize;
}

/** Stack actions. Stable identity — safe in effect/callback dependency lists. */
export interface PagesApi {
    /** Push a page onto the stack (opens the surface when it was empty). */
    push(spec: PageSpec): void;
    /** Pop the top page (closes the surface when it empties). */
    pop(): void;
    /** Replace the top page in place (no back step to it). */
    replace(spec: PageSpec): void;
    /** Dismiss the whole stack. */
    close(): void;
    /** Pop back to `id` (no-op when it isn't on the stack). */
    popTo(id: string): void;
    /**
     * In-page confirmation → resolves true/false. This is the replacement for
     * `window.confirm`, which is forbidden on any user path (CLAUDE.md 红线) —
     * a native dialog also freezes the rAF loop and cannot be driven by e2e.
     */
    confirm(opts: ConfirmOptions): Promise<boolean>;
}

export interface ConfirmOptions {
    title: ReactNode;
    message?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Red confirm button for destructive actions (reset, delete). */
    danger?: boolean;
}

/** Reactive view of the stack — for chrome that mirrors it (button highlight). */
export interface PageStackState {
    depth: number;
    ids: string[];
    topId: string | null;
}
