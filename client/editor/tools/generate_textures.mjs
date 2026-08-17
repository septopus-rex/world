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

// 1. cyber-panel.png (ID 48): Sci-fi titanium composite armor plating
await generateTexture('cyber-panel.png', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base dark metallic background
    const bgGrad = ctx.createLinearGradient(0, 0, 512, 512);
    bgGrad.addColorStop(0, '#1c2026');
    bgGrad.addColorStop(0.5, '#242a34');
    bgGrad.addColorStop(1, '#181b22');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 512, 512);

    // Subtle brushed metal streaks
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    for (let i = 0; i < 512; i += 3) {
        ctx.fillRect(0, i, 512, 1);
    }

    // Outer structural frame bevel
    ctx.strokeStyle = '#3a4454';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, 500, 500);

    ctx.strokeStyle = '#101318';
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, 488, 488);

    // Main 4 armor sub-plates with bevels
    const plates = [
        { x: 24, y: 24, w: 224, h: 224 },
        { x: 264, y: 24, w: 224, h: 224 },
        { x: 24, y: 264, w: 224, h: 224 },
        { x: 264, y: 264, w: 224, h: 224 }
    ];

    plates.forEach((p) => {
        // Plate fill
        const pGrad = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
        pGrad.addColorStop(0, '#2e3745');
        pGrad.addColorStop(1, '#202630');
        ctx.fillStyle = pGrad;
        ctx.fillRect(p.x, p.y, p.w, p.h);

        // Plate highlight and shadow border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);

        ctx.strokeStyle = '#0e1116';
        ctx.lineWidth = 4;
        ctx.strokeRect(p.x, p.y, p.w, p.h);

        // Corner chamfers / cutouts
        ctx.fillStyle = '#161920';
        ctx.fillRect(p.x + 8, p.y + 8, 16, 16);
        ctx.fillRect(p.x + p.w - 24, p.y + 8, 16, 16);
        ctx.fillRect(p.x + 8, p.y + p.h - 24, 16, 16);
        ctx.fillRect(p.x + p.w - 24, p.y + p.h - 24, 16, 16);

        // Bolt rivets in chamfers
        ctx.fillStyle = '#8e9bb0';
        [
            [p.x + 16, p.y + 16],
            [p.x + p.w - 16, p.y + 16],
            [p.x + 16, p.y + p.h - 16],
            [p.x + p.w - 16, p.y + p.h - 16]
        ].forEach(([bx, by]) => {
            ctx.beginPath();
            ctx.arc(bx, by, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#0a0d12';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });

        // Inner technical markings / subtle grid
        ctx.strokeStyle = 'rgba(0, 230, 200, 0.08)';
        ctx.lineWidth = 1;
        for (let gx = p.x + 40; gx < p.x + p.w - 40; gx += 20) {
            ctx.beginPath();
            ctx.moveTo(gx, p.y + 40);
            ctx.lineTo(gx, p.y + p.h - 40);
            ctx.stroke();
        }
    });

    // Central cross conduits with cyan glow
    ctx.fillStyle = '#0f131a';
    ctx.fillRect(248, 0, 16, 512);
    ctx.fillRect(0, 248, 512, 16);

    ctx.fillStyle = '#00f0d0';
    ctx.shadowColor = '#00f0d0';
    ctx.shadowBlur = 10;
    ctx.fillRect(254, 30, 4, 452);
    ctx.fillRect(30, 254, 452, 4);

    // Center circular junction hub
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#1c222b';
    ctx.beginPath();
    ctx.arc(256, 256, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4e5d73';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.fillStyle = '#00f0d0';
    ctx.beginPath();
    ctx.arc(256, 256, 14, 0, Math.PI * 2);
    ctx.fill();

    return canvas.toDataURL('image/png');
});

// 2. cyber-screen.png (ID 49): Sci-fi holographic command terminal
await generateTexture('cyber-screen.png', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Deep space dark navy base
    ctx.fillStyle = '#080d16';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle scanlines
    ctx.fillStyle = 'rgba(0, 240, 220, 0.03)';
    for (let y = 0; y < 512; y += 4) {
        ctx.fillRect(0, y, 512, 2);
    }

    // Grid overlay
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.12)';
    ctx.lineWidth = 1;
    for (let x = 32; x < 512; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 32);
        ctx.lineTo(x, 480);
        ctx.stroke();
    }
    for (let y = 32; y < 512; y += 32) {
        ctx.beginPath();
        ctx.moveTo(32, y);
        ctx.lineTo(480, y);
        ctx.stroke();
    }

    // Outer UI bezel border
    ctx.strokeStyle = '#00f0d0';
    ctx.lineWidth = 3;
    ctx.strokeRect(20, 20, 472, 472);

    // Corner brackets
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#00f0d0';
    // Top-Left
    ctx.beginPath(); ctx.moveTo(14, 40); ctx.lineTo(14, 14); ctx.lineTo(40, 14); ctx.stroke();
    // Top-Right
    ctx.beginPath(); ctx.moveTo(472, 14); ctx.lineTo(498, 14); ctx.lineTo(498, 40); ctx.stroke();
    // Bottom-Left
    ctx.beginPath(); ctx.moveTo(14, 472); ctx.lineTo(14, 498); ctx.lineTo(40, 498); ctx.stroke();
    // Bottom-Right
    ctx.beginPath(); ctx.moveTo(472, 498); ctx.lineTo(498, 498); ctx.lineTo(498, 472); ctx.stroke();

    // Radar circle in top-left
    ctx.strokeStyle = 'rgba(0, 240, 220, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(140, 140, 70, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(140, 140, 40, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(140, 140, 15, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(70, 140); ctx.lineTo(210, 140); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(140, 70); ctx.lineTo(140, 210); ctx.stroke();
    // Radar blips
    ctx.fillStyle = '#ff8800';
    ctx.beginPath(); ctx.arc(160, 115, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(110, 165, 3, 0, Math.PI * 2); ctx.fill();

    // Telemetry bars on top-right
    const barX = 260;
    for (let i = 0; i < 8; i++) {
        const val = 40 + Math.sin(i * 1.2) * 35;
        ctx.fillStyle = i < 6 ? '#00f0d0' : '#ff8800';
        ctx.fillRect(barX + i * 24, 180 - val, 16, val);
    }

    // Oscilloscope sine waveform in center
    ctx.strokeStyle = '#00f0d0';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00f0d0';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let x = 40; x <= 472; x += 4) {
        const y = 280 + Math.sin(x * 0.04) * 25 + Math.sin(x * 0.1) * 12;
        if (x === 40) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Terminal data readout lines in bottom
    ctx.fillStyle = 'rgba(0, 240, 220, 0.8)';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('SYS.CORE // DIAGNOSTICS: NOMINAL', 40, 360);
    ctx.fillText('FLUX REACTOR: 98.4% [STABLE]', 40, 385);
    ctx.fillText('QUANTUM MATRIX LINK: ACTIVE', 40, 410);
    ctx.fillText('SECTOR 07: AIRLOCK SECURED', 40, 435);

    // Status warning badge in bottom right
    ctx.fillStyle = '#ff8800';
    ctx.fillRect(360, 400, 110, 36);
    ctx.fillStyle = '#080d16';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('AUTO-LOCK', 375, 424);

    return canvas.toDataURL('image/png');
});

