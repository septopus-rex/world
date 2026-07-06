import type { StylePack } from '@engine/core/spp/Variants';
import type { Faces, FaceLabel } from './StylePackPreviewLoader';
import { FACE_NAMES, type HlPoly } from './constants';
import { CollapseDial } from './CollapseDial';

/**
 * PreviewPane — the leftmost 3D 粒子 view. A DEFINITE calc() size keeps the canvas
 * container bounded (a plain flex-1 leaves height indefinite and the WebGL canvas
 * feeds back into an unbounded 2^n height). Overlays: the selected-face highlight
 * polygon, the six face labels (projected each frame), and the collapse dial.
 */
export function PreviewPane({ packId, cid, labels, hl, selFace, dial, pack, onSelectFace, onSetDialFace }: {
    packId: string;
    cid: string | null;
    labels: FaceLabel[];
    hl: HlPoly | null;
    selFace: number;
    dial: Faces;
    pack: StylePack;
    onSelectFace: (i: number) => void;
    onSetDialFace: (fi: number, state: number, ref: string) => void;
}) {
    return (
        <div className="relative overflow-hidden shrink-0" style={{ width: 'calc(100vw - 384px)', height: '100vh' }}>
            <div id="sp-preview" data-testid="sp-preview" className="w-full h-full overflow-hidden bg-neutral-900" />

            {hl?.front && hl.pts.length === 4 && (
                <svg data-testid="sp-face-highlight" className="absolute inset-0 w-full h-full pointer-events-none z-[5]">
                    <polygon points={hl.pts.map(p => `${p.x},${p.y}`).join(' ')} fill="#22d3ee" fillOpacity="0.3" stroke="#22d3ee" strokeOpacity="0.9" strokeWidth="2.5" />
                </svg>
            )}

            {labels.map((l, i) => l.front && (
                <button key={i} data-testid={`sp-facelabel-${i}`} onClick={() => onSelectFace(i)}
                    style={{ left: l.x, top: l.y }}
                    className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-bold pointer-events-auto ${selFace === i ? 'bg-cyan-400 text-black' : 'bg-black/55 text-cyan-200 border border-cyan-400/40 hover:bg-black/80'}`}>
                    {FACE_NAMES[i]}
                </button>
            ))}

            <div className="absolute top-3 left-3 text-[10px] text-neutral-500 pointer-events-none">SPP 粒子 · {packId} · 点面选面 · 拖拽旋转 · W/S 缩放</div>
            {cid && <div data-testid="sp-cid" className="absolute top-3 right-3 text-[10px] text-cyan-300 font-mono">CID: {cid}</div>}

            <CollapseDial dial={dial} pack={pack} selFace={selFace} onSelectFace={onSelectFace} onSetDialFace={onSetDialFace} />
        </div>
    );
}
