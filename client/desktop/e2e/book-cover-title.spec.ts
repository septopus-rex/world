import { test, expect } from '@playwright/test';
import { bootDeterministic } from './helpers';

/**
 * e4 book — the title on the COVER, under real GL.
 *
 * The book's title used to hang over the tome on a billboard sprite. Read from
 * the ground it looked like a quest marker parked in front of the world: a
 * caption floating in mid-air, brighter than the object it described, drawn over
 * everything because the sprite disables depth. It now sits engraved on the
 * cover plate (adjunct_book → PlateConfig → MediaScreens.attachTextPlate), which
 * is where a book carries its title.
 *
 * Three claims, each with its own way of being quietly false:
 *   1. the billboard is GONE (an untouched LABELED set would leave both);
 *   2. the canvas actually says the title, at a solved size (headless
 *      engine/tests/unit/text-plate.test.ts pins the typesetting arithmetic —
 *      this pins that the arithmetic ran against a real font);
 *   3. the canvas reaches the SCREEN. `fit` UVs, sRGB, the clone-on-write
 *      material and the texture upload are four separate ways to end up with a
 *      correct canvas and a blank plaque, and only a pixel can tell them apart.
 */

/** Everything the test wants to know about the demo book's covers. */
const bookPlates = (page: any) => page.evaluate(() => {
    const w = (window as any).loader.engine.getWorld();
    for (const eid of w.getEntitiesWith(['AdjunctComponent'])) {
        const std = w.getComponent(eid, 'AdjunctComponent')?.stdData;
        if (std?.typeId !== 0x00e4) continue;
        const handle = w.getComponent(eid, 'MeshComponent')?.handle;
        let sprites = 0;
        const plates: any[] = [];
        handle?.traverse?.((c: any) => {
            if (c.isSprite) sprites++;
            const p = c.userData?.__plate;
            if (!p) return;
            // Sample the canvas the texture was made from: dark ink strokes over
            // a pale field (see TextPlate's palette note on why not gilt-on-dark).
            const cv = p.texture.image as HTMLCanvasElement;
            const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
            let ink = 0, fieldLum = 0;
            for (let i = 0; i < d.length; i += 4) {
                const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                fieldLum += l;
                if (l < 110) ink++;
            }
            plates.push({
                text: p.text, fontPx: p.fontPx, lines: p.lines,
                canvas: [cv.width, cv.height],
                inkFrac: ink / (d.length / 4),
                meanLum: fieldLum / (d.length / 4),
                hasMap: c.material?.map === p.texture,
                isolated: !!(c.material as any).__isolated,
            });
        });
        return { title: std.title, sprites, plates };
    }
    return null;
});

