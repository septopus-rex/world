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
const SHEET_MS = 300;   // bottom-sheet slide duration (mirrors duration-300 below)

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
    // Sheet slide-in as a CSS ANIMATION, not a transition: an animation plays from
    // mount, so there is no "render at translate-y-full, flip on the next frame"
    // dance — and that dance needed requestAnimationFrame, which an idle headless
    // page starves (helpers.ts documents the same trap), leaving the sheet parked
    // off-screen while everything downstream measured it.
    // `settled` publishes the end of the slide as `data-settled`: anything
    // measuring the canvas (e2e hit-testing above all) must not aim at a moving
    // target. `animationend` is the PRIMARY signal — a bare duration timer assumes
    // the animation also STARTED on time, and on a loaded machine it doesn't, so
    // the flag flipped mid-slide and the measurement was taken against a moving
    // sheet anyway. The timer stays as a fallback (generous, since it must not
    // pre-empt a late-but-honest animation) for the case where no animation runs
    // at all and animationend therefore never fires — a hang is worse than slack.
    const [settled, setSettled] = useState(false);
    useEffect(() => {
        if (!open) { setSettled(false); return; }
        const t = window.setTimeout(() => setSettled(true), SHEET_MS * 6);
        return () => { window.clearTimeout(t); setSettled(false); };
    }, [open]);
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

    // Fast travel succeeded → the map's job is done; close and let the 3D take over.
    // (A denied teleport leaves the map open — the anchor's `when` said no.)
    useEffect(() => {
        if (!open || !loader?.engine) return;
        const done = () => onClose();
        loader.engine.on('teleport.done', done);
        return () => loader.engine?.off('teleport.done', done);
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

        // Selecting a cell BEFORE its fetch lands snapshots the empty fallback —
        // refresh the inspect panel once the real cell arrives (reference check:
        // one setSelected per landing, then they're identical).
        const sel = selectedRef.current;
        if (sel) {
            const fresh = cache.current.get(`${sel.x}_${sel.y}`);
            if (fresh && fresh !== sel) setSelected(fresh);
        }

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
                // Teleport anchors (fast-travel destinations) — a violet diamond
                // per anchor at its in-block position. Only streamed cells carry
                // anchors = "discovered" semantics (specs/teleport-portal.md §3).
                if (mc?.anchors?.length && c >= 8) {
                    ctx.fillStyle = '#c084fc';
                    for (const a of mc.anchors) {
                        const ax = sx(bx + a.e / 16), ay = sy(by + a.n / 16);
                        const r = Math.max(3, c * 0.16);
                        ctx.beginPath();
                        ctx.moveTo(ax, ay - r); ctx.lineTo(ax + r, ay); ctx.lineTo(ax, ay + r); ctx.lineTo(ax - r, ay);
                        ctx.closePath();
                        ctx.fill();
                    }
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
        // Stop the browser's native selection/drag: without this, a drag selects the
        // surrounding DOM text and shows a translucent drag-image ghost anchored at
        // the page origin (the "arrow drifting in from the top-left").
        e.preventDefault();
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
        setSelected(cache.current.get(`${bx}_${by}`) ?? { x: bx, y: by, occupied: false, count: 0, game: 0, elevation: 0, anchors: [] });
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

    // Bottom sheet, half the viewport — the world stays on screen above it, which
    // is the point of a map. (It used to take the whole screen.)
    return (
        // z-50, above the HUD rails: as a half-height sheet its top edge lands at
        // mid-screen, which is exactly where the desktop shell's right-hand mode
        // rail sits — at the old z-40 (a tie, and the rail renders later) the rail
        // painted over the header and swallowed clicks on ✕. A scrimmed sheet is a
        // modal surface anyway; the HUD belongs underneath it.
        <div className="absolute inset-0 z-50 select-none" data-testid="map2d">
            {/* Scrim over the visible world: dims it and dismisses on tap, so the
                sheet can't be left open swallowing clicks meant for the 3D. */}
            <div data-testid="map2d-scrim" onClick={onClose} className="absolute inset-0 bg-black/40" />

            <style>{`@keyframes map2d-rise{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
            <div data-testid="map2d-sheet" data-settled={settled ? '1' : '0'}
                onAnimationEnd={() => setSettled(true)}
                style={{ animation: `map2d-rise ${SHEET_MS}ms cubic-bezier(0.16,1,0.3,1)` }}
                className="absolute inset-x-0 bottom-0 h-1/2 min-h-[240px] flex flex-col rounded-t-2xl
                border-t border-cyan-500/30 bg-[#0a0e14]/95 shadow-[0_-8px_40px_rgba(0,0,0,0.55)]">
                {/* grab handle — the affordance that says "sheet", not "page" */}
                <div className="flex justify-center pt-2 pb-0.5"><div className="w-10 h-1 rounded-full bg-white/25" /></div>

                {/* Header sized for the narrowest shell (390 px): short labels and
                    nowrap, or the title and both buttons wrap onto two lines each. */}
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-cyan-500/25">
                    <span className="text-[11px] font-black tracking-[0.2em] text-cyan-300/80 uppercase whitespace-nowrap">2D Map</span>
                    <div className="flex items-center gap-2">
                        <button
                            data-testid="map2d-reset"
                            onClick={recenter}
                            className="px-3 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase whitespace-nowrap text-cyan-200 bg-cyan-500/20 border border-cyan-400/50 hover:bg-cyan-500/35 transition-all"
                        >定位</button>
                        <button
                            data-testid="map2d-close"
                            onClick={onClose}
                            aria-label="关闭地图"
                            className="w-7 h-7 grid place-items-center rounded-lg text-xs font-black text-gray-300 bg-white/10 border border-white/20 hover:bg-white/20 transition-all"
                        >✕</button>
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

                    {/* legend — one wrapping row: half a screen is too little height
                        to spend three stacked lines on a colour key */}
                    <div className="absolute bottom-2 left-2 right-2 bg-black/55 border border-white/15 rounded-lg px-2.5 py-1 text-[10px] font-mono text-gray-300 flex flex-wrap items-center gap-x-3 gap-y-0.5 pointer-events-none">
                        <span><span className="inline-block w-2.5 h-2.5 align-middle mr-1.5" style={{ background: 'rgba(50,220,120,0.6)' }} />可玩区</span>
                        <span><span className="inline-block w-2.5 h-2.5 align-middle mr-1.5" style={{ background: 'rgba(0,200,255,0.6)' }} />有内容</span>
                        <span><span className="inline-block w-2.5 h-2.5 align-middle mr-1.5" style={{ background: '#c084fc' }} />传送点</span>
                        <span><span className="inline-block w-2.5 h-2.5 align-middle mr-1.5" style={{ background: '#ffd23f' }} />玩家</span>
                        <span className="text-gray-500">拖拽平移 · 滚轮缩放</span>
                    </div>

                    {/* selected block inspect */}
                    {selected && (
                        <div data-testid="map2d-inspect" className="absolute top-3 right-3 bg-cyan-900/80 backdrop-blur-md border border-cyan-400/50 p-3 rounded-lg shadow-2xl text-white font-mono text-xs min-w-[170px]">
                            <p className="text-[10px] text-cyan-300 font-bold uppercase mb-1">Block</p>
                            <p>坐标 Coord: <span className="text-cyan-400">[{selected.x}, {selected.y}]</span></p>
                            <p>内容 Adjuncts: <span className="text-cyan-400">{selected.count}</span></p>
                            <p>可玩 Game: <span className={selected.game >= 1 ? 'text-green-400' : 'text-gray-400'}>{selected.game >= 1 ? 'yes' : 'no'}</span></p>
                            <p>海拔 Elev: <span className="text-cyan-400">{selected.elevation}</span></p>
                            {(selected.anchors?.length ?? 0) > 0 && (
                                <div className="mt-2 pt-2 border-t border-cyan-400/30">
                                    <p className="text-[10px] text-purple-300 font-bold uppercase mb-1">传送锚点 Anchors</p>
                                    {selected.anchors.map((a) => (
                                        <button
                                            key={a.name}
                                            data-testid={`map2d-travel-${a.name}`}
                                            onClick={() => loader?.fastTravel(a.name, [selected.x, selected.y])}
                                            className="mt-1 w-full py-1 text-[10px] bg-purple-500/20 text-purple-200 rounded border border-purple-400/40 hover:bg-purple-500/35"
                                        >⟡ {a.name} · 传送 Travel</button>
                                    ))}
                                </div>
                            )}
                            <button
                                onClick={() => setSelected(null)}
                                className="mt-2 w-full py-1 text-[10px] bg-white/10 text-gray-300 rounded border border-white/20 hover:bg-white/20"
                            >清除 Clear</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
