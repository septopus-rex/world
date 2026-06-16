import { useEffect, useRef, useState } from 'react';
import { Coords } from '@engine/core/utils/Coords';
import type { DesktopLoader, MapCell } from '../lib/DesktopLoader';

/**
 * WorldMap2D — a pannable 2D world map (the old engine's render_2d / control_2d
 * feature, modernized). It is a pure RENDER-layer addition: block data comes from
 * the SAME source the 3D world streams from (`loader.fetchMapCell`, no 3D entities
 * built), and the map's own viewport drives which cells are fetched — dynamic
 * region loading, decoupled from the player's position.
 *
 * Features (parity with old engine): drag to pan, wheel to zoom (cursor-anchored),
 * click a block to inspect, reset-to-player. Cells colour by occupancy / playable
 * (block.game) zone; the player shows as a live heading marker.
 *
 * Design note: this is the SCREEN-space 2D map (canvas), distinct from the PiP 3D
 * minimap (a top-down Three.js camera). See docs/plan/specs/2d-map.md.
 */

const MIN_CELL = 4;     // px per block (zoomed out)
const MAX_CELL = 40;    // px per block (zoomed in)
const DEFAULT_CELL = 20;
const TICK_MS = 80;     // redraw + ensure-loaded cadence (setInterval, e2e-robust)
const FETCH_PER_TICK = 48;
const CACHE_CAP = 4000;

interface Props {
    loader: DesktopLoader | null;
    open: boolean;
    onClose: () => void;
}

