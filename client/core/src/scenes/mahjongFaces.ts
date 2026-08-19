// Readable mahjong tile faces — the content side of the native 3D table.
//
// We draw a legible image for each of the 34 tile kinds, then INGEST each into
// the engine's content-addressed store (mock CAS / IPFS) to get a CID. The
// MahjongSystem references faceCids[kind] in box slot 7, so a face-up tile shows
// its kind on the felt. This is the modern form of the old "string[] → IPFS →
// index" path: art is addressed by CID, looked up by kind index.
//
// The art is drawn to look like a MAHJONG TILE, not like a debug label — an
// earlier pass rendered `1 man` / `E wind` in sans-serif, which read fine in a
// test assertion and looked like nothing at all on a table. Two decisions carry
// that:
//
//   · Circles (筒) and bamboo (索) are pure VECTOR art — concentric rings and
//     jointed green canes in the traditional layouts (1 through 9 each have their
//     own arrangement, and 1索 is the bird). These need no font at all, which is
//     most of the deck.
//   · Characters (萬) and honours (東南西北中發白) need CJK glyphs. We use the
//     system font and CHECK it resolved (`hasCjk`) — a headless box without CJK
//     fonts would otherwise draw tofu boxes. On failure those eight kinds fall
//     back to the old latin markers: degraded, never broken.
//
// Aspect: 192×256 (3:4) matches the physical tile face (0.24 × 0.34 m), so the
// engine's `material.fit` maps it on without stretching.

const FACE_W = 192;
const FACE_H = 256;

/** Minimal CAS surface (engine.ipfs / IpfsRouter): store bytes, get a CID. */
interface CasPut { put(bytes: Uint8Array): Promise<string>; }

const IVORY = '#f6f1e0';
const IVORY_SHADE = '#e3dcc4';
const ENGRAVE = '#2f2a20';
const RED = '#b3271e';
const GREEN = '#17703a';
const BLUE = '#1e5aa8';

const CN_DIGITS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const WINDS = ['東', '南', '西', '北'];
const WIND_FALLBACK = ['E', 'S', 'W', 'N'];

/** Does this canvas have a CJK font? Compare a glyph's advance against the
 *  notdef box — identical widths mean everything is rendering as tofu. */
function hasCjk(ctx: CanvasRenderingContext2D): boolean {
    ctx.save();
    ctx.font = '100px serif';
    const cjk = ctx.measureText('萬').width;
    const missing = ctx.measureText('￿').width;
    ctx.restore();
    return cjk > 0 && Math.abs(cjk - missing) > 1;
}

