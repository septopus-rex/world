import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(HERE, '../../desktop/public/assets');

const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();

async function generateTexture(name, drawFunction) {
    const dataUrl = await page.evaluate(drawFunction);
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const outPath = resolve(ASSETS_DIR, name);
    writeFileSync(outPath, buffer);
    console.log(`Generated ${name} (${buffer.length} bytes)`);
}

// 1. oriental-wood.png (ID 52): 雕花朱漆实木/榫卯贴图
await generateTexture('oriental-wood.png', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Deep vermilion / cinnabar red wood base
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, '#8c2218');
    grad.addColorStop(0.5, '#aa2a1e');
    grad.addColorStop(1, '#781c13');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Natural wood grain streaks
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    for (let y = 0; y < 512; y += 4) {
        ctx.fillRect(0, y, 512, 2);
    }

    // Outer decorative border with golden cloud/key pattern
    ctx.strokeStyle = '#d4af37'; // gold
    ctx.lineWidth = 6;
    ctx.strokeRect(16, 16, 480, 480);

    ctx.strokeStyle = '#5a120c';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 502, 502);

    // Corner brass fittings
    ctx.fillStyle = '#c59b27';
    [[16, 16], [496, 16], [16, 496], [496, 496]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#4a3809';
        ctx.lineWidth = 3;
        ctx.stroke();
    });

    // Center circular medallion (traditional Chinese roundel / cloud motif)
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(256, 256, 120, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(256, 256, 105, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(256, 256, 50, 0, Math.PI * 2); ctx.stroke();

    // Medallion cross flourishes
    ctx.beginPath();
    ctx.moveTo(136, 256); ctx.lineTo(376, 256);
    ctx.moveTo(256, 136); ctx.lineTo(256, 376);
    ctx.stroke();

    return canvas.toDataURL('image/png');
});

// 2. oriental-lattice.png (ID 53): 三交六椀菱花木格窗纸
await generateTexture('oriental-lattice.png', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Warm rice paper background
    ctx.fillStyle = '#f8f4ea';
    ctx.fillRect(0, 0, 512, 512);

    // Paper fiber texture
    ctx.fillStyle = 'rgba(210, 195, 170, 0.15)';
    for (let i = 0; i < 500; i++) {
        const px = Math.random() * 512;
        const py = Math.random() * 512;
        ctx.fillRect(px, py, 3, 2);
    }

    // Outer vermilion wooden frame
    ctx.strokeStyle = '#8c2218';
    ctx.lineWidth = 20;
    ctx.strokeRect(10, 10, 492, 492);

    // Inner diamond lattice / floral woodwork
    ctx.strokeStyle = '#731a12';
    ctx.lineWidth = 4;
    const step = 32;
    for (let i = -512; i < 1024; i += step) {
        ctx.beginPath();
        ctx.moveTo(i, 20); ctx.lineTo(i + 472, 492); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i + 472, 20); ctx.lineTo(i, 492); ctx.stroke();
    }

    // Center vertical and horizontal main dividers
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(256, 20); ctx.lineTo(256, 492);
    ctx.moveTo(20, 256); ctx.lineTo(492, 256);
    ctx.stroke();

    return canvas.toDataURL('image/png');
});

// 3. oriental-brick.png (ID 54): 黛瓦与青砖青石基座
await generateTexture('oriental-brick.png', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Blue-grey slate brick base
    ctx.fillStyle = '#3a414b';
    ctx.fillRect(0, 0, 512, 512);

    // Brick mortar lines
    ctx.strokeStyle = '#22272e';
    ctx.lineWidth = 3;

    const rowH = 32;
    const brickW = 64;
    for (let r = 0; r < 16; r++) {
        const y = r * rowH;
        // Horizontal mortar
        ctx.beginPath();
        ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();

        // Staggered vertical mortar
        const offset = (r % 2) * (brickW / 2);
        for (let x = offset; x < 512 + brickW; x += brickW) {
            ctx.beginPath();
            ctx.moveTo(x, y); ctx.lineTo(x, y + rowH); ctx.stroke();

            // Subtle stone color variations
            const shade = (Math.sin(r * 3 + x) * 15);
            ctx.fillStyle = `rgba(255, 255, 255, ${0.03 + (shade > 0 ? 0.04 : 0)})`;
            ctx.fillRect(x + 2, y + 2, brickW - 4, rowH - 4);
        }
    }

    // Top border slate stone capping
    ctx.fillStyle = '#2d333b';
    ctx.fillRect(0, 0, 512, 20);
    ctx.strokeStyle = '#181b20';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(512, 20); ctx.stroke();

    return canvas.toDataURL('image/png');
});

// 4. oriental-screen.png (ID 55): 仙侠水墨山水绢帛屏风
await generateTexture('oriental-screen.png', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Silk parchment background (warm beige with silk grain)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 512);
    bgGrad.addColorStop(0, '#f2ece0');
    bgGrad.addColorStop(0.7, '#e4d8c4');
    bgGrad.addColorStop(1, '#cfc0a8');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 512, 512);

    // Ink wash misty mountains (far mountain layer)
    ctx.fillStyle = 'rgba(70, 85, 95, 0.25)';
    ctx.beginPath();
    ctx.moveTo(0, 320);
    ctx.bezierCurveTo(80, 240, 160, 260, 240, 210);
    ctx.bezierCurveTo(320, 160, 420, 220, 512, 250);
    ctx.lineTo(512, 512);
    ctx.lineTo(0, 512);
    ctx.closePath();
    ctx.fill();

    // Near mountain layer (richer ink)
    ctx.fillStyle = 'rgba(35, 45, 50, 0.65)';
    ctx.beginPath();
    ctx.moveTo(0, 380);
    ctx.bezierCurveTo(120, 310, 180, 350, 300, 290);
    ctx.bezierCurveTo(400, 240, 460, 320, 512, 330);
    ctx.lineTo(512, 512);
    ctx.lineTo(0, 512);
    ctx.closePath();
    ctx.fill();

    // Ancient pine tree silhouette
    ctx.strokeStyle = 'rgba(20, 25, 30, 0.85)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(420, 512);
    ctx.bezierCurveTo(410, 420, 380, 380, 360, 340);
    ctx.stroke();

    // Pine needles clusters
    ctx.fillStyle = 'rgba(20, 25, 30, 0.85)';
    [[350, 330], [330, 345], [375, 320], [390, 340]].forEach(([px, py]) => {
        ctx.beginPath(); ctx.arc(px, py, 18, 0, Math.PI * 2); ctx.fill();
    });

    // Sun / Moon in red ink
    ctx.fillStyle = 'rgba(180, 40, 30, 0.7)';
    ctx.beginPath();
    ctx.arc(100, 110, 28, 0, Math.PI * 2);
    ctx.fill();

    // Red seal stamp in bottom left
    ctx.strokeStyle = '#b8281e';
    ctx.lineWidth = 3;
    ctx.strokeRect(40, 420, 36, 36);
    ctx.fillStyle = '#b8281e';
    ctx.font = 'bold 12px serif';
    ctx.fillText('仙境', 46, 444);

    // Outer rich rosewood border
    ctx.strokeStyle = '#5a120c';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, 498, 498);

    return canvas.toDataURL('image/png');
});

await browser.close();
console.log('All 4 oriental textures generated successfully!');