export function WorldMap2D({ loader, open, onClose }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);

    // Imperative view state (refs so pan/zoom don't thrash React).
    const center = useRef({ x: 2048.5, y: 2048.5 }); // block-space coord at screen center
    const cell = useRef(DEFAULT_CELL);
    const cache = useRef(new Map<string, MapCell>());
    const pending = useRef(new Set<string>());
    const drag = useRef<{ on: boolean; lastX: number; lastY: number; moved: number }>({ on: false, lastX: 0, lastY: 0, moved: 0 });
    const inited = useRef(false);

    const [selected, setSelected] = useState<MapCell | null>(null);
    // Mirror into a ref so the (once-created) draw loop always reads the current
    // selection rather than the value captured when the interval was set up.
    const selectedRef = useRef<MapCell | null>(null);
    useEffect(() => { selectedRef.current = selected; }, [selected]);

    // Center on the player the first time the map opens.
    useEffect(() => {
        if (!open) { inited.current = false; return; }
        if (!inited.current && loader) {
            const [bx, by] = loader.playerState.block;
            center.current = { x: bx + 0.5, y: by + 0.5 };
            inited.current = true;
        }
    }, [open, loader]);

    // Draw + dynamic-load loop. setInterval (not rAF) so it keeps ticking even when
    // the engine's rAF loop is stopped (deterministic e2e).
    useEffect(() => {
        if (!open) return;
        const id = window.setInterval(() => tick(), TICK_MS);
        tick(); // immediate first paint
        return () => window.clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, loader]);

    function tick() {
        const canvas = canvasRef.current, wrap = wrapRef.current;
        if (!canvas || !wrap || !loader) return;
        const W = wrap.clientWidth, H = wrap.clientHeight;
        if (canvas.width !== W) canvas.width = W;
        if (canvas.height !== H) canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const c = cell.current, cx = center.current.x, cy = center.current.y;
        const [rangeX, rangeY] = loader.worldRange;

        // Visible block range (inclusive), clamped a little wider for smooth edges.
        const bx0 = Math.floor(cx - (W / 2) / c) - 1, bx1 = Math.floor(cx + (W / 2) / c) + 1;
        const by0 = Math.floor(cy - (H / 2) / c) - 1, by1 = Math.floor(cy + (H / 2) / c) + 1;

        // ── dynamic region load: fetch visible, in-bounds, not-yet-known cells ──
        let budget = FETCH_PER_TICK;
        for (let by = by0; by <= by1 && budget > 0; by++) {
            for (let bx = bx0; bx <= bx1 && budget > 0; bx++) {
                if (bx < 1 || by < 1 || bx > rangeX || by > rangeY) continue;
                const k = `${bx}_${by}`;
                if (cache.current.has(k) || pending.current.has(k)) continue;
                pending.current.add(k);
                budget--;
                loader.fetchMapCell(bx, by).then((mc) => {
                    cache.current.set(k, mc);
                    pending.current.delete(k);
                }).catch(() => pending.current.delete(k));
            }
        }
        if (cache.current.size > CACHE_CAP) evict(bx0 - 8, by0 - 8, bx1 + 8, by1 + 8);

        draw(ctx, W, H);

        // e2e/test seam.
        (window as any).__map2d = {
            center: { x: cx, y: cy }, cell: c, loaded: cache.current.size,
            view: [bx0, by0, bx1, by1], range: [rangeX, rangeY],
            selected: selectedRef.current ? [selectedRef.current.x, selectedRef.current.y] : null,
        };
    }

    function evict(kx0: number, ky0: number, kx1: number, ky1: number) {
        for (const [k] of cache.current) {
            const [bx, by] = k.split('_').map(Number);
            if (bx < kx0 || bx > kx1 || by < ky0 || by > ky1) cache.current.delete(k);
        }
    }

    function draw(ctx: CanvasRenderingContext2D, W: number, H: number) {
        const c = cell.current, cx = center.current.x, cy = center.current.y;
        const [rangeX, rangeY] = loader!.worldRange;
        const sx = (u: number) => W / 2 + (u - cx) * c;   // block-x → screen px
        const sy = (v: number) => H / 2 - (v - cy) * c;   // block-y (north up) → screen px

        ctx.fillStyle = '#0a0e14';
        ctx.fillRect(0, 0, W, H);

        const bx0 = Math.floor(cx - (W / 2) / c) - 1, bx1 = Math.floor(cx + (W / 2) / c) + 1;
        const by0 = Math.floor(cy - (H / 2) / c) - 1, by1 = Math.floor(cy + (H / 2) / c) + 1;
        const grid = c >= 10;

        for (let by = by0; by <= by1; by++) {
            for (let bx = bx0; bx <= bx1; bx++) {
                const left = sx(bx), top = sy(by + 1); // cell spans [bx,bx+1]×[by,by+1]
                if (bx < 1 || by < 1 || bx > rangeX || by > rangeY) {
                    ctx.fillStyle = '#05070a'; // void (outside the world grid)
                    ctx.fillRect(left, top, c, c);
                    continue;
                }
                const mc = cache.current.get(`${bx}_${by}`);
                if (!mc) {
                    ctx.fillStyle = 'rgba(120,160,200,0.03)'; // not loaded yet
                } else if (mc.game >= 1) {
                    ctx.fillStyle = 'rgba(50,220,120,0.30)';  // playable zone (block.game)
                } else if (mc.occupied) {
                    ctx.fillStyle = 'rgba(0,200,255,0.26)';   // has content
                } else {
                    ctx.fillStyle = 'rgba(120,160,200,0.05)'; // loaded, empty
                }
                ctx.fillRect(left, top, c, c);
                if (grid) {
                    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(left + 0.5, top + 0.5, c, c);
                }
            }
        }

        // selected block outline (old engine select colour).
        const sel = selectedRef.current;
        if (sel) {
            ctx.strokeStyle = '#00CCDD';
            ctx.lineWidth = 2;
            ctx.strokeRect(sx(sel.x), sy(sel.y + 1), c, c);
        }

        // player marker + heading.
        if (loader) {
            const [pbx, pby] = loader.playerState.block;
            const [px, py] = loader.playerState.position; // rel metres in the 16m block
            const ux = pbx + px / 16, uy = pby + py / 16;
            const mx = sx(ux), my = sy(uy);
            // Heading via the single Coords conversion (engine yaw → Septopus
            // heading, CW-from-North). North-up canvas: rotate the north-pointing
            // marker clockwise by the heading. Same source the HUD compass uses.
            const yaw = loader.getPlayerRotationY?.() ?? 0;
            ctx.save();
            ctx.translate(mx, my);
            ctx.rotate(Coords.engineYawToHeading(yaw));
            ctx.fillStyle = '#ffd23f';
            ctx.beginPath();
            ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    // ── interaction ──────────────────────────────────────────────────────────────

    function onPointerDown(e: React.PointerEvent) {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        drag.current = { on: true, lastX: e.clientX, lastY: e.clientY, moved: 0 };
    }
    function onPointerMove(e: React.PointerEvent) {
        if (!drag.current.on) return;
        const dx = e.clientX - drag.current.lastX, dy = e.clientY - drag.current.lastY;
        drag.current.lastX = e.clientX; drag.current.lastY = e.clientY;
        drag.current.moved += Math.abs(dx) + Math.abs(dy);
        const c = cell.current;
        center.current.x -= dx / c;  // drag right → view west
        center.current.y += dy / c;  // drag down → view north (y is north-up)
    }
    function onPointerUp(e: React.PointerEvent) {
        const wasClick = drag.current.on && drag.current.moved < 5;
        drag.current.on = false;
        if (!wasClick || !loader) return;
        const rect = canvasRef.current!.getBoundingClientRect();
        const W = rect.width, H = rect.height;
        const c = cell.current, cx = center.current.x, cy = center.current.y;
        const u = cx + (e.clientX - rect.left - W / 2) / c;
        const v = cy + (H / 2 - (e.clientY - rect.top)) / c;
        const bx = Math.floor(u), by = Math.floor(v);
        const [rangeX, rangeY] = loader.worldRange;
        if (bx < 1 || by < 1 || bx > rangeX || by > rangeY) { setSelected(null); return; }
        setSelected(cache.current.get(`${bx}_${by}`) ?? { x: bx, y: by, occupied: false, count: 0, game: 0, elevation: 0 });
    }
    function onWheel(e: React.WheelEvent) {
        const rect = canvasRef.current!.getBoundingClientRect();
        const W = rect.width, H = rect.height;
        const c0 = cell.current;
        const c1 = Math.max(MIN_CELL, Math.min(MAX_CELL, c0 * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        if (c1 === c0) return;
        // cursor-anchored zoom: keep the block under the pointer fixed.
        const px = e.clientX - rect.left, py = e.clientY - rect.top;
        const u = center.current.x + (px - W / 2) / c0;
        const v = center.current.y + (H / 2 - py) / c0;
        center.current.x = u - (px - W / 2) / c1;
        center.current.y = v - (H / 2 - py) / c1;
        cell.current = c1;
    }
    function recenter() {
        if (!loader) return;
        const [bx, by] = loader.playerState.block;
        center.current = { x: bx + 0.5, y: by + 0.5 };
    }

    if (!open) return null;

    return (
        <div className="absolute inset-0 z-40 bg-black/85 flex flex-col" data-testid="map2d">
            <div className="flex items-center justify-between px-4 py-2 border-b border-cyan-500/30">
                <span className="text-[11px] font-black tracking-[0.3em] text-cyan-300/80 uppercase">2D World Map</span>
                <div className="flex items-center gap-2">
                    <button
                        data-testid="map2d-reset"
                        onClick={recenter}
                        className="px-3 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase text-cyan-200 bg-cyan-500/20 border border-cyan-400/50 hover:bg-cyan-500/35 transition-all"
                    >定位玩家 · Reset</button>
                    <button
                        data-testid="map2d-close"
                        onClick={onClose}
                        className="px-3 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase text-gray-300 bg-white/10 border border-white/20 hover:bg-white/20 transition-all"
                    >关闭 · Close</button>
                </div>
            </div>

            <div ref={wrapRef} className="relative flex-1 overflow-hidden cursor-grab active:cursor-grabbing">
                <canvas
                    ref={canvasRef}
                    data-testid="map2d-canvas"
                    className="absolute inset-0 w-full h-full touch-none"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerLeave={() => { drag.current.on = false; }}
                    onWheel={onWheel}
                />

                {/* legend */}
                <div className="absolute bottom-3 left-3 bg-black/60 border border-white/15 rounded-lg px-3 py-2 text-[10px] font-mono text-gray-300 flex flex-col gap-1 pointer-events-none">
                    <span><span className="inline-block w-2.5 h-2.5 align-middle mr-1.5" style={{ background: 'rgba(50,220,120,0.6)' }} />可玩区 game zone</span>
                    <span><span className="inline-block w-2.5 h-2.5 align-middle mr-1.5" style={{ background: 'rgba(0,200,255,0.6)' }} />有内容 occupied</span>
                    <span><span className="inline-block w-2.5 h-2.5 align-middle mr-1.5" style={{ background: '#ffd23f' }} />玩家 player · 拖拽平移 · 滚轮缩放</span>
                </div>

                {/* selected block inspect */}
                {selected && (
                    <div data-testid="map2d-inspect" className="absolute top-3 right-3 bg-cyan-900/80 backdrop-blur-md border border-cyan-400/50 p-3 rounded-lg shadow-2xl text-white font-mono text-xs min-w-[170px]">
                        <p className="text-[10px] text-cyan-300 font-bold uppercase mb-1">Block</p>
                        <p>坐标 Coord: <span className="text-cyan-400">[{selected.x}, {selected.y}]</span></p>
                        <p>内容 Adjuncts: <span className="text-cyan-400">{selected.count}</span></p>
                        <p>可玩 Game: <span className={selected.game >= 1 ? 'text-green-400' : 'text-gray-400'}>{selected.game >= 1 ? 'yes' : 'no'}</span></p>
                        <p>海拔 Elev: <span className="text-cyan-400">{selected.elevation}</span></p>
                        <button
                            onClick={() => setSelected(null)}
                            className="mt-2 w-full py-1 text-[10px] bg-white/10 text-gray-300 rounded border border-white/20 hover:bg-white/20"
                        >清除 Clear</button>
                    </div>
                )}
            </div>
        </div>
    );
}
