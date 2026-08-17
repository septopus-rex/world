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
 *   node tools/snapshot.mjs --builtin garden --prefab all      # the 组合件, not the faces
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
// --prefab: photograph the pack's 组合件 (§9) instead of its faces. `all` walks
// every one of them. A prefab belongs to no face, so the six-face collapse below
// would never show it — without this flag furniture is authored blind, which is
// exactly the "read the effect out of the data" failure this tool exists against.
const prefabKey = flag('prefab', null);

const packPath = builtin
    ? resolve(HERE, `../../core/src/stylepacks/${builtin}.stylepack.json`)
    : positional[0] && resolve(positional[0]);
if (!packPath) {
    console.error('usage: node tools/snapshot.mjs <pack.json> [--out DIR] [--views N] [--faces open|closed] [--prefab KEY|all]');
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

    // Hide the editor's own overlays. The subject is the GEOMETRY; a dial and
    // six face labels in every frame are noise a reviewer has to look past, and
    // they cover the lower third of the cell.
    const hideChrome = async () => {
        if (flag('chrome', null) !== null) return;
        await page.addStyleTag({
            content: '[data-testid="sp-dial"],[data-testid^="sp-facelabel-"],#sp-preview>div:first-child{display:none!important}',
        });
    };

    // b4 stop bodies are collision, not scenery. A photo that includes them is
    // not what the world will look like: the bench disappeared behind its own
    // translucent box, and the table grew a green panel where the stop's top
    // plane met the tabletop. Hidden by default; `--stops 1` when the collision
    // shape IS what you came to check.
    //
    // The flag FORCES visible rather than merely skipping the hide: a library's
    // stops normally carry basic_stop.ts slot 6 (hidden), so leaving them alone
    // would draw nothing and the flag would look broken.
    //
    // Must run after every re-expansion — switching prefab rebuilds the entities.
    const setStops = async () => {
        const show = flag('stops', null) !== null;
        await page.evaluate((visible) => {
            const w = window.spLoader?.getEngine?.()?.getWorld?.();
            if (!w) return 0;
            let n = 0;
            for (const eid of w.queryEntities('AdjunctComponent')) {
                const a = w.getComponent(eid, 'AdjunctComponent');
                if (a?.stdData?.typeId !== 0xb4) continue;
                const obj = w.renderEngine?.getObjectByEntityId?.(eid);
                if (obj) { obj.visible = visible; n++; }
            }
            return n;
        }, show);
    };

    // Spin around whatever the preview has framed and shoot it from `views`
    // sides. The fitted radius/elevation are kept rather than recomputed: the
    // loader's fitView() already sized the subject, and a prefab's cube is a
    // different size from a cell's.
    const photograph = async (prefix) => {
        const files = [];
        for (let i = 0; i < views; i++) {
            await page.evaluate((az) => {
                const w = window.spLoader?.getEngine?.()?.getWorld?.();
                const cc = w?.systems?.findSystemByName('CharacterController');
                const st = cc?.getObserveState?.();
                cc?.setObserveOrbit?.(az, st?.elevation ?? 0.5, st?.radius ?? 12);
            }, (i / views) * Math.PI * 2);
            await page.waitForTimeout(350);
            const file = `${out}/${prefix}-${i}.png`;
            await page.locator('#sp-preview').screenshot({ path: file });
            files.push(file);
        }
        return files;
    };

    const shots = [];
    const placed = {};      // prefab key → adjuncts the stamp actually produced
    if (prefabKey) {
        // 组合件 mode. Driven through the panel rather than `spLoader.setPrefab`
        // for the same reason the pack is imported through the textarea: what is
        // photographed must be what the editor would be editing.
        const all = (pack.prefabs ?? []).map((p) => p.key);
        if (!all.length) throw new Error(`pack "${pack.id}" has no 组合件 to photograph`);
        const keys = prefabKey === 'all' ? all : [prefabKey];
        await page.getByTestId('sp-acc-prefab').click();
        await hideChrome();
        for (const key of keys) {
            const btn = page.getByTestId(`sp-prefab-${key}`);
            if (!(await btn.count())) throw new Error(`no 组合件 "${key}" in ${pack.id} (have: ${all.join(', ')})`);
            await btn.click();
            // Each prefab declares its own `size`, so selecting one re-expands AND
            // re-fits; read the camera only after both have landed.
            await page.waitForTimeout(700);
            // previewCount, not derivedCount: a stamp produces AUTHORED adjuncts
            // (§9.4), so the derived counter is 0 for every prefab by definition —
            // it would report an empty preview over a photo with a bench in it.
            placed[key] = await page.evaluate(() => window.spLoader?.previewCount?.() ?? -1);
            await setStops();
            shots.push(...(await photograph(`prefab-${key}`)));
        }
    } else {
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

        await hideChrome();
        await setStops();
        await page.waitForTimeout(600);
        shots.push(...(await photograph('view')));
    }

    // The machine-checkable half, from the same engine code the editor shows.
    const guard = await page.evaluate(() => (window.__spGuard ? window.__spGuard() : null));

    const report = {
        pack: pack.id,
        source: packPath,
        subject: prefabKey ? `prefabs:${prefabKey}` : `faces:${faceState}`,
        faces: faceState,
        views: shots,
        derived: await page.evaluate(() => window.spLoader?.derivedCount?.() ?? -1),
        options: {
            closed: (pack.closed ?? []).map((v) => ({ key: v.key ?? v.name, parts: (v.parts ?? v.pieces ?? []).length })),
            open: (pack.open ?? []).map((v) => ({ key: v.key ?? v.name, parts: (v.parts ?? v.pieces ?? []).length })),
            // Listed unconditionally, not only in --prefab mode: "this pack has
            // no furniture" is worth seeing while looking at its faces.
            prefabs: (pack.prefabs ?? []).map((p) => ({
                key: p.key, name: p.name, size: p.size ?? 2, parts: (p.parts ?? []).length,
                ...(p.key in placed ? { placed: placed[p.key] } : {}),
            })),
        },
        guard,
    };
    writeFileSync(`${out}/guard.json`, JSON.stringify(report, null, 2));
    writeFileSync(`${out}/pack.json`, packJson);

    console.log(`pack      ${pack.id}  (${packPath})`);
    console.log(`views     ${shots.length} → ${out}/${prefabKey ? 'prefab-*' : 'view-*'}.png`);
    if (!prefabKey) console.log(`derived   ${report.derived} adjuncts from the six faces`);
    for (const pool of ['closed', 'open']) {
        for (const o of report.options[pool]) console.log(`  ${pool.padEnd(6)} ${String(o.key).padEnd(14)} parts=${o.parts}`);
    }
    for (const p of report.options.prefabs) {
        // `placed` is the stamp's real yield — parts that collapse to nothing
        // (a zero-size box) never show up in the world and would go unnoticed.
        const yielded = p.placed != null ? `  placed=${p.placed}` : '';
        console.log(`  ${'prefab'.padEnd(6)} ${String(p.key).padEnd(14)} parts=${p.parts}${yielded}  size=${p.size}m  ${p.name ?? ''}`);
    }
    if (guard?.length) {
        console.log(`guard     ${guard.length} issue(s):`);
        for (const i of guard) console.log(`  ${i.level.toUpperCase().padEnd(5)} ${i.pool}/${i.variantKey}  ${i.code}  ${i.message}`);
    } else if (guard) {
        console.log('guard     clean');
    } else {
        console.log('guard     (not exposed by this build)');
    }
} catch (e) {
    // Usage mistakes are the common failure here — no such 组合件, a pack with an
    // empty pool, an import the editor rejected. A stack trace buries the one
    // line that says which. Set DEBUG=1 when the fault is in the tool itself.
    console.error(`\nsnapshot: ${e.message}`);
    if (process.env.DEBUG) console.error(e.stack);
    process.exitCode = 2;
} finally {
    await browser.close();
}
