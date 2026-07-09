import { useEffect, useId, useRef } from 'react';
import { BlockPreviewLoader } from '../lib/BlockPreviewLoader';

/**
 * BlockPreview — mounts an INDEPENDENT renderer (its own Engine + canvas) that
 * observes a single block with an orbit camera. Drag rotates (engine-native
 * touch/mouse look → the Observe camera); the wheel and two-finger pinch zoom.
 * Fully self-contained and disposed on unmount, so it never touches the live
 * world.
 */
export function BlockPreview({ block }: { block: { x: number; y: number; raw: any } | null }) {
    const rawId = useId();
    const containerId = `block-preview-${rawId.replace(/[:]/g, '')}`;
    const loaderRef = useRef<BlockPreviewLoader | null>(null);
    const pinchRef = useRef<number | null>(null);

    useEffect(() => {
        if (!block) return;
        const loader = new BlockPreviewLoader();
        loaderRef.current = loader;
        const t = setTimeout(() => { void loader.init(containerId, block); }, 0);
        return () => { clearTimeout(t); loader.dispose(); loaderRef.current = null; };
    }, [containerId, block?.x, block?.y]);

    if (!block) return null;

    const dist = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    return (
        <div className="relative w-full h-56 rounded-xl overflow-hidden border border-white/10 bg-black/60"
            onWheel={(e) => { e.preventDefault(); loaderRef.current?.zoom(e.deltaY > 0 ? 1.12 : 0.89); }}
            onTouchStart={(e) => { if (e.touches.length === 2) pinchRef.current = dist(e.touches); }}
            onTouchMove={(e) => {
                if (e.touches.length === 2 && pinchRef.current) {
                    e.preventDefault();
                    const d = dist(e.touches);
                    loaderRef.current?.zoom(pinchRef.current / d);   // spread → closer, pinch → farther
                    pinchRef.current = d;
                }
            }}
            onTouchEnd={(e) => { if (e.touches.length < 2) pinchRef.current = null; }}>
            <div id={containerId} data-testid="block-preview-canvas" className="absolute inset-0" />
            <div className="absolute bottom-1.5 left-2 text-[9px] font-mono text-cyan-300/50 pointer-events-none">
                独立预览 · 拖拽旋转 · 滚轮/捏合缩放
            </div>
        </div>
    );
}
