import { describe, it, expect } from 'vitest';
import { layoutPlateText, tokenisePlateText, type MeasureText } from '../../src/render/TextPlate';

// ─── Book cover title plate — the typesetting half (2026-07-29) ─────────────
//
// The e4 book's title used to hang over the tome on a billboard sprite; it now
// sits engraved on the cover plate, which means the string has to be FITTED:
// plates are ~2:1 and shipped titles run from 3 characters ("过山车") to 16
// ("㉑ 高斯泼溅 · AI 生成世界"). Two failure modes, both pure layout, both
// pinned here because neither is visible in a node render test:
//   · the title spills off the plate (font solved too large / wrap too wide);
//   · the title is technically inside the plate and far too small to read.
//
// `measure` is injected, so this runs with no canvas. The stand-in matches how
// a CJK-capable font actually behaves: ideographs are one em square, Latin is
// about half, spaces about a third — which is all the solver depends on.
const measure: MeasureText = (s, fontPx) => {
    let w = 0;
    for (const ch of s) {
        if (/\s/.test(ch)) w += 0.3;
        else if (/[\x20-\x7e]/.test(ch)) w += 0.5;   // Latin / digits / ASCII punctuation
        else w += 1;                                 // CJK, ①..㉑, · — full-width
    }
    return w * fontPx;
};

/** The reference book plate: 0.504 m × 0.252 m at MediaScreens' 192 px canvas
 *  height, minus paintPlate's padding. Keep in sync with paintPlate if that
 *  padding moves — these numbers are what "readable on the shipped books" means. */
const H = 192, W = Math.round(H * 2);
const BOX_W = W - H * 0.22 * 2;
const BOX_H = H - H * 0.2 * 2;

const fit = (text: string) => layoutPlateText(text, BOX_W, BOX_H, measure, { maxLines: 3, minFontPx: 8 });

/** Width of a laid-out line, in canvas px. */
const lineWidth = (line: string, fontPx: number) => measure(line, fontPx);

describe('plate typesetting — the fitted text stays inside the plate', () => {
    const TITLES = [
        '过山车', '跑酷塔', '流式论', '印玺考', '宫殿营造记',
        '⑪ 水 · 光', '⑧ 空间音频', '⑳ 传送广场', '① 几何 · 纹理',
        '⑮ 生成器 spawner', '⑬ 换装 · 更多去处', '⑲ 外部游戏 · 德州扑克',
        '② NPC · 自主 agent', '㉑ 高斯泼溅 · AI 生成世界',
    ];

    for (const title of TITLES) {
        it(`"${title}" fits the plate box`, () => {
            const { lines, fontPx, lineHeight } = fit(title);
            expect(lines.length).toBeLessThanOrEqual(3);
            for (const line of lines) {
                expect(lineWidth(line, fontPx), `line "${line}" overflows`).toBeLessThanOrEqual(BOX_W + 0.5);
            }
            expect(lines.length * lineHeight).toBeLessThanOrEqual(BOX_H + 0.5);
        });

        it(`"${title}" keeps every character (wrapping never drops text)`, () => {
            const { lines } = fit(title);
            const strip = (s: string) => s.replace(/\s+/g, '');
            expect(strip(lines.join(''))).toBe(strip(title));
        });
    }

    it('the longest shipped title still lands at a readable size', () => {
        // 45 px of a 192 px canvas over a 0.252 m plate ≈ 0.059 m of glyph, which
        // reads from ~3 m — a book you have walked up to. The floor is here to
        // catch a regression to greedy line-breaking, which solved this exact
        // title at 31 px (a third smaller) by packing the first line full.
        const { fontPx, lines } = fit('㉑ 高斯泼溅 · AI 生成世界');
        expect(lines.length).toBe(2);
        expect(fontPx).toBeGreaterThanOrEqual(42);
    });

    it('breaks lines evenly — no orphan tail line', () => {
        // The balanced break is what the font size was SOLVED against; wrapping at
        // the box width instead (which is far wider whenever height is the binding
        // constraint) packs line 1 full and drops one character onto line 2 —
        // "① 几何 · 纹" / "理". Same size, visibly worse.
        for (const title of TITLES) {
            const { lines, fontPx } = fit(title);
            if (lines.length < 2) continue;
            const widths = lines.map((l) => lineWidth(l, fontPx));
            expect(Math.min(...widths), `"${title}" wrapped to ${JSON.stringify(lines)}`)
                .toBeGreaterThan(Math.max(...widths) * 0.5);
        }
    });

    it('a short title is set LARGER than a long one (the size is solved, not fixed)', () => {
        expect(fit('过山车').fontPx).toBeGreaterThan(fit('② NPC · 自主 agent').fontPx);
    });

    it('a short title takes one line and fills the plate height', () => {
        const { lines, fontPx } = fit('过山车');
        expect(lines).toEqual(['过山车']);
        expect(fontPx).toBeGreaterThan(BOX_H * 0.6);
    });
});

