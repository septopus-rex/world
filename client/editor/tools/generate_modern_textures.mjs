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

// 1. modern-concrete.png (ID 60): 清水混凝土与螺栓圆孔贴图
await generateTexture('modern-concrete.png', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Smooth architectural fair-faced concrete base
    ctx.fillStyle = '#b8bcbe';
    ctx.fillRect(0, 0, 512, 512);

    // Concrete fine pores & micro-texture
    for (let i = 0; i < 3000; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const v = Math.random() > 0.5 ? 20 : -20;
        ctx.fillStyle = `rgba(${184 + v}, ${188 + v}, ${190 + v}, 0.15)`;
        ctx.fillRect(x, y, 3, 2);
    }

    // Concrete formwork grid lines (minimal panel joints)
    ctx.strokeStyle = '#9ea2a6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 256); ctx.lineTo(512, 256);
    ctx.moveTo(256, 0); ctx.lineTo(256, 512);
    ctx.stroke();

    // Architectural tie-rod bolt holes (4 quadrants)
    const tieHoles = [
        [64, 64], [192, 64], [64, 192], [192, 192],
        [320, 64], [448, 64], [320, 192], [448, 192],
        [64, 320], [192, 320], [64, 448], [192, 448],
        [320, 320], [448, 320], [320, 448], [448, 448]
    ];

    for (const [hx, hy] of tieHoles) {
        // Outer recess
        ctx.fillStyle = '#8f9498';
        ctx.beginPath(); ctx.arc(hx, hy, 12, 0, Math.PI * 2); ctx.fill();
        // Inner shadow
        ctx.fillStyle = '#5c6064';
        ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.fill();
        // Highlight rim
        ctx.strokeStyle = '#d5d9dc';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(hx, hy, 12, 0, Math.PI * 2); ctx.stroke();
    }

    return canvas.toDataURL('image/png');
});

// 2. modern-slat.png (ID 61): 暖色橡木条形格栅贴图
await generateTexture('modern-slat.png', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Dark shadow backing behind slats
    ctx.fillStyle = '#181512';
    ctx.fillRect(0, 0, 512, 512);

    // Warm natural oak vertical slats
    const slatW = 24;
    const gapW = 8;
    const totalW = slatW + gapW;

    for (let x = 0; x < 512; x += totalW) {
        // Oak wood base
        const grad = ctx.createLinearGradient(x, 0, x + slatW, 0);
        grad.addColorStop(0, '#c89d6c');
        grad.addColorStop(0.5, '#deb887');
        grad.addColorStop(1, '#b88d5c');
        ctx.fillStyle = grad;
        ctx.fillRect(x, 0, slatW, 512);

        // Wood grain streaks
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        for (let y = 0; y < 512; y += 6) {
            ctx.fillRect(x, y, slatW, 2);
        }

        // Side bevel highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(x, 0, 2, 512);

        // Right side drop shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(x + slatW - 3, 0, 3, 512);
    }

    return canvas.toDataURL('image/png');
});

// 3. modern-books.png (ID 62): 现代极简书架与摆件贴图
await generateTexture('modern-books.png', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Dark walnut bookcase backboard
    ctx.fillStyle = '#2b2622';
    ctx.fillRect(0, 0, 512, 512);

    // 3 shelves
    const shelves = [160, 320, 480];
    for (const sy of shelves) {
        // Shelf plank
        ctx.fillStyle = '#4a3f35';
        ctx.fillRect(0, sy, 512, 16);
        ctx.fillStyle = '#1c1713';
        ctx.fillRect(0, sy + 16, 512, 6);
    }

    // Books on Shelf 1 (top)
    const bookColors1 = ['#8c3a27', '#2d4b68', '#c29d5b', '#485550', '#d8d2c4', '#34383c'];
    let bx = 30;
    for (const c of bookColors1) {
        const bw = 18 + Math.floor(Math.random() * 12);
        const bh = 90 + Math.floor(Math.random() * 25);
        ctx.fillStyle = c;
        ctx.fillRect(bx, 160 - bh, bw, bh);
        // Spine gold lines
        ctx.fillStyle = '#e0c580';
        ctx.fillRect(bx + 3, 160 - bh + 15, bw - 6, 2);
        ctx.fillRect(bx + 3, 160 - bh + 25, bw - 6, 2);
        bx += bw + 3;
    }

    // Modern vase on Shelf 1
    ctx.fillStyle = '#f0ede6';
    ctx.beginPath();
    ctx.ellipse(380, 110, 24, 45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Books on Shelf 2 (middle)
    const bookColors2 = ['#1f2421', '#9a7b56', '#5c3a21', '#e8e5de', '#3d5a80', '#293241'];
    bx = 180;
    for (const c of bookColors2) {
        const bw = 20 + Math.floor(Math.random() * 10);
        const bh = 85 + Math.floor(Math.random() * 30);
        ctx.fillStyle = c;
        ctx.fillRect(bx, 320 - bh, bw, bh);
        bx += bw + 2;
    }

    // Plant succulent on Shelf 2 left
    ctx.fillStyle = '#b08968'; // pot
    ctx.fillRect(60, 270, 36, 45);
    ctx.fillStyle = '#588157'; // plant
    ctx.beginPath(); ctx.arc(78, 260, 22, 0, Math.PI * 2); ctx.fill();

    // Books & sculpture on Shelf 3 (bottom)
    const bookColors3 = ['#33415c', '#001219', '#ae2012', '#ca6702', '#e9d8a6'];
    bx = 40;
    for (const c of bookColors3) {
        const bw = 22 + Math.floor(Math.random() * 8);
        const bh = 100 + Math.floor(Math.random() * 20);
        ctx.fillStyle = c;
        ctx.fillRect(bx, 480 - bh, bw, bh);
        bx += bw + 3;
    }

    return canvas.toDataURL('image/png');
});

// 4. modern-marble.png (ID 63): 爵士白大理石纹理贴图
await generateTexture('modern-marble.png', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Luxurious white marble background
    ctx.fillStyle = '#f7f8fa';
    ctx.fillRect(0, 0, 512, 512);

    // Fine vein texture
    ctx.strokeStyle = 'rgba(160, 168, 178, 0.4)';
    ctx.lineWidth = 3;

    // Vein 1: Main diagonal flow
    ctx.beginPath();
    ctx.moveTo(0, 80);
    ctx.bezierCurveTo(120, 140, 220, 100, 340, 230);
    ctx.bezierCurveTo(400, 300, 460, 350, 512, 420);
    ctx.stroke();

    // Vein 2: Secondary wisps
    ctx.strokeStyle = 'rgba(185, 192, 200, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(80, 0);
    ctx.bezierCurveTo(160, 80, 140, 160, 260, 180);
    ctx.bezierCurveTo(340, 200, 420, 160, 512, 190);
    ctx.stroke();

    // Vein 3: Soft branching
    ctx.strokeStyle = 'rgba(130, 140, 150, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(180, 120);
    ctx.bezierCurveTo(240, 220, 260, 340, 380, 460);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(340, 230);
    ctx.bezierCurveTo(280, 320, 180, 380, 80, 512);
    ctx.stroke();

    // Thin elegant black outline rim for table/slab edges
    ctx.strokeStyle = '#1a1c1e';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 504, 504);

    return canvas.toDataURL('image/png');
});

await browser.close();
console.log('All 4 modern textures generated successfully!');
