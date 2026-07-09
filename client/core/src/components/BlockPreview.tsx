import { useEffect, useId, useRef } from 'react';
import { BlockPreviewLoader } from '../lib/BlockPreviewLoader';

/**
 * BlockPreview — mounts an INDEPENDENT renderer (its own Engine + canvas) that
 * observes a single block with an orbit camera. Drag rotates (engine-native
 * touch/mouse look → the Observe camera); the wheel and two-finger pinch zoom.
 * Fully self-contained and disposed on unmount, so it never touches the live
 * world.
 *
 * Zoom uses NATIVE wheel/touch listeners bound `{ passive: false }` — React's
 * synthetic onWheel/onTouchMove are passive, so calling preventDefault there
 * throws "Unable to preventDefault inside passive event listener" (and lets the
 * page scroll while zooming). The listeners are attached in the SAME
 * block-keyed effect that boots the loader, so the container div (rendered only
 * once `block` is set) is guaranteed present when we bind them.
 */
export function BlockPreview({ block }: { block: { x: number; y: number; raw: any } | null }) {
    const rawId = useId();
    const containerId = `block-preview-${rawId.replace(/[:]/g, '')}`;
    const rootRef = useRef<HTMLDivElement>(null);
    const loaderRef = useRef<BlockPreviewLoader | null>(null);

    useEffect(() => {
        if (!block) return;
        const loader = new BlockPreviewLoader();
        loaderRef.current = loader;
        const t = setTimeout(() => { void loader.init(containerId, block); }, 0);

        // Zoom listeners — bound here (div exists because block is set) as NATIVE,
        // non-passive so preventDefault is legal (stops page-scroll while zooming).
        const el = rootRef.current;
        const D = (tl: TouchList) => Math.hypot(tl[0].clientX - tl[1].clientX, tl[0].clientY - tl[1].clientY);
        let pinch: number | null = null;
        const onWheel = (e: WheelEvent) => { e.preventDefault(); loaderRef.current?.zoom(e.deltaY > 0 ? 1.12 : 0.89); };
        const onTouchStart = (e: TouchEvent) => { if (e.touches.length === 2) pinch = D(e.touches); };
        const onTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2 && pinch) {
                e.preventDefault();
                const d = D(e.touches);
                loaderRef.current?.zoom(pinch / d);        // spread → closer, pinch → farther
                pinch = d;
            }
        };
        const onTouchEnd = (e: TouchEvent) => { if (e.touches.length < 2) pinch = null; };
        if (el) {
            el.addEventListener('wheel', onWheel, { passive: false });
            el.addEventListener('touchstart', onTouchStart, { passive: false });
            el.addEventListener('touchmove', onTouchMove, { passive: false });
            el.addEventListener('touchend', onTouchEnd, { passive: false });
        }

        return () => {
            clearTimeout(t);
            loader.dispose(); loaderRef.current = null;
            if (el) {
                el.removeEventListener('wheel', onWheel);
                el.removeEventListener('touchstart', onTouchStart);
                el.removeEventListener('touchmove', onTouchMove);
                el.removeEventListener('touchend', onTouchEnd);
            }
        };
    }, [containerId, block?.x, block?.y]);

    if (!block) return null;
    return (
        <div ref={rootRef} className="relative w-full h-56 rounded-xl overflow-hidden border border-white/10 bg-black/60">
            <div id={containerId} data-testid="block-preview-canvas" className="absolute inset-0" />
            <div className="absolute bottom-1.5 left-2 text-[9px] font-mono text-cyan-300/50 pointer-events-none">
                独立预览 · 拖拽旋转 · 滚轮/捏合缩放
            </div>
        </div>
    );
}
