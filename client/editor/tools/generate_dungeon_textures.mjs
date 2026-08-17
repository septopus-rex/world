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

// 1. dungeon-stone.png (ID 56): 粗粝巨石砖石缝与青苔贴图
await generateTexture('dungeon-stone.png', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Dark charcoal stone base
    ctx.fillStyle = '#26292d';
    ctx.fillRect(0, 0, 512, 512);

    // Stone surface grain / noise
    for (let i = 0; i < 2000; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const c = Math.floor(25 + Math.random() * 30);
        ctx.fillStyle = `rgb(${c}, ${c + 3}, ${c + 5})`;
        ctx.fillRect(x, y, 4, 3);
    }

    // Heavy irregular stone blocks
    ctx.strokeStyle = '#121417';
    ctx.lineWidth = 6;

    const rows = [0, 110, 230, 360, 512];
    for (let r = 0; r < rows.length - 1; r++) {
        const y1 = rows[r];
        const y2 = rows[r + 1];
        // Horizontal mortar
        ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(512, y1); ctx.stroke();

        // Vertical cuts
        const cuts = r % 2 === 0 ? [140, 320, 470] : [80, 240, 410];
        for (const cx of cuts) {
            ctx.beginPath();
            ctx.moveTo(cx, y1);
            ctx.lineTo(cx + (Math.random() * 10 - 5), y2);
            ctx.stroke();
        }
    }

    // Stone highlights & cracks
    ctx.strokeStyle = '#4a5059';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(30, 40); ctx.lineTo(120, 45); ctx.lineTo(130, 80);
    ctx.moveTo(250, 140); ctx.lineTo(310, 150); ctx.lineTo(300, 210);
    ctx.moveTo(100, 280); ctx.lineTo(180, 275);
    ctx.moveTo(380, 400); ctx.lineTo(440, 390);
    ctx.stroke();

    // Moss patches (dark green / olive)
    ctx.fillStyle = 'rgba(45, 75, 35, 0.45)';
    [[20, 220, 40], [130, 230, 25], [310, 350, 50], [420, 100, 35], [50, 500, 60], [280, 490, 70]].forEach(([mx, my, mr]) => {
        ctx.beginPath();
        ctx.arc(mx, my, mr, 0, Math.PI * 2);
        ctx.fill();
    });

    return canvas.toDataURL('image/png');
});

// 2. dungeon-iron.png (ID 57): 生锈铁栅与锁链/铆钉贴图
await generateTexture('dungeon-iron.png', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Dark void / stone backdrop
    ctx.fillStyle = '#141619';
    ctx.fillRect(0, 0, 512, 512);

    // Rust background streaks
    ctx.fillStyle = 'rgba(120, 55, 25, 0.2)';
    for (let y = 0; y < 512; y += 8) {
        ctx.fillRect(0, y, 512, 4);
    }

    // Outer heavy iron frame
    ctx.strokeStyle = '#32363d';
    ctx.lineWidth = 24;
    ctx.strokeRect(12, 12, 488, 488);

    // Rust oxidation on frame
    ctx.strokeStyle = '#7c381c';
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, 488, 488);

    // Vertical heavy iron bars
    const barX = [80, 150, 220, 290, 360, 430];
    for (const bx of barX) {
        // Cast shadow
        ctx.fillStyle = '#0a0b0d';
        ctx.fillRect(bx - 14, 20, 28, 472);

        // Iron bar body
        ctx.fillStyle = '#2f343d';
        ctx.fillRect(bx - 10, 20, 20, 472);

        // Rust patches
        ctx.fillStyle = '#8a4220';
        ctx.fillRect(bx - 8, 120 + (bx % 70), 16, 60);
        ctx.fillRect(bx - 8, 300 + (bx % 50), 16, 45);

        // Metallic highlight streak
        ctx.fillStyle = '#5c6473';
        ctx.fillRect(bx - 3, 20, 4, 472);
    }

    // Horizontal reinforced crossbars
    [160, 350].forEach(hy => {
        ctx.fillStyle = '#252930';
        ctx.fillRect(20, hy - 14, 472, 28);
        ctx.fillStyle = '#6b3216';
        ctx.fillRect(20, hy - 8, 472, 16);

        // Rivet heads
        for (const bx of barX) {
            ctx.fillStyle = '#4f5663';
            ctx.beginPath(); ctx.arc(bx, hy, 9, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#1c0c05';
            ctx.beginPath(); ctx.arc(bx, hy, 4, 0, Math.PI * 2); ctx.fill();
        }
    });

    return canvas.toDataURL('image/png');
});

