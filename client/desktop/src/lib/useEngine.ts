import { useEffect, useRef, useState } from 'react';
import { DesktopLoader } from './DesktopLoader';

/**
 * Boots the chain-free engine loader and exposes UI-facing state.
 * No wallet, no chain — the loader runs on local data only.
 */
export type WorldMode = 'normal' | 'edit' | 'game' | 'ghost';

export function useEngine(containerId: string) {
    const loaderRef = useRef<DesktopLoader | null>(null);
    const [ready, setReady] = useState(false);
    const [mode, setMode] = useState<WorldMode>('normal');
    const [showMinimap, setShowMinimap] = useState(false);
    // Default third-person so the avatar is visible (matches CharacterController default).
    const [view, setView] = useState<'first' | 'third'>('third');

    useEffect(() => {
        if (!loaderRef.current) {
            loaderRef.current = new DesktopLoader();
            (window as any).loader = loaderRef.current;
            loaderRef.current
                .init(containerId)
                .then(() => setReady(true))
                .catch((e) => console.error('[useEngine] init failed', e));
        }
        // The engine owns a single canvas for the page lifetime; intentionally
        // no teardown here (matches the app's single-instance model).
    }, [containerId]);

    useEffect(() => { loaderRef.current?.toggleMinimap(showMinimap); }, [showMinimap]);
    useEffect(() => { if (ready) loaderRef.current?.setMode(mode); }, [mode, ready]);
    useEffect(() => { if (ready) loaderRef.current?.setCameraView(view); }, [view, ready]);

    return {
        loader: loaderRef.current,
        ready,
        mode,
        setMode,
        isEditMode: mode === 'edit',
        showMinimap,
        setShowMinimap,
        view,
        setView,
    };
}
