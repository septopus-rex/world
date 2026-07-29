/**
 * TextPlate — typesetting + painting for text ENGRAVED on a mesh face (the e4
 * book's cover title plate). The plugin declares `plate: {text}` on a part
 * (core, no DOM); this module turns it into pixels.
 *
 * Split deliberately in two:
 *   · `layoutPlateText` is PURE — it takes a measure callback, so the line
 *     breaking and the size fit are unit-testable in node with no canvas. That
 *     matters because "the title is too small to read" and "the title spills off
 *     the plate" are the only two ways this feature fails, and both are layout.
 *   · `paintPlate` needs a 2D context and is exercised by e2e.
 *
 * The size is SOLVED, never authored: plates differ in aspect (a book's is ~2:1)
 * and titles differ in length by 5× ("过山车" vs "㉑ 高斯泼溅 · AI 生成世界"). A
 * fixed font size would either clip the long ones or leave the short ones tiny,
 * so we take the largest size at which the text still fits — same instinct as a
 * real cover, where the typesetter sets the title to the width of the board.
 */

/** Result of fitting a string into a plate's text box. */
export interface PlateLayout {
    /** The wrapped lines, in order. */
    lines: string[];
    /** Font size the lines fit at, in canvas px. */
    fontPx: number;
    /** Baseline-to-baseline distance, in canvas px. */
    lineHeight: number;
}

export interface PlateLayoutOpts {
    /** Hard cap on lines — beyond ~3 a cover label reads as a paragraph. */
    maxLines?: number;
    /** Largest size to try, canvas px. Defaults to the box height (single line). */
    maxFontPx?: number;
    /** Floor; below this the fit gives up and lets the text overflow-shrink. */
    minFontPx?: number;
    /** Line box as a multiple of the font size. */
    lineGap?: number;
}

/** Width of a string at a given font size, in canvas px (ctx.measureText). */
export type MeasureText = (s: string, fontPx: number) => number;

/**
 * Split into break-able tokens. Latin runs and numbers stay whole (breaking
 * "agent" mid-word is worse than a shorter font); CJK and punctuation break per
 * character, which is how Chinese sets. Whitespace is its own token so a break
 * can eat it. Titles here mix all three ("② NPC · 自主 agent").
 */
export function tokenisePlateText(text: string): string[] {
    return text.match(/[A-Za-z0-9]+|\s+|[\s\S]/gu) ?? [];
}

/**
 * Fit `text` into a `boxW` × `boxH` text box at the largest size it will take.
 *
 * NOT "step the font size down until a greedy wrap fits" — that is the obvious
 * loop and it throws away a lot of size, because greedy wrapping is lopsided:
 * "㉑ 高斯泼溅 · AI 生成世界" packs to a full first line and a 3-character
 * second one, and the font is then pinned by that full line. Solving the other
 * way round — for each line COUNT, binary-search the narrowest line width that
 * still wraps into that many lines, which is the balanced break — gave 45 px
 * where the greedy loop gave 31 on the reference book plate.
 *
 * Token widths are measured ONCE at a reference size and scaled: canvas advance
 * widths are linear in font size to far better than the padding we leave, and it
 * turns hundreds of measureText calls into one per token.
 */
