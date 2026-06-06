import { useEffect, useRef, useState } from 'react';
import { DesktopLoader } from './DesktopLoader';

/**
 * Boots the chain-free engine loader and exposes UI-facing state.
 * No wallet, no chain — the loader runs on local data only.
 */
export function useEngine(containerId: string) {
    const loaderRef = useRef<DesktopLoader | null>(null);
    const [ready, setReady] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [showMinimap, setShowMinimap] = useState(false);

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
    useEffect(() => { loaderRef.current?.toggleEditMode(isEditMode); }, [isEditMode]);

    return {
        loader: loaderRef.current,
        ready,
        isEditMode,
        setIsEditMode,
        showMinimap,
        setShowMinimap,
    };
}