// 3. dungeon-rune.png (ID 58): 幽蓝发光魔法符文石刻贴图
await generateTexture('dungeon-rune.png', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Obsidian / Basalt dark slab background
    ctx.fillStyle = '#1b1d22';
    ctx.fillRect(0, 0, 512, 512);

    // Stone border groove
    ctx.strokeStyle = '#0f1114';
    ctx.lineWidth = 14;
    ctx.strokeRect(10, 10, 492, 492);

    // Glowing cyan/purple aura in center
    const glow = ctx.createRadialGradient(256, 256, 40, 256, 256, 220);
    glow.addColorStop(0, 'rgba(0, 220, 255, 0.35)');
    glow.addColorStop(0.5, 'rgba(120, 50, 220, 0.15)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 512, 512);

    // Center magic rune circle
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 5;
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 12;

    ctx.beginPath(); ctx.arc(256, 256, 170, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(256, 256, 140, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(256, 256, 50, 0, Math.PI * 2); ctx.stroke();

    // Hexagram / Mystic star
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (i * 60 - 90) * Math.PI / 180;
        const next = ((i + 2) * 60 - 90) * Math.PI / 180;
        const x1 = 256 + Math.cos(angle) * 140;
        const y1 = 256 + Math.sin(angle) * 140;
        const x2 = 256 + Math.cos(next) * 140;
        const y2 = 256 + Math.sin(next) * 140;
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    }
    ctx.stroke();

    // Outer arcane glyphs
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#80f0ff';
    const glyphs = ['᚛', 'ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ'];
    for (let i = 0; i < 12; i++) {
        const angle = (i * 30 - 90) * Math.PI / 180;
        const gx = 256 + Math.cos(angle) * 155;
        const gy = 256 + Math.sin(angle) * 155;
        ctx.fillText(glyphs[i], gx - 8, gy + 8);
    }

    return canvas.toDataURL('image/png');
});

// 4. dungeon-altar.png (ID 59): 祭坛古老五芒星与骷髅浮雕贴图
await generateTexture('dungeon-altar.png', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Ancient weathered stone surface
    ctx.fillStyle = '#22252a';
    ctx.fillRect(0, 0, 512, 512);

    // Weathered noise
    for (let i = 0; i < 1500; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(x, y, 3, 3);
    }

    // Carved ritual circle
    ctx.strokeStyle = '#48505e';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(256, 256, 180, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(256, 256, 155, 0, Math.PI * 2); ctx.stroke();

    // Pentagram etched into stone
    ctx.strokeStyle = '#8a3c30'; // Dried blood / crimson etching
    ctx.lineWidth = 5;
    ctx.beginPath();
    const pts = [];
    for (let i = 0; i < 5; i++) {
        const a = (i * 72 - 90) * Math.PI / 180;
        pts.push([256 + Math.cos(a) * 155, 256 + Math.sin(a) * 155]);
    }
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.lineTo(pts[2][0], pts[2][1]);
    ctx.lineTo(pts[4][0], pts[4][1]);
    ctx.lineTo(pts[1][0], pts[1][1]);
    ctx.lineTo(pts[3][0], pts[3][1]);
    ctx.closePath();
    ctx.stroke();

    // Center skull engraving
    ctx.fillStyle = '#d0d8e2';
    // Cranius
    ctx.beginPath(); ctx.arc(256, 230, 38, 0, Math.PI * 2); ctx.fill();
    // Jaw
    ctx.fillRect(240, 250, 32, 22);
    // Eye sockets
    ctx.fillStyle = '#181b20';
    ctx.beginPath(); ctx.arc(244, 232, 10, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(268, 232, 10, 0, Math.PI * 2); ctx.fill();
    // Nose
    ctx.beginPath();
    ctx.moveTo(256, 242); ctx.lineTo(251, 252); ctx.lineTo(261, 252);
    ctx.closePath(); ctx.fill();

    return canvas.toDataURL('image/png');
});

await browser.close();
console.log('All 4 dungeon textures generated successfully!');
