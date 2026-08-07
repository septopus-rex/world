import { useEffect, useRef, useState } from 'react';
import type { StylePack } from '@engine/core/spp/Variants';
import { StylePackPreviewLoader, type Faces, type FaceLabel } from './StylePackPreviewLoader';
import type { HlPoly } from './constants';

/**
 * usePreviewLoader — owns the lean Engine harness (path b) for the editor's 3D
 * preview. Each frame it re-projects the six face labels to screen space (the
 * camera orbits) + snapshots the face polygons for click hit-testing. Returns
 * the loader (for apply/setFaces/setHighlightFace) + the current labels/faces.
 *
 * StrictMode-safe: the Engine is an EXPENSIVE singleton (WebGL context + its own
 * canvas). React StrictMode mounts→unmounts→mounts effects in dev, which would
 * spin up TWO Engines in the container (a stale canvas on top of the live one).
 * So the loader is created ONCE (ref-guarded) and only the rAF tick restarts on
 * re-mount — never a second Engine. The loader lives for the page (this tool is
 * the whole page; a real unmount is a page reload, which frees it).
 */
export function usePreviewLoader(initialPack: StylePack, initialDial: Faces) {
    const loaderRef = useRef<StylePackPreviewLoader | null>(null);
    const [labels, setLabels] = useState<FaceLabel[]>([]);
    const [faces, setFaces] = useState<Array<HlPoly | null>>([]);

    useEffect(() => {
        document.getElementById('init-loader')?.remove(); // clear the boot overlay
        let loader = loaderRef.current;
        if (!loader) {
            loader = new StylePackPreviewLoader();
            loaderRef.current = loader;
            (window as any).spLoader = loader; // e2e/debug handle
            loader.init('sp-preview', initialPack, initialDial).catch(() => {});
        }
        const l = loader;
        let raf = 0;
        const tick = () => {
            setLabels(l.faceLabels?.() ?? []);
            setFaces(l.allFaceCorners?.() ?? []);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => { cancelAnimationFrame(raf); }; // stop the tick only; keep the singleton
        // Boot once; initialPack/initialDial are the mount-time values by design.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { loaderRef, labels, faces };
}