test('e4 书本:标题烫在封面上,不再是头顶的浮空标签', async ({ page }) => {
    test.setTimeout(180_000);
    await bootDeterministic(page);

    const book = await bookPlates(page);
    expect(book, 'the demo scene has an e4 book').not.toBeNull();
    expect(book.title, 'the demo book is titled').toBeTruthy();

    // ── 1. the billboard is gone ─────────────────────────────────────────────
    expect(book.sprites, 'no floating label sprite left on the tome').toBe(0);

    // ── 2. both covers carry the engraved title ──────────────────────────────
    expect(book.plates.length, 'a plate on each cover').toBe(2);
    for (const p of book.plates) {
        expect(p.text, 'the plate carries the authored title').toBe(book.title);
        // Solved against a REAL font, so this is not the arithmetic test's claim:
        // a missing CJK face, a zero-width measure, or a canvas that never got a
        // font set all land here as a collapsed size.
        expect(p.fontPx, `title fitted at a legible size (${JSON.stringify(p.lines)})`).toBeGreaterThan(20);
        expect(p.lines.length, 'a cover title is not a paragraph').toBeLessThanOrEqual(3);
        expect(p.lines.join('').replace(/\s/g, ''), 'no characters lost in the wrap')
            .toBe(book.title.replace(/\s/g, ''));
        // Ink on a pale field: a blank plate has no ink, an unpainted (black)
        // canvas would be all ink. The pale field is load-bearing, not taste — it
        // is what makes the plate legible on an unlit vertical face.
        expect(p.inkFrac, 'the canvas has ink strokes').toBeGreaterThan(0.01);
        expect(p.inkFrac, 'and is not a solid dark rectangle').toBeLessThan(0.4);
        expect(p.meanLum, 'on a pale field (dark fields go black on a vertical face)').toBeGreaterThan(150);
        expect(p.hasMap, "the plate's material renders that canvas").toBe(true);
        expect(p.isolated, 'on a clone-on-write material (never the shared brass one)').toBe(true);
    }

    // ── 3. it reaches the screen ─────────────────────────────────────────────
    // Point the camera straight at one plate and sample it twice: once as
    // rendered, once with the map dropped. Nothing else in the frame changes, so
    // any difference is the engraved canvas arriving on the GPU. (The boot splash
    // is a translucent black sheet over the whole canvas — sampling through it
    // measures the sheet, so drop it first. And render TWICE before each read:
    // with preserveDrawingBuffer off, one out-of-rAF render leaves the PREVIOUS
    // frame readable, which shifts every sample one step down the sequence.)
    await page.evaluate(() => document.getElementById('init-loader')?.remove());
    const shot = await page.evaluate(() => {
        const w: any = (window as any).loader.engine.getWorld();
        const re: any = w.renderEngine;
        const cam = re.mainCameraInstance;
        const gl: HTMLCanvasElement = document.querySelector('canvas[data-engine]') as any
            ?? document.querySelector('canvas') as any;

        let plate: any = null, group: any = null;
        for (const eid of w.getEntitiesWith(['AdjunctComponent'])) {
            if (w.getComponent(eid, 'AdjunctComponent')?.stdData?.typeId !== 0x00e4) continue;
            group = w.getComponent(eid, 'MeshComponent')?.handle;
            group?.traverse?.((c: any) => { if (!plate && c.userData?.__plate) plate = c; });
            break;
        }
        if (!plate) return null;

        const V = () => plate.position.clone();          // a THREE.Vector3, no import
        const at = plate.getWorldPosition(V());
        // Outward normal = the plate's own thinnest axis, signed away from the
        // book's centre (the covers face opposite ways, so the sign is not fixed).
        const g = plate.geometry.parameters;
        const dims = [g.width, g.height, g.depth];
        const a = dims.indexOf(Math.min(...dims));
        const m = plate.matrixWorld.elements;
        const n = V().set(m[a * 4], m[a * 4 + 1], m[a * 4 + 2]).normalize();
        if (n.dot(at.clone().sub(group.getWorldPosition(V()))) < 0) n.negate();

        cam.position.copy(at.clone().addScaledVector(n, 0.9));
        cam.lookAt(at);
        cam.updateMatrixWorld(true);

        /**
         * Sample a 60×60 box at the plate's projected screen position.
         * Mean luma alone is not enough: the covers are vertical faces, so at
         * noon the sun grazes them and everything here is dim — absolute colour
         * says little. What separates "engraved" from "blank" robustly is
         * STRUCTURE: strokes give a spread of lumas and warm pixels, a bare
         * plaque is one flat tone.
         */
        const probe = () => {
            re.render(false); re.render(false);
            const ndc = at.clone().project(cam);
            const cx = (ndc.x * 0.5 + 0.5) * gl.width, cy = (-ndc.y * 0.5 + 0.5) * gl.height;
            const off = document.createElement('canvas');
            off.width = 60; off.height = 60;
            const ctx = off.getContext('2d')!;
            ctx.drawImage(gl, Math.floor(cx - 30), Math.floor(cy - 30), 60, 60, 0, 0, 60, 60);
            const d = ctx.getImageData(0, 0, 60, 60).data;
            const n2 = d.length / 4;
            const lum: number[] = [];
            let sum = 0, r = 0, b = 0;
            for (let i = 0; i < d.length; i += 4) {
                const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                lum.push(l); sum += l; r += d[i]; b += d[i + 2];
            }
            const mean = sum / n2;
            const sd = Math.sqrt(lum.reduce((a, l) => a + (l - mean) ** 2, 0) / n2);
            // Warmth as a RATIO, not a difference: the plate is dim enough that
            // "R exceeds B by N levels" measures the exposure, while R/B is the
            // material's own colour and survives however little light reaches it.
            return { mean, sd, warmth: r / Math.max(1, b) };
        };

        const engraved = probe();
        const map = plate.material.map;
        plate.material.map = null; plate.material.needsUpdate = true;
        const blank = probe();
        plate.material.map = map; plate.material.needsUpdate = true;   // restore

        // Leave the camera at a normal reading distance and re-render, so the
        // screenshot this spec saves shows the book as a player meets it rather
        // than the pressed-against-the-plate probe framing.
        cam.position.copy(at.clone().addScaledVector(n, 2.4));
        cam.position.y += 0.5;
        cam.lookAt(at);
        cam.updateMatrixWorld(true);
        re.render(false); re.render(false);
        return { engraved, blank };
    });

    expect(shot, 'a plate mesh to aim at').not.toBeNull();
    // eslint-disable-next-line no-console
    console.log('BOOK-PLATE-PIXELS', JSON.stringify(shot));
    const why = `engraved ${JSON.stringify(shot.engraved)} vs blank ${JSON.stringify(shot.blank)}`;
    // Dropping the map has to visibly change the pixels — if it does not, the
    // texture never made it to the GPU. The tell is STRUCTURE rather than a level
    // shift: an ivory label and a white-tinted plaque sit at similar brightness,
    // but strokes spread the luma and a bare plaque is one flat tone. Structure
    // also survives the plate being dim, which a vertical face at noon is.
    expect(shot.engraved.sd, `letters give the plate structure — ${why}`)
        .toBeGreaterThan(Math.max(2, shot.blank.sd * 2));
    // And what landed is warm: aged paper, not the neutral white-tinted plaque.
    expect(shot.engraved.warmth, `warm paper field — ${why}`).toBeGreaterThan(shot.blank.warmth * 1.1);
    // The plate must be LIT, not a black rectangle — the whole reason the field is
    // pale (mean 1.3/255 was the dark-field version, i.e. invisible).
    expect(shot.engraved.mean, `plate legible on an unlit cover face — ${why}`).toBeGreaterThan(10);

    await page.screenshot({ path: 'test-results/book-cover-title.png' });
});