export function layoutPlateText(
    text: string,
    boxW: number,
    boxH: number,
    measure: MeasureText,
    opts: PlateLayoutOpts = {},
): PlateLayout {
    const maxLines = Math.max(1, opts.maxLines ?? 3);
    const lineGap = opts.lineGap ?? 1.22;
    const maxFont = Math.max(1, Math.floor(opts.maxFontPx ?? boxH));
    const minFont = Math.min(maxFont, Math.max(1, Math.floor(opts.minFontPx ?? 8)));

    const tokens = tokenisePlateText(text);
    const REF = 100;
    /** Width of each token per 1 px of font size. */
    const unit = tokens.map((t) => measure(t, REF) / REF);
    const words = toWords(tokens, unit);
    if (words.length === 0) return { lines: [''], fontPx: minFont, lineHeight: minFont * lineGap };

    // Best (font size, line width) over the allowed line counts. More lines buys
    // width but costs height; whichever wins on font size wins.
    let best: { font: number; limit: number } | null = null;
    for (let n = 1; n <= maxLines; n++) {
        const limit = narrowestWidthFor(words, n);
        if (!Number.isFinite(limit) || limit <= 0) continue;
        const font = Math.min(boxW / limit, boxH / (n * lineGap));
        if (!best || font > best.font) best = { font, limit };
    }

    const fontPx = Math.max(minFont, Math.min(maxFont, Math.floor(best?.font ?? minFont)));
    // Break at the BALANCED width, not at whatever the box happens to allow at this
    // size. When height is the binding constraint (a short title on a squat plate)
    // the box is much wider than the balanced line, and re-wrapping against the box
    // packs the first line full and orphans the tail: "① 几何 · 纹" / "理".
    // Fall back to the box width only when the font was clamped UP by minFont —
    // there the balanced width no longer holds and overflowing beats vanishing.
    const limit = best && fontPx <= best.font ? best.limit : boxW / fontPx;
    const lines = wrapWords(words, limit, maxLines);
    // A title too long to fit even at the floor size gets clipped to the cap rather
    // than growing the block past the plate — a plaque with text running off its
    // edge reads as broken, a plaque with a truncated title reads as a plaque.
    if (lines.length > maxLines) lines.length = maxLines;
    return { lines, fontPx, lineHeight: fontPx * lineGap };
}

/**
 * A whitespace-delimited word, plus the separator that preceded it and its
 * per-character pieces (the last resort when one word is wider than a line).
 */
interface Word {
    text: string;
    w: number;
    sep: string;
    sepW: number;
    parts: Array<{ text: string; w: number }>;
}

/** Group tokens into words; whitespace ends the current word and is remembered. */
function toWords(tokens: string[], unit: number[]): Word[] {
    const words: Word[] = [];
    let cur: Word | null = null;
    let sep = '', sepW = 0;
    for (let i = 0; i < tokens.length; i++) {
        if (/^\s+$/.test(tokens[i])) { cur = null; sep += tokens[i]; sepW += unit[i]; continue; }
        if (!cur) {
            cur = { text: '', w: 0, sep, sepW, parts: [] };
            words.push(cur);
            sep = ''; sepW = 0;
        }
        cur.text += tokens[i];
        cur.w += unit[i];
        cur.parts.push({ text: tokens[i], w: unit[i] });
    }
    return words;
}

/**
 * Narrowest line width (in units of font size) that still wraps into `n` lines
 * or fewer. Binary search is valid because greedy wrapping is monotone: a wider
 * line never produces more lines.
 *
 * The floor is the WIDEST WORD, not the widest character, and that bound is the
 * whole point. Searching below it lets the solver buy width by breaking inside a
 * word, and it will: "八爪印记 · 残卷" fits two lines at 3.83 ems by splitting
 * 印/记, versus 4.0 by breaking at the space. Three per cent narrower, and it
 * reads as a typo on the cover of a book. Below this floor a word only ever
 * breaks because it cannot fit a line at all (handled in wrapWords).
 */
function narrowestWidthFor(words: Word[], n: number): number {
    let lo = Math.max(0, ...words.map((w) => w.w));
    const hi0 = words.reduce((a, w) => a + w.w + w.sepW, 0);
    if (hi0 <= 0) return 0;
    if (wrapWords(words, lo, n).length <= n) return lo;
    let hi = Math.max(lo, hi0);
    for (let i = 0; i < 32; i++) {
        const mid = (lo + hi) / 2;
        if (wrapWords(words, mid, n).length <= n) hi = mid; else lo = mid;
    }
    return hi;
}

/**
 * Greedy word wrap in units of font size. Bails out early once it exceeds
 * `maxLines` (every caller only needs to know that it did not fit). A word wider
 * than a whole line is split per character — which for CJK is normal setting,
 * and for Latin never happens because a Latin run is a single indivisible part.
 */
function wrapWords(words: Word[], limit: number, maxLines: number): string[] {
    const lines: string[] = [];
    let cur = '', curW = 0;
    const flush = () => { if (cur !== '') { lines.push(cur); cur = ''; curW = 0; } };
    for (const word of words) {
        const sep = cur === '' ? '' : word.sep;          // no line starts with a space
        const sepW = cur === '' ? 0 : word.sepW;
        if (curW + sepW + word.w <= limit) {
            cur += sep + word.text;
            curW += sepW + word.w;
            continue;
        }
        flush();
        if (lines.length > maxLines) return lines;       // early out — callers test the count
        if (word.w <= limit) { cur = word.text; curW = word.w; continue; }
        for (const p of word.parts) {
            if (cur !== '' && curW + p.w > limit) {
                flush();
                if (lines.length > maxLines) return lines;
            }
            cur += p.text;
            curW += p.w;
        }
    }
    flush();
    return lines.length > 0 ? lines : [''];
}

