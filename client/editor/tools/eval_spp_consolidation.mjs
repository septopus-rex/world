import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import expandSpp and consolidateSppRows from engine
const engineExpander = await import('../../../engine/src/core/spp/Expander.ts');
const { expandSpp } = engineExpander;
const { consolidateSppRows } = await import('../../../engine/src/core/spp/Consolidator.ts');
const { registerStylePack } = await import('../../../engine/src/core/spp/Variants.ts');

// Register stylepacks
const pal1PackPath = path.resolve(__dirname, '../../core/src/stylepacks/pal1_inn.stylepack.json');
const pal1Pack = JSON.parse(fs.readFileSync(pal1PackPath, 'utf8'));
registerStylePack(pal1Pack);

// Load levels
const villagePath = path.resolve(__dirname, '../../core/src/levels/pal1_village_compound.level.json');
const villageLevel = JSON.parse(fs.readFileSync(villagePath, 'utf8'));

const courtyardPath = path.resolve(__dirname, '../../core/src/levels/pal1_courtyard.level.json');
const courtyardLevel = JSON.parse(fs.readFileSync(courtyardPath, 'utf8'));

function evaluateLevel(name, levelJson) {
    console.log(`\n======================================================`);
    console.log(`Evaluated Level: ${name}`);
    console.log(`======================================================`);

    const block = levelJson.blocks[0];
    const adjuncts = block.raw[2];
    const sppAdjuncts = adjuncts.filter(a => a[0] === 0x00b6);

    let totalRawBefore = 0;
    let totalRawAfter = 0;
    const allRowsBefore = [];

    sppAdjuncts.forEach((adj, i) => {
        const instances = adj[1];
        instances.forEach((sppInstance, j) => {
            const unmergedRows = expandSpp(sppInstance, { consolidate: false });
            const mergedRows = expandSpp(sppInstance, { consolidate: true });
            totalRawBefore += unmergedRows.length;
            totalRawAfter += mergedRows.length;
            allRowsBefore.push(...unmergedRows);
            console.log(`SPP #${i + 1}-${j + 1} (${sppInstance[2]}): ${unmergedRows.length} rows -> ${mergedRows.length} rows (reduced ${unmergedRows.length - mergedRows.length}, -${Math.round((unmergedRows.length - mergedRows.length) / unmergedRows.length * 100)}%)`);
            if (i === 0 && j === 0) {
                console.log('Merged rows in #1-1:');
                mergedRows.forEach((r) => {
                    if (r[0] === 180 || (r[0] === 162 && (r[1][0][0] > 4 || r[1][0][1] > 4))) {
                        console.log('  Merged row:', r[0], r[1][0], r[1][1], 'props:', r[1].slice(3));
                    }
                });
            }
        });
    });

    // Cross-SPP consolidation (if all SPP rows in block are consolidated together)
    const crossMerged = consolidateSppRows(allRowsBefore);
    console.log(`------------------------------------------------------`);
    console.log(`Total Intra-SPP: ${totalRawBefore} -> ${totalRawAfter} (reduced ${totalRawBefore - totalRawAfter}, -${Math.round((totalRawBefore - totalRawAfter) / totalRawBefore * 100)}%)`);
    console.log(`Total Global/Cross-SPP: ${totalRawBefore} -> ${crossMerged.length} (reduced ${totalRawBefore - crossMerged.length}, -${Math.round((totalRawBefore - crossMerged.length) / totalRawBefore * 100)}%)`);
    console.log(`Type breakdown (Before):`, {
        box162: allRowsBefore.filter(r => r[0] === 162).length,
        wall161: allRowsBefore.filter(r => r[0] === 161).length,
        stop180: allRowsBefore.filter(r => r[0] === 180).length,
        model164: allRowsBefore.filter(r => r[0] === 164).length,
    });
    console.log(`Type breakdown (After Cross-Merged):`, {
        box162: crossMerged.filter(r => r[0] === 162).length,
        wall161: crossMerged.filter(r => r[0] === 161).length,
        stop180: crossMerged.filter(r => r[0] === 180).length,
        model164: crossMerged.filter(r => r[0] === 164).length,
    });
    console.log(`------------------------------------------------------`);
}

evaluateLevel('Pal1 Courtyard (Single SPP Compound)', courtyardLevel);
evaluateLevel('Pal1 Village Compound (5 SPPs: East, West, Outdoor Promenade)', villageLevel);