describe('plate typesetting — line breaking', () => {
    it('breaks between tokens, never inside a Latin word', () => {
        const { lines } = layoutPlateText('⑮ 生成器 spawner', 120, 200, measure, { maxLines: 3 });
        expect(lines.length).toBeGreaterThan(1);
        expect(lines.some((l) => l.includes('spawner'))).toBe(true);
        expect(lines.some((l) => /spawn$|^er/.test(l))).toBe(false);
    });

    it('breaks between ideographs when one word cannot fit a line', () => {
        // Pinned font size, so the box really is too narrow — otherwise the solver
        // would just set it smaller and keep the word whole (which it prefers).
        const { lines } = layoutPlateText('宫殿营造记', 3.5 * 20, 200, measure,
            { maxLines: 3, maxFontPx: 20, minFontPx: 20 });
        expect(lines.length).toBeGreaterThan(1);
        expect(lines.join('')).toBe('宫殿营造记');
    });

    it('prefers the space over splitting a word, even when splitting is narrower', () => {
        // "八爪印记 · 残卷" fits two lines 3 % narrower by breaking 印/记 — and that
        // reads as a typo on a book cover. The solver may not buy width that way.
        const { lines } = fit('八爪印记 · 残卷');
        expect(lines[0]).toBe('八爪印记');
        expect(lines.join(' ')).toContain('残卷');
    });

    it('no line starts with a space', () => {
        for (const l of fit('② NPC · 自主 agent').lines) expect(l).not.toMatch(/^\s/);
    });

    it('a single token wider than the line gets its own line instead of looping', () => {
        const { lines } = layoutPlateText('supercalifragilistic x', 10, 200, measure, { maxLines: 3, maxFontPx: 20 });
        expect(lines[0]).toBe('supercalifragilistic');
    });

    it('empty text degrades to an empty line rather than throwing', () => {
        expect(() => layoutPlateText('', 100, 50, measure)).not.toThrow();
        expect(layoutPlateText('', 100, 50, measure).lines).toEqual(['']);
    });

    it('honours the line cap even when the text cannot fit', () => {
        const { lines } = layoutPlateText('一二三四五六七八九十一二三四五六七八九十', 40, 40, measure, { maxLines: 2 });
        expect(lines.length).toBeLessThanOrEqual(2);
    });

    it('never solves below the floor size', () => {
        const { fontPx } = layoutPlateText('一二三四五六七八九十一二三四五六七八九十', 20, 20, measure, { minFontPx: 8 });
        expect(fontPx).toBeGreaterThanOrEqual(8);
    });
});

describe('plate typesetting — tokenisation', () => {
    it('keeps Latin runs whole and splits CJK per character', () => {
        expect(tokenisePlateText('AI 生成')).toEqual(['AI', ' ', '生', '成']);
    });

    it('treats enclosed numerals as their own character', () => {
        expect(tokenisePlateText('①②')).toEqual(['①', '②']);
        expect(tokenisePlateText('㉑ 水')).toEqual(['㉑', ' ', '水']);
    });
});