/**
 * Palette — a pale label with dark ink, NOT gilt on dark leather.
 *
 * The obvious treatment for a leather tome is a dark field with gilt letters,
 * and it was the first one here. It fails on physics: a book's covers are
 * VERTICAL faces, so even at noon the sun grazes them and the plate is lit
 * almost entirely by the 0.32 IBL term. Measured on the demo book, dark-on-dark
 * came back at mean luma 1.3 out of 255 — a black rectangle with a hint of warm
 * in it. Legibility on an unlit face has to come from the FIELD catching what
 * light there is, with the letters subtracting from it; the same plate as an
 * ivory bookplate reads in every lighting state the world has, including night.
 * (e2e book-cover-title.spec.ts samples exactly this.)
 */
const FIELD_TOP = '#f0e4c8';
const FIELD_BOTTOM = '#d8c6a0';
const RULE = '90,62,30';
const INK_DARK = '#33200f';
const INK_LIGHT = '#5b3d1e';

/**
 * Paint an ink-on-ivory title plate into a 2D context sized `w` × `h`, and
 * return the layout it used (so callers/tests can see the solved font size).
 *
 * The treatment is a bookbinder's label: a pale field, a double rule inset from
 * the edge, and dark letters with a hairline light edge below (the highlight sits
 * UNDER the stroke because the letters read as pressed INTO the label, not raised
 * off it). The double rule is doing real work — it gives the plate a border at
 * every viewing distance, so even when the text is too far to read the object
 * still says "there is a title here", which is the job the floating label used to
 * do, minus the shouting.
 */
export function paintPlate(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    text: string,
    fontFamily = '"Georgia","Songti SC","Noto Serif CJK SC","SimSun",serif',
): PlateLayout {
    const field = ctx.createLinearGradient(0, 0, 0, h);
    field.addColorStop(0, FIELD_TOP);
    field.addColorStop(1, FIELD_BOTTOM);
    ctx.fillStyle = field;
    ctx.fillRect(0, 0, w, h);

    // Double rule.
    const rule = (inset: number, width: number, alpha: number) => {
        ctx.strokeStyle = `rgba(${RULE},${alpha})`;
        ctx.lineWidth = width;
        ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
    };
    rule(h * 0.07, Math.max(1, h * 0.022), 0.8);
    rule(h * 0.135, Math.max(1, h * 0.01), 0.45);

    // Text box: inside the inner rule, with breathing room.
    const padX = h * 0.22, padY = h * 0.2;
    const boxW = Math.max(1, w - padX * 2);
    const boxH = Math.max(1, h - padY * 2);

    const measure: MeasureText = (s, fontPx) => {
        ctx.font = `bold ${fontPx}px ${fontFamily}`;
        return ctx.measureText(s).width;
    };
    const layout = layoutPlateText(text, boxW, boxH, measure, {
        maxLines: 3,
        maxFontPx: Math.floor(boxH),
        minFontPx: 8,
    });

    ctx.font = `bold ${layout.fontPx}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ink = ctx.createLinearGradient(0, h * 0.25, 0, h * 0.85);
    ink.addColorStop(0, INK_DARK);
    ink.addColorStop(1, INK_LIGHT);

    const block = layout.lines.length * layout.lineHeight;
    let y = h / 2 - block / 2 + layout.lineHeight / 2;
    for (const line of layout.lines) {
        // Light edge first, BELOW the stroke: type stamped into a label catches a
        // highlight on its lower lip. Offsetting a dark shadow instead would read
        // as letters floating above the plate.
        ctx.fillStyle = 'rgba(255,248,228,0.7)';
        ctx.fillText(line, w / 2 + layout.fontPx * 0.02, y + layout.fontPx * 0.05);
        ctx.fillStyle = ink;
        ctx.fillText(line, w / 2, y);
        y += layout.lineHeight;
    }
    return layout;
}
