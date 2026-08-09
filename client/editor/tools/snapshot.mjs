#!/usr/bin/env node
/**
 * snapshot.mjs — look at an SPP 粒子 from every side, and run the contract guard.
 *
 * This is the EYES half of authoring a particle library. The guard
 * (OptionGuard) answers what a machine can decide — geometry out of its cell,
 * a 挡 that blocks nothing. Everything else ("does this read as a bulkhead?",
 * "is the panelling too busy?") needs looking, and looking needs pictures from
 * more than one side: a unit cell has six faces and a single 3/4 view shows
 * three of them.
 *
 * Usage:
 *   node tools/snapshot.mjs <pack.json> [--out DIR] [--views N] [--faces open|closed]
 *   node tools/snapshot.mjs --builtin terran --out /tmp/terran
 *
 * Assumes the editor dev server is reachable (npm run dev, port 7779); pass
 * --url to point elsewhere. Writes view-<i>.png + guard.json + pack.json into
 * OUT, and prints the guard report so a caller sees it without opening files.
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name, def) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));

const url = flag('url', 'http://127.0.0.1:7779/');
const out = resolve(flag('out', './snapshot-out'));
const views = Number(flag('views', 4));
const faceState = flag('faces', 'closed');           // which pool to collapse all six faces onto
const optionKey = flag('option', null);              // which option in that pool (default: the first)
const builtin = flag('builtin', null);
const house = flag('house', null);          // a cells JSON: preview a whole structure

const packPath = builtin
    ? resolve(HERE, `../../core/src/stylepacks/${builtin}.stylepack.json`)
    : positional[0] && resolve(positional[0]);
if (!packPath) {
    console.error('usage: node tools/snapshot.mjs <pack.json> [--out DIR] [--views N] [--faces open|closed]');
    process.exit(2);
}

const packJson = readFileSync(packPath, 'utf8');
const pack = JSON.parse(packJson);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const fail = (m) => { console.error(m); };
page.on('pageerror', (e) => fail(`[page error] ${e.message}`));

try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('sp-editor').waitFor({ timeout: 30_000 });

    // Feed the pack through the REAL import path, so what is photographed is
    // what the editor would be editing — not a side-loaded preview.
    await page.getByTestId('sp-acc-store').click();
    await page.getByTestId('sp-import-text').fill(packJson);
    await page.getByTestId('sp-import-btn').click();
    const err = page.getByTestId('sp-import-error');
    if (await err.count()) throw new Error(`import rejected: ${await err.textContent()}`);

    // --house: photograph a whole STRUCTURE built from this library instead of
    // the single editing cell. "Do these options actually collapse into a
    // building?" is a question about the library, and answering it by
    // hand-authoring a level each time is why option sets go unverified.
    if (house) {
        const cells = JSON.parse(readFileSync(resolve(house), 'utf8'));
        await page.evaluate((c) => window.spLoader?.setCells?.(c), cells);
        await page.addStyleTag({
            content: '[data-testid="sp-dial"],[data-testid^="sp-facelabel-"],#sp-preview>div:first-child{display:none!important}',
        });
        await page.waitForTimeout(1500);
        const shots = [];
        for (let i = 0; i < views; i++) {
            await page.evaluate(({ az, r }) => {
                const w = window.spLoader?.getEngine?.()?.getWorld?.();
                const cc = w?.systems?.findSystemByName('CharacterController');
                cc?.setObserveOrbit?.(az, 0.55, r);
            }, { az: (i / views) * Math.PI * 2 + 0.6, r: Number(flag('radius', 26)) });
            await page.waitForTimeout(400);
            const file = `${out}/house-${i}.png`;
            await page.locator('#sp-preview').screenshot({ path: file });
            shots.push(file);
        }
        console.log(`house     ${cells.length} cells → ${shots.join(' ')}`);
        console.log(`derived   ${await page.evaluate(() => window.spLoader?.derivedCount?.() ?? -1)}`);
        await browser.close();
        process.exit(0);
    }

    // Collapse all six faces onto the requested pool's first option, so the
    // photo shows one option from every angle instead of a mixture.
    await page.getByTestId('sp-acc-face').click();
    for (let f = 0; f < 6; f++) {
        await page.getByTestId(`sp-face-${f}`).click();
        await page.getByTestId(`sp-dial-state-${faceState === 'open' ? 'open' : 'closed'}`).click();
        // --option lets you photograph ONE option on all six faces. Without it a
        // pack's roof/deck/stair variants are invisible here: every face lands on
        // the pool's first entry, so `solid` is all you ever see.
        if (optionKey) await page.getByTestId('sp-dial-opt').selectOption(optionKey);
    }

    // Wait for the expansion to land before photographing anything.
    await page.waitForFunction(() => (window.spLoader?.derivedCount?.() ?? 0) >= 0, null, { timeout: 20_000 });

    // Hide the editor's own overlays. The subject is the GEOMETRY; a dial and
    // six face labels in every frame are noise a reviewer has to look past, and
    // they cover the lower third of the cell.
    if (flag('chrome', null) === null) {
        await page.addStyleTag({
            content: '[data-testid="sp-dial"],[data-testid^="sp-facelabel-"],#sp-preview>div:first-child{display:none!important}',
        });
    }
    await page.waitForTimeout(600);

    const shots = [];
    for (let i = 0; i < views; i++) {
        const azimuth = (i / views) * Math.PI * 2;
        await page.evaluate((az) => {
            const w = window.spLoader?.getEngine?.()?.getWorld?.();
            const cc = w?.systems?.findSystemByName('CharacterController');
            const st = cc?.getObserveState?.();
            // Keep the fitted radius/elevation; only spin around the cell.
            cc?.setObserveOrbit?.(az, st?.elevation ?? 0.5, st?.radius ?? 12);
        }, azimuth);
        await page.waitForTimeout(350);
        const file = `${out}/view-${i}.png`;
        await page.locator('#sp-preview').screenshot({ path: file });
        shots.push(file);
    }

    // The machine-checkable half, from the same engine code the editor shows.
    const guard = await page.evaluate(() => (window.__spGuard ? window.__spGuard() : null));

    const report = {
        pack: pack.id,
        source: packPath,
        faces: faceState,
        views: shots,
        derived: await page.evaluate(() => window.spLoader?.derivedCount?.() ?? -1),
        options: {
            closed: (pack.closed ?? []).map((v) => ({ key: v.key ?? v.name, parts: (v.parts ?? v.pieces ?? []).length })),
            open: (pack.open ?? []).map((v) => ({ key: v.key ?? v.name, parts: (v.parts ?? v.pieces ?? []).length })),
        },
        guard,
    };
    writeFileSync(`${out}/guard.json`, JSON.stringify(report, null, 2));
    writeFileSync(`${out}/pack.json`, packJson);

    console.log(`pack      ${pack.id}  (${packPath})`);
    console.log(`views     ${shots.length} → ${out}/view-*.png`);
    console.log(`derived   ${report.derived} adjuncts from the six faces`);
    for (const pool of ['closed', 'open']) {
        for (const o of report.options[pool]) console.log(`  ${pool.padEnd(6)} ${String(o.key).padEnd(14)} parts=${o.parts}`);
    }
    if (guard?.length) {
        console.log(`guard     ${guard.length} issue(s):`);
        for (const i of guard) console.log(`  ${i.level.toUpperCase().padEnd(5)} ${i.pool}/${i.variantKey}  ${i.code}  ${i.message}`);
    } else if (guard) {
        console.log('guard     clean');
    } else {
        console.log('guard     (not exposed by this build)');
    }
} finally {
    await browser.close();
}