/** Tile blank: ivory face, soft bevel, thin engraved border. */
function drawBlank(ctx: CanvasRenderingContext2D): void {
    const r = 18;
    ctx.fillStyle = IVORY;
    roundRect(ctx, 0, 0, FACE_W, FACE_H, r);
    ctx.fill();
    // Bevel — light from the top-left, so the face reads as carved not printed.
    const g = ctx.createLinearGradient(0, 0, FACE_W * 0.6, FACE_H);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.45, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(120,105,70,0.16)');
    ctx.fillStyle = g;
    roundRect(ctx, 0, 0, FACE_W, FACE_H, r);
    ctx.fill();
    ctx.strokeStyle = IVORY_SHADE;
    ctx.lineWidth = 7;
    roundRect(ctx, 5, 5, FACE_W - 10, FACE_H - 10, r - 5);
    ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/** Centred glyph with a faint engraved shadow. */
function glyph(ctx: CanvasRenderingContext2D, ch: string, cx: number, cy: number, px: number, colour: string): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${px}px "PingFang SC", "Hiragino Sans GB", "Heiti SC", "STHeiti", "Songti SC", "Noto Sans CJK SC", "Microsoft YaHei", serif`;
    ctx.fillStyle = 'rgba(90,78,52,0.28)';
    ctx.fillText(ch, cx + 2, cy + 3);
    ctx.fillStyle = colour;
    ctx.fillText(ch, cx, cy);
    ctx.restore();
}

// ── suit layouts ─────────────────────────────────────────────────────────────

/** Where the n pips sit, in 0..1 face coordinates, per rank (traditional). */
const PIP_LAYOUT: [number, number][][] = [
    [[0.5, 0.5]],                                                                   // 1
    [[0.5, 0.28], [0.5, 0.72]],                                                     // 2
    [[0.28, 0.22], [0.5, 0.5], [0.72, 0.78]],                                       // 3
    [[0.3, 0.28], [0.7, 0.28], [0.3, 0.72], [0.7, 0.72]],                           // 4
    [[0.28, 0.24], [0.72, 0.24], [0.5, 0.5], [0.28, 0.76], [0.72, 0.76]],           // 5
    [[0.3, 0.22], [0.7, 0.22], [0.3, 0.5], [0.7, 0.5], [0.3, 0.78], [0.7, 0.78]],   // 6
    [[0.28, 0.18], [0.5, 0.28], [0.72, 0.38], [0.3, 0.6], [0.7, 0.6], [0.3, 0.84], [0.7, 0.84]], // 7
    [[0.3, 0.18], [0.7, 0.18], [0.3, 0.39], [0.7, 0.39], [0.3, 0.61], [0.7, 0.61], [0.3, 0.82], [0.7, 0.82]], // 8
    [[0.26, 0.2], [0.5, 0.2], [0.74, 0.2], [0.26, 0.5], [0.5, 0.5], [0.74, 0.5], [0.26, 0.8], [0.5, 0.8], [0.74, 0.8]], // 9
];

/** One 筒 pip: concentric rings, the traditional blue/red coin. */
function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, big: boolean): void {
    ctx.save();
    ctx.lineWidth = Math.max(2, r * 0.16);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = big ? '#f0e6cc' : '#dce7f4';
    ctx.fill();
    ctx.strokeStyle = BLUE; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * 0.52, 0, Math.PI * 2);
    ctx.fillStyle = big ? RED : BLUE;
    ctx.fill();
    if (big) {                                     // 1筒 gets the extra outer ring
        ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
        ctx.strokeStyle = GREEN; ctx.lineWidth = r * 0.1; ctx.stroke();
    }
    ctx.restore();
}

/** One 索 pip: a jointed bamboo cane. */
function drawCane(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, colour: string): void {
    const w = h * 0.44;
    ctx.save();
    ctx.fillStyle = colour;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, w * 0.42);
    ctx.fill();
    // node bands + a lighter core so the cane reads as bamboo, not a pill
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(1.5, h * 0.07);
    for (const t of [0.33, 0.67]) {
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y - h / 2 + h * t);
        ctx.lineTo(x + w / 2, y - h / 2 + h * t);
        ctx.stroke();
    }
    ctx.restore();
}

/** 1索 is a bird, not a cane — the one pictorial tile in the deck. */
function drawBird(ctx: CanvasRenderingContext2D): void {
    const cx = FACE_W / 2, cy = FACE_H / 2;
    ctx.save();
    // body
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 8, 30, 44, 0, 0, Math.PI * 2);
    ctx.fill();
    // head
    ctx.beginPath();
    ctx.arc(cx, cy - 46, 20, 0, Math.PI * 2);
    ctx.fill();
    // beak
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.moveTo(cx + 18, cy - 48);
    ctx.lineTo(cx + 40, cy - 40);
    ctx.lineTo(cx + 18, cy - 34);
    ctx.closePath();
    ctx.fill();
    // tail feathers
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    for (const a of [-0.45, -0.2, 0.05]) {
        ctx.beginPath();
        ctx.moveTo(cx - 12, cy + 44);
        ctx.quadraticCurveTo(cx - 40, cy + 66 + a * 40, cx - 52, cy + 86 + a * 30);
        ctx.stroke();
    }
    // wing detail + eye
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(cx + 4, cy + 6, 14, 26, 0.25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = ENGRAVE;
    ctx.beginPath();
    ctx.arc(cx - 6, cy - 50, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawFace(ctx: CanvasRenderingContext2D, kind: number, cjk: boolean): void {
    drawBlank(ctx);
    const rank = (kind % 9) + 1;

    if (kind < 9) {                                  // 萬 — number over the character
        if (cjk) {
            glyph(ctx, CN_DIGITS[rank - 1], FACE_W / 2, FACE_H * 0.31, 96, ENGRAVE);
            glyph(ctx, '萬', FACE_W / 2, FACE_H * 0.71, 96, RED);
        } else {
            glyph(ctx, String(rank), FACE_W / 2, FACE_H * 0.34, 110, ENGRAVE);
            glyph(ctx, 'W', FACE_W / 2, FACE_H * 0.72, 88, RED);
        }
        return;
    }
    if (kind < 18) {                                 // 筒 — coins
        const pips = PIP_LAYOUT[rank - 1];
        const r = rank === 1 ? 56 : Math.min(34, 150 / Math.sqrt(rank) * 0.42 + 14);
        for (const [px, py] of pips) drawCoin(ctx, px * FACE_W, py * FACE_H, r, rank === 1);
        return;
    }
    if (kind < 27) {                                 // 索 — bamboo (1索 = bird)
        if (rank === 1) { drawBird(ctx); return; }
        const pips = PIP_LAYOUT[rank - 1];
        const h = Math.min(70, 300 / rank + 24);
        // The middle column of 5索/9索 is traditionally red.
        pips.forEach(([px, py], i) => {
            const mid = (rank === 5 && i === 2) || (rank === 9 && (i === 3 || i === 4 || i === 5));
            drawCane(ctx, px * FACE_W, py * FACE_H, h, mid ? RED : GREEN);
        });
        return;
    }
    if (kind < 31) {                                 // 風 — winds
        const i = kind - 27;
        glyph(ctx, cjk ? WINDS[i] : WIND_FALLBACK[i], FACE_W / 2, FACE_H / 2, 132, ENGRAVE);
        return;
    }
    if (kind === 31) { glyph(ctx, cjk ? '中' : 'C', FACE_W / 2, FACE_H / 2, 138, RED); return; }
    if (kind === 32) { glyph(ctx, cjk ? '發' : 'F', FACE_W / 2, FACE_H / 2, 130, GREEN); return; }
    // 白板 — an empty tile with a blue frame, exactly as the real one is.
    ctx.save();
    ctx.strokeStyle = BLUE;
    ctx.lineWidth = 9;
    roundRect(ctx, 32, 44, FACE_W - 64, FACE_H - 88, 10);
    ctx.stroke();
    ctx.restore();
}

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const canvas = document.createElement('canvas');
    canvas.width = FACE_W;
    canvas.height = FACE_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('[mahjongFaces] 2D canvas context unavailable');
    return { canvas, ctx };
}

async function faceToPng(kind: number, cjk: boolean): Promise<Uint8Array> {
    const { canvas, ctx } = makeCanvas();
    drawFace(ctx, kind, cjk);
    const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
}

/** The tile BACK: jade green with a bevelled panel, so a concealed hand reads as
 *  a rack of tiles rather than a row of flat blocks. */
async function backToPng(): Promise<Uint8Array> {
    const { canvas, ctx } = makeCanvas();
    ctx.fillStyle = '#2e7d5b';
    roundRect(ctx, 0, 0, FACE_W, FACE_H, 18);
    ctx.fill();
    const g = ctx.createLinearGradient(0, 0, FACE_W, FACE_H);
    g.addColorStop(0, 'rgba(255,255,255,0.28)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = g;
    roundRect(ctx, 0, 0, FACE_W, FACE_H, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 6;
    roundRect(ctx, 18, 24, FACE_W - 36, FACE_H - 48, 12);
    ctx.stroke();
    const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Generate all 34 tile faces (plus the back at index 34) and ingest them into
 * the CAS; returns kind → CID.
 */
export async function generateMahjongFaceCids(ipfs: CasPut): Promise<string[]> {
    const { ctx } = makeCanvas();
    const cjk = hasCjk(ctx);
    if (!cjk) console.warn('[mahjongFaces] no CJK font available; 萬/字牌 fall back to latin markers.');
    const cids: string[] = [];
    for (let kind = 0; kind < 34; kind++) cids.push(await ipfs.put(await faceToPng(kind, cjk)));
    cids.push(await ipfs.put(await backToPng()));
    return cids;
}

/** Index of the tile-back image inside the array `generateMahjongFaceCids` returns. */
export const TILE_BACK_INDEX = 34;
