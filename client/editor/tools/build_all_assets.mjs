#!/usr/bin/env node
/**
 * Procedural Asset Builder for Septopus World
 *
 * Generates all 3D GLB assets produced by Three.js code:
 *   - Cyber / Dungeon Bastion models
 *   - Oriental Lattice Windows
 *   - PAL1 Xianjian props (sword, wine cask, tavern table, inn sign, etc.)
 *   - PAL1 Inn Roofs (6 pitched roof variants with eaves and hip corners)
 *   - PAL1 Inn Interior (counter, stairs, bonsai, railing, door, window)
 *   - PAL1 Courtyard & Garden (moon gate, stone table set, well, rockery, garden wall)
 *   - PAL1 Environmental Props (stone lanterns, bamboo grove, willow tree, stone bridge, fence)
 *
 * Usage:
 *   node build_all_assets.mjs           # builds missing assets (instant check)
 *   node build_all_assets.mjs --force   # forces rebuilding all assets
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(HERE, '../../desktop/public/assets');

const GENERATORS = [
    { name: 'Models (cyber-pillar, dungeon-bastion)', script: 'generate_models.mjs' },
    { name: 'Oriental Windows', script: 'generate_chinese_window.mjs' },
    { name: 'Xianjian Props', script: 'generate_xianjian_assets.mjs' },
    { name: 'Pal1 Classical Roofs', script: 'generate_roof_assets.mjs' },
    { name: 'Pal1 Inn Interior', script: 'generate_inn_assets.mjs' },
    { name: 'Pal1 Courtyard & Garden', script: 'generate_courtyard_assets.mjs' },
    { name: 'Pal1 Environmental Props', script: 'generate_environment_assets.mjs' },
];

const EXPECTED_GLBS = [
    'cyber-pillar.glb',
    'dungeon-bastion.glb',
    'oriental-lattice-window.glb',
    'pal1-ancient-sword.glb',
    'pal1-herb-stand.glb',
    'pal1-tavern-table.glb',
    'pal1-inn-sign.glb',
    'pal1-wine-cask.glb',
    'pal1-inn-roof-front.glb',
    'pal1-inn-roof-front-west.glb',
    'pal1-inn-roof-front-east.glb',
    'pal1-inn-roof-back.glb',
    'pal1-inn-roof-back-west.glb',
    'pal1-inn-roof-back-east.glb',
    'pal1-inn-counter.glb',
    'pal1-inn-stairs.glb',
    'pal1-inn-bonsai.glb',
    'pal1-inn-window.glb',
    'pal1-inn-railing.glb',
    'pal1-inn-door.glb',
    'pal1-courtyard-moon-gate.glb',
    'pal1-courtyard-stone-table.glb',
    'pal1-courtyard-ancient-well.glb',
    'pal1-courtyard-rockery.glb',
    'pal1-courtyard-garden-wall.glb',
    'pal1-env-stone-lantern.glb',
    'pal1-env-bamboo-grove.glb',
    'pal1-env-willow-tree.glb',
    'pal1-env-stone-bridge.glb',
    'pal1-env-bamboo-fence.glb',
];

const isForce = process.argv.includes('--force') || process.argv.includes('-f');

function checkMissingAssets() {
    return EXPECTED_GLBS.filter(file => !fs.existsSync(path.join(ASSETS_DIR, file)));
}

async function main() {
    const missing = checkMissingAssets();
    if (!isForce && missing.length === 0) {
        console.log(`[build:assets] All ${EXPECTED_GLBS.length} procedural 3D assets are up to date.`);
        return;
    }

    if (missing.length > 0) {
        console.log(`[build:assets] Missing ${missing.length} procedural asset(s): ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '...' : ''}`);
    } else {
        console.log(`[build:assets] Rebuilding all ${EXPECTED_GLBS.length} procedural 3D assets (--force)...`);
    }

    const t0 = Date.now();
    for (const gen of GENERATORS) {
        const scriptPath = path.resolve(HERE, gen.script);
        const res = spawnSync(process.execPath, [scriptPath], {
            stdio: 'pipe',
            encoding: 'utf8',
        });
        if (res.status !== 0) {
            console.error(`[build:assets] Error executing ${gen.script}:`, res.stderr || res.stdout);
            process.exit(res.status || 1);
        }
    }
    const duration = Date.now() - t0;
    console.log(`[build:assets] Successfully generated ${EXPECTED_GLBS.length} procedural GLBs in ${duration}ms.`);
}

main().catch(err => {
    console.error('[build:assets] Fatal error:', err);
    process.exit(1);
});