// 3. cyber-grille.png (ID 50): Industrial ventilation & cooling grille
await generateTexture('cyber-grille.png', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Dark chassis background
    ctx.fillStyle = '#14171d';
    ctx.fillRect(0, 0, 512, 512);

    // Outer reinforced bezel
    ctx.strokeStyle = '#2d3542';
    ctx.lineWidth = 16;
    ctx.strokeRect(8, 8, 496, 496);

    // Heavy corner bolts
    ctx.fillStyle = '#9aa7bc';
    [[32, 32], [480, 32], [32, 480], [480, 480]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0d1015';
        ctx.lineWidth = 3;
        ctx.stroke();
    });

    // Horizontal louver slats
    const slatHeight = 24;
    const gap = 12;
    for (let y = 64; y < 448; y += slatHeight + gap) {
        // Deep shadow inside gap
        ctx.fillStyle = '#080a0e';
        ctx.fillRect(48, y - 6, 416, gap + 12);

        // Metallic slat gradient
        const sGrad = ctx.createLinearGradient(0, y, 0, y + slatHeight);
        sGrad.addColorStop(0, '#5a687d');
        sGrad.addColorStop(0.3, '#3b4554');
        sGrad.addColorStop(1, '#20252e');
        ctx.fillStyle = sGrad;
        ctx.fillRect(48, y, 416, slatHeight);

        // Upper highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.fillRect(48, y, 416, 2);

        // Lower edge shadow
        ctx.fillStyle = '#101318';
        ctx.fillRect(48, y + slatHeight - 2, 416, 2);
    }

    // Side vertical warning stripes
    ctx.fillStyle = '#ffaa00';
    ctx.fillRect(48, 64, 8, 384);
    ctx.fillRect(456, 64, 8, 384);

    return canvas.toDataURL('image/png');
});

// 4. cyber-hazard.png (ID 51): Industrial yellow & black hazard stripes
await generateTexture('cyber-hazard.png', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Fill with safety yellow
    ctx.fillStyle = '#e6a800';
    ctx.fillRect(0, 0, 512, 512);

    // Diagonal black hazard stripes (45 degrees)
    ctx.fillStyle = '#181b20';
    const stripeWidth = 64;
    for (let i = -512; i < 1024; i += stripeWidth * 2) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + stripeWidth, 0);
        ctx.lineTo(i + stripeWidth + 512, 512);
        ctx.lineTo(i + 512, 512);
        ctx.closePath();
        ctx.fill();
    }

    // Subtle edge wear / metallic grit
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, 500, 500);

    return canvas.toDataURL('image/png');
});

await browser.close();
console.log('All 4 textures generated successfully!');
