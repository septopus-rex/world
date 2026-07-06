import { useEffect, useRef, useState, type RefObject } from 'react';
import type { StylePack } from '@engine/core/spp/Variants';
import { StylePackPreviewLoader, type Faces, type FaceLabel } from './StylePackPreviewLoader';
import type { HlPoly } from './constants';

/**
 * usePreviewLoader — owns the lean Engine harness (path b) for the editor's 3D
 * preview. Boots it once, then each frame re-projects the six face labels + the
 * selected face's highlight polygon to screen space (the camera orbits). Returns
 * the loader (for apply/setFaces) + the current labels/highlight.
 */
export function usePreviewLoader(initialPack: StylePack, initialDial: Faces, selFaceRef: RefObject<number>) {
    const loaderRef = useRef<StylePackPreviewLoader | null>(null);
    const [labels, setLabels] = useState<FaceLabel[]>([]);
    const [hl, setHl] = useState<HlPoly | null>(null);

    useEffect(() => {
        document.getElementById('init-loader')?.remove(); // clear the boot overlay
        const loader = new StylePackPreviewLoader();
        loaderRef.current = loader;
        (window as any).spLoader = loader; // e2e/debug handle
        loader.init('sp-preview', initialPack, initialDial).catch(() => {});
        let raf = 0;
        const tick = () => {
            setLabels(loader.faceLabels?.() ?? []);
            setHl(loader.faceCorners?.(selFaceRef.current ?? 0) ?? null);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => { cancelAnimationFrame(raf); loader.dispose(); };
        // Boot once; initialPack/initialDial are the mount-time values by design.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { loaderRef, labels, hl };
}
