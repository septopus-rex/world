import { useRef } from 'react';
import type { StylePack } from '@engine/core/spp/Variants';
import type { Faces, FaceLabel } from './StylePackPreviewLoader';
import { FACE_NAMES, type HlPoly } from './constants';
import { CollapseDial } from './CollapseDial';

/** Ray-casting point-in-polygon (screen px). */
function inPoly(x: number, y: number, pts: Array<{ x: number; y: number }>): boolean {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], b = pts[j];
        if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

/**
 * PreviewPane — the leftmost 3D 粒子 view. A DEFINITE calc() size keeps the canvas
 * container bounded. The box reads as 6 FACE PANELS: every front face is outlined,
 * the SELECTED one filled cyan. Panels are visual only (pointer-events off) so
 * dragging the canvas still orbits; a click (no drag) hit-tests the projected
 * face polygons to SELECT a face directly in 3D. Face-name labels + the collapse
 * dial overlay it too.
 */
export function PreviewPane({ packId, cid, labels, faces, selFace, dial, pack, onSelectFace, onSetDialFace }: {
    packId: string;
    cid: string | null;
    labels: FaceLabel[];
    faces: Array<HlPoly | null>;
    selFace: number;
    dial: Faces;
    pack: StylePack;
    onSelectFace: (i: number) => void;
    onSetDialFace: (fi: number, state: number, ref: string) => void;
}) {
    const down = useRef<{ x: number; y: number } | null>(null);

    const onDown = (e: React.MouseEvent) => { down.current = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: React.MouseEvent) => {
        const d = down.current; down.current = null;
        if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return; // drag = orbit, not a pick
        const rect = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - rect.left, py = e.clientY - rect.top;
        for (let i = 0; i < faces.length; i++) {
            const f = faces[i];
            if (f?.front && f.pts.length === 4 && inPoly(px, py, f.pts)) { onSelectFace(i); return; }
        }
    };

    return (
        <div className="relative overflow-hidden shrink-0" style={{ width: 'calc(100vw - 384px)', height: '100vh' }}
            onMouseDown={onDown} onMouseUp={onUp}>
            <div id="sp-preview" data-testid="sp-preview" className="w-full h-full overflow-hidden bg-neutral-900" />

            {/* The 6 semi-transparent face panels + the selected-face highlight are
                REAL scene meshes (StylePackPreviewLoader) so they track the box with
                zero lag during orbit. Here we only reproject the labels + hit-test
                clicks against the projected face polygons. */}
            {labels.map((l, i) => l.front && (
                <button key={i} data-testid={`sp-facelabel-${i}`} onClick={() => onSelectFace(i)}
                    style={{ left: l.x, top: l.y }}
                    className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-bold pointer-events-auto ${selFace === i ? 'bg-cyan-400 text-black' : 'bg-black/55 text-cyan-200 border border-cyan-400/40 hover:bg-black/80'}`}>
                    {FACE_NAMES[i]}
                </button>
            ))}

            <div className="absolute top-3 left-3 text-[10px] text-neutral-500 pointer-events-none">SPP 粒子 · {packId} · 点面选中 · 拖拽旋转 · W/S 缩放</div>
            {cid && <div data-testid="sp-cid" className="absolute top-3 right-3 text-[10px] text-cyan-300 font-mono">CID: {cid}</div>}

            <CollapseDial dial={dial} pack={pack} selFace={selFace} onSelectFace={onSelectFace} onSetDialFace={onSetDialFace} />
        </div>
    );
}
