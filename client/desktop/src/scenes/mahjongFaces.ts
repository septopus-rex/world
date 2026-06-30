// Readable mahjong tile faces — the content side of native-game gap #1.
//
// We draw a small, legible image for each of the 34 tile kinds, then INGEST each
// into the engine's content-addressed store (mock CAS / IPFS) to get a CID. The
// MahjongSystem references faceCids[kind] in box slot 7, so a face-up tile shows
// its kind on the felt. This is the modern form of the old "string[] → IPFS →
// index" path: art is addressed by CID, looked up by kind index.
//
// Art is deliberately ASCII + colour (no CJK) so it renders identically across
// browsers/headless (no font dependency): suited tiles = big number + suit tag
// (man/pin/sou, red/blue/green); honours = wind letters (E/S/W/N) and dragon
// discs (red/green/hollow). Distinguishable and readable — enough to actually
// play, without hand-authoring 34 art files.

const FACE_PX = 128; // power-of-two → clean mipmaps, no NPOT texture warning

/** Minimal CAS surface (engine.ipfs / IpfsRouter): store bytes, get a CID. */
interface CasPut { put(bytes: Uint8Array): Promise<string>; }

const SUITS = [
    { lo: 0, hi: 8, color: '#b3271e', tag: 'man' },   // characters (萬)
    { lo: 9, hi: 17, color: '#1f6fd0', tag: 'pin' },  // circles (筒)
    { lo: 18, hi: 26, color: '#1f8f43', tag: 'sou' }, // bamboo (索)
];
const WINDS = ['E', 'S', 'W', 'N'];                    // 27..30
const DRAGONS = [                                      // 31..33
    { fill: '#b3271e', tag: 'red', hollow: false },
    { fill: '#1f8f43', tag: 'grn', hollow: false },
    { fill: '#cfcabb', tag: 'wht', hollow: true },
];

function drawFace(ctx: CanvasRenderingContext2D, kind: number): void {
    const S = FACE_PX;
    // Ivory tile face + thin border.
    ctx.fillStyle = '#f7f3e3';
    ctx.fillRect(0, 0, S, S);
    ctx.lineWidth = S * 0.05;
    ctx.strokeStyle = '#9a8f6a';
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, S - ctx.lineWidth, S - ctx.lineWidth);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const suit = SUITS.find((s) => kind >= s.lo && kind <= s.hi);
    if (suit) {
        ctx.fillStyle = suit.color;
        ctx.font = `bold ${Math.round(S * 0.6)}px sans-serif`;
        ctx.fillText(String(kind - suit.lo + 1), S / 2, S * 0.42);
        ctx.font = `bold ${Math.round(S * 0.2)}px sans-serif`;
        ctx.fillText(suit.tag, S / 2, S * 0.82);
        return;
    }
    if (kind >= 27 && kind <= 30) {
        ctx.fillStyle = '#333';
        ctx.font = `bold ${Math.round(S * 0.6)}px sans-serif`;
        ctx.fillText(WINDS[kind - 27], S / 2, S * 0.42);
        ctx.font = `bold ${Math.round(S * 0.18)}px sans-serif`;
        ctx.fillText('wind', S / 2, S * 0.82);
        return;
    }
    const d = DRAGONS[kind - 31];
    ctx.lineWidth = S * 0.06;
    ctx.beginPath();
    ctx.arc(S / 2, S * 0.42, S * 0.26, 0, Math.PI * 2);
    if (d.hollow) { ctx.strokeStyle = '#8a8470'; ctx.stroke(); }
    else { ctx.fillStyle = d.fill; ctx.fill(); }
    ctx.fillStyle = '#333';
    ctx.font = `bold ${Math.round(S * 0.18)}px sans-serif`;
    ctx.fillText(d.tag, S / 2, S * 0.82);
}

async function faceToPng(kind: number): Promise<Uint8Array> {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = FACE_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('[mahjongFaces] 2D canvas context unavailable');
    drawFace(ctx, kind);
    const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
}

/** Generate all 34 tile faces and ingest them into the CAS; returns kind → CID. */
export async function generateMahjongFaceCids(ipfs: CasPut): Promise<string[]> {
    const cids: string[] = [];
    for (let kind = 0; kind < 34; kind++) {
        cids.push(await ipfs.put(await faceToPng(kind)));
    }
    return cids;
}
