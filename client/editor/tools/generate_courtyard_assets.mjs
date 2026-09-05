import * as THREE from '../../../engine/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../../engine/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = path.resolve(__dirname, '../../desktop/public/assets');

if (typeof globalThis.FileReader === 'undefined') {
    globalThis.FileReader = class FileReader {
        readAsArrayBuffer(blob) {
            blob.arrayBuffer().then((buf) => {
                this.result = buf;
                if (this.onloadend) this.onloadend();
                if (this.onload) this.onload({ target: this });
            });
        }
    };
}

const exporter = new GLTFExporter();

function exportGLB(scene, filename) {
    return new Promise((resolve, reject) => {
        exporter.parse(
            scene,
            (gltf) => {
                const outPath = path.resolve(ASSETS_DIR, filename);
                fs.writeFileSync(outPath, Buffer.from(gltf));
                console.log(`[OK] Saved GLB: ${filename} (${fs.statSync(outPath).size} bytes)`);
                resolve();
            },
            (err) => {
                console.error(`[ERR] Failed to export ${filename}:`, err);
                reject(err);
            },
            { binary: true }
        );
    });
}

// =========================================================================
// Materials Palette for Classical Chinese Courtyard & Garden (江南园林庭院)
// =========================================================================
const matWhitePlaster = new THREE.MeshStandardMaterial({
    color: 0xedeae2,      // Warm white lime plaster wall (苏式园林白粉墙)
    roughness: 0.92,
    metalness: 0.02,
});

const matDarkBrick = new THREE.MeshStandardMaterial({
    color: 0x363940,      // Dark grey brick footing & tile coping (青砖勒脚与小青瓦)
    roughness: 0.85,
    metalness: 0.05,
});

const matRosewood = new THREE.MeshStandardMaterial({
    color: 0x42190e,      // Polished dark rosewood timber (老红木雕花门框木架)
    roughness: 0.45,
    metalness: 0.08,
});

const matGranite = new THREE.MeshStandardMaterial({
    color: 0x62666f,      // Weathered grey granite stone (青石板与石台阶)
    roughness: 0.78,
    metalness: 0.06,
});

const matTaihuStone = new THREE.MeshStandardMaterial({
    color: 0x565961,      // Pitted Taihu limestone (太湖石假山叠石)
    roughness: 0.88,
    metalness: 0.04,
});

const matBrass = new THREE.MeshStandardMaterial({
    color: 0xc89e44,      // Antique bronze/brass fittings (仿古铜件)
    roughness: 0.32,
    metalness: 0.80,
});

const matCeladon = new THREE.MeshStandardMaterial({
    color: 0x76a38f,      // Yue ware / Longquan celadon tea set (龙泉青瓷茶具)
    roughness: 0.24,
    metalness: 0.12,
});

const matMoss = new THREE.MeshStandardMaterial({
    color: 0x3b5f2c,      // Emerald green velvet garden moss (青苔绿意)
    roughness: 0.95,
    metalness: 0.01,
});

const matWater = new THREE.MeshStandardMaterial({
    color: 0x1d3545,      // Dark reflective well water (幽深井水)
    roughness: 0.10,
    metalness: 0.25,
});

const matInvisibleAnchor = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
});

function addBoundingAnchors(group, w, h, d) {
    const anchorGeom = new THREE.BoxGeometry(0.002, 0.002, 0.002);
    const a1 = new THREE.Mesh(anchorGeom, matInvisibleAnchor);
    a1.position.set(-w / 2, -h / 2, -d / 2);
    group.add(a1);

    const a2 = new THREE.Mesh(anchorGeom, matInvisibleAnchor);
    a2.position.set(w / 2, h / 2, d / 2);
    group.add(a2);
}

// =========================================================================
// 1. Classical Chinese Moon Gate (苏式园林圆形月亮门) - ID 105
// 4.0m W x 4.0m H x 0.45m D
// =========================================================================
function buildMoonGate() {
    const group = new THREE.Group();
    group.name = 'Pal1MoonGate';
    const W = 4.0, H = 4.0, D = 0.45;

    // Plinth footing (青砖台基)
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(W, 0.25, D), matDarkBrick);
    plinth.position.set(0, -H / 2 + 0.125, 0);
    group.add(plinth);

    // Geometry of Circular Moon Opening:
    // Center is (0, -0.25), Radius is 1.12m
    const gateCenterY = -0.25;
    const gateR = 1.12;

    // Solid Top Lintel above the Moon Gate (门顶通长粉墙梁)
    // Runs across the full 4.0m width from y = 0.82m to y = 1.80m
    const topH = (H / 2 - 0.20) - (gateCenterY + gateR - 0.05); // ~1.80 - 0.82 = 0.98m
    const topLintel = new THREE.Mesh(new THREE.BoxGeometry(W, topH, D * 0.8), matWhitePlaster);
    topLintel.position.set(0, H / 2 - 0.20 - topH / 2, 0);
    group.add(topLintel);

    // Left and Right Wall Panels (两侧通高粉墙)
    // From x = -2.0 to -1.08 (width 0.92m), and x = 1.08 to 2.0 (width 0.92m)
    const sideW = 0.92;
    const sideH = (H / 2 - 0.20) - (-H / 2 + 0.25); // 3.55m
    const sideY = (-H / 2 + 0.25 + H / 2 - 0.20) / 2;

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(sideW, sideH, D * 0.8), matWhitePlaster);
    leftWall.position.set(-W / 2 + sideW / 2, sideY, 0);
    group.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(sideW, sideH, D * 0.8), matWhitePlaster);
    rightWall.position.set(W / 2 - sideW / 2, sideY, 0);
    group.add(rightWall);

    // Top-Left and Top-Right Spandrel Infill (上拱肩严密填缝)
    const spandrelW = 0.38, spandrelH = 0.45;
    const spandrelY = gateCenterY + 0.72;
    const tlCorner = new THREE.Mesh(new THREE.BoxGeometry(spandrelW, spandrelH, D * 0.8), matWhitePlaster);
    tlCorner.position.set(-gateR + spandrelW / 2, spandrelY, 0);
    group.add(tlCorner);

    const trCorner = new THREE.Mesh(new THREE.BoxGeometry(spandrelW, spandrelH, D * 0.8), matWhitePlaster);
    trCorner.position.set(gateR - spandrelW / 2, spandrelY, 0);
    group.add(trCorner);

    // Bottom-Left and Bottom-Right Spandrel Infill (下拱肩严密填缝)
    const bSpandrelH = 0.40;
    const bSpandrelY = gateCenterY - 0.72;
    const blCorner = new THREE.Mesh(new THREE.BoxGeometry(spandrelW, bSpandrelH, D * 0.8), matWhitePlaster);
    blCorner.position.set(-gateR + spandrelW / 2, bSpandrelY, 0);
    group.add(blCorner);

    const brCorner = new THREE.Mesh(new THREE.BoxGeometry(spandrelW, bSpandrelH, D * 0.8), matWhitePlaster);
    brCorner.position.set(gateR - spandrelW / 2, bSpandrelY, 0);
    group.add(brCorner);

    // Bottom Threshold Stone (月亮门下嵌青石门槛)
    const threshold = new THREE.Mesh(new THREE.BoxGeometry(2.28, 0.12, D * 0.9), matGranite);
    threshold.position.set(0, -H / 2 + 0.25 + 0.06, 0);
    group.add(threshold);

    // Inner Circular Wall Lining (月亮门洞内壁圆弧红木贴面)
    const innerLining = new THREE.Mesh(new THREE.CylinderGeometry(gateR, gateR, D * 0.82, 48, 1, true), matRosewood);
    innerLining.rotation.x = Math.PI / 2;
    innerLining.position.set(0, gateCenterY, 0);
    group.add(innerLining);

    // Front & Back Rosewood Architrave Mouldings (前后双面红木圆环门框)
    const frontRing = new THREE.Mesh(new THREE.TorusGeometry(gateR, 0.05, 12, 48), matRosewood);
    frontRing.position.set(0, gateCenterY, D * 0.41);
    group.add(frontRing);

    const backRing = new THREE.Mesh(new THREE.TorusGeometry(gateR, 0.05, 12, 48), matRosewood);
    backRing.position.set(0, gateCenterY, -D * 0.41);
    group.add(backRing);

    // Carved Drum-shaped Plinth Stones (抱鼓石门枕) at Left & Right base
    const drumL = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.22, 24), matGranite);
    drumL.rotation.x = Math.PI / 2;
    drumL.position.set(-1.08, -H / 2 + 0.45, 0);
    group.add(drumL);

    const drumR = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.22, 24), matGranite);
    drumR.rotation.x = Math.PI / 2;
    drumR.position.set(1.08, -H / 2 + 0.45, 0);
    group.add(drumR);

    // Tile Coping on Top (小青瓦悬山门罩屋顶)
    const roofBeam = new THREE.Mesh(new THREE.BoxGeometry(W + 0.15, 0.10, D + 0.15), matDarkBrick);
    roofBeam.position.set(0, H / 2 - 0.20, 0);
    group.add(roofBeam);

    // Ridge Roll along top
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, W + 0.2, 16), matDarkBrick);
    roll.rotation.z = Math.PI / 2;
    roll.position.set(0, H / 2 - 0.12, 0);
    group.add(roll);

    // Upturned corner accents
    const upturnL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.18), matBrass);
    upturnL.position.set(-W / 2 - 0.06, H / 2 - 0.10, 0);
    upturnL.rotation.z = 0.4;
    group.add(upturnL);

    const upturnR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.18), matBrass);
    upturnR.position.set(W / 2 + 0.06, H / 2 - 0.10, 0);
    upturnR.rotation.z = -0.4;
    group.add(upturnR);

    addBoundingAnchors(group, W, H, D);
    return group;
}

// =========================================================================
// 2. Classical Chinese Stone Table & 4 Drum Stools (青石八仙桌与石鼓凳) - ID 106
// 2.4m W x 1.2m H x 2.4m D
// =========================================================================
function buildStoneTable() {
    const group = new THREE.Group();
    group.name = 'Pal1StoneTable';
    const W = 2.4, H = 1.2, D = 2.4;

    // Ground platform slab (石板地基)
    const baseSlab = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.18, 0.06, 24), matGranite);
    baseSlab.position.set(0, -H / 2 + 0.03, 0);
    group.add(baseSlab);

    // Central Table Pedestal Base (须弥座基座)
    const basePedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 0.15, 16), matGranite);
    basePedestal.position.set(0, -H / 2 + 0.135, 0);
    group.add(basePedestal);

    // Carved Column Shaft (八棱石桌柱)
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.22, 0.58, 8), matGranite);
    column.position.set(0, -H / 2 + 0.50, 0);
    group.add(column);

    // Tabletop Stone Disc (厚实青石圆桌面)
    const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.70, 0.09, 32), matGranite);
    tableTop.position.set(0, -H / 2 + 0.835, 0);
    group.add(tableTop);

    // Celadon Tea Set (龙泉青瓷茶具)
    const teaTray = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 16), matRosewood);
    teaTray.position.set(0, -H / 2 + 0.89, 0);
    group.add(teaTray);

    const teaPot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), matCeladon);
    teaPot.position.set(0, -H / 2 + 0.96, 0);
    teaPot.scale.set(1, 0.85, 1);
    group.add(teaPot);

    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 8, 16, Math.PI), matBrass);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, -H / 2 + 1.03, 0);
    group.add(handle);

    // 4 Tea Cups
    const cupAngles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    for (const ca of cupAngles) {
        const cx = Math.cos(ca) * 0.14;
        const cz = Math.sin(ca) * 0.14;
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.018, 0.035, 10), matCeladon);
        cup.position.set(cx, -H / 2 + 0.915, cz);
        group.add(cup);
    }

    // 4 Drum-shaped Stone Stools (四大石鼓凳)
    const stoolAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
    const stoolR = 0.86;
    for (const sa of stoolAngles) {
        const sx = Math.cos(sa) * stoolR;
        const sz = Math.sin(sa) * stoolR;

        const stoolGroup = new THREE.Group();
        stoolGroup.position.set(sx, -H / 2 + 0.27, sz);

        const drumBody = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.44, 16), matGranite);
        drumBody.scale.set(1.18, 1.0, 1.18);
        stoolGroup.add(drumBody);

        const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 16), matGranite);
        seat.position.set(0, 0.22, 0);
        stoolGroup.add(seat);

        for (let b = 0; b < 8; b++) {
            const ba = (b / 8) * Math.PI * 2;
            const bx = Math.cos(ba) * 0.24;
            const bz = Math.sin(ba) * 0.24;
            const stud = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), matBrass);
            stud.position.set(bx, 0.16, bz);
            stoolGroup.add(stud);
        }

        group.add(stoolGroup);
    }

    addBoundingAnchors(group, W, H, D);
    return group;
}

// =========================================================================
// 3. Ancient Octagonal Stone Well with Pulley (客栈青石八角古井) - ID 107
// 2.0m W x 2.2m H x 2.0m D
// =========================================================================
function buildAncientWell() {
    const group = new THREE.Group();
    group.name = 'Pal1AncientWell';
    const W = 2.0, H = 2.2, D = 2.0;

    // Octagonal Well Platform base (八角石基)
    const baseOct = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.98, 0.08, 8), matGranite);
    baseOct.position.set(0, -H / 2 + 0.04, 0);
    group.add(baseOct);

    // Octagonal Stone Well Curb (八角井圈)
    const numCurbSides = 8;
    const curbR = 0.58;
    for (let i = 0; i < numCurbSides; i++) {
        const th0 = (i / numCurbSides) * Math.PI * 2;
        const th1 = ((i + 1) / numCurbSides) * Math.PI * 2;
        const x0 = Math.cos(th0) * curbR, z0 = Math.sin(th0) * curbR;
        const x1 = Math.cos(th1) * curbR, z1 = Math.sin(th1) * curbR;
        const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2;
        const len = Math.hypot(x1 - x0, z1 - z0);
        const angle = Math.atan2(z1 - z0, x1 - x0);

        const slab = new THREE.Mesh(new THREE.BoxGeometry(len + 0.02, 0.65, 0.12), matGranite);
        slab.position.set(xm, -H / 2 + 0.40, zm);
        slab.rotation.y = -angle;
        group.add(slab);
    }

    // Interior Well Water Surface (幽深井水)
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.05, 16), matWater);
    water.position.set(0, -H / 2 + 0.20, 0);
    group.add(water);

    // Two Upright Timber Posts (两侧木质井架立柱)
    const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.065, 1.45, 10), matRosewood);
    postL.position.set(-0.62, -H / 2 + 0.95, 0);
    group.add(postL);

    const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.065, 1.45, 10), matRosewood);
    postR.position.set(0.62, -H / 2 + 0.95, 0);
    group.add(postR);

    // Top Crossbeam (顶部横梁)
    const crossbeam = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.10, 0.12), matRosewood);
    crossbeam.position.set(0, -H / 2 + 1.68, 0);
    group.add(crossbeam);

    // Miniature Rooflet on top of well frame (小歇山水井遮雨屋顶)
    const wellRoof = new THREE.Mesh(new THREE.BoxGeometry(1.60, 0.08, 0.55), matDarkBrick);
    wellRoof.position.set(0, -H / 2 + 1.77, 0);
    group.add(wellRoof);

    const wellRidge = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.65, 8), matDarkBrick);
    wellRidge.rotation.z = Math.PI / 2;
    wellRidge.position.set(0, -H / 2 + 1.83, 0);
    group.add(wellRidge);

    // Winding Pulley Axle & Spool (绞轴与辘轳)
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.15, 8), matBrass);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(0, -H / 2 + 1.45, 0);
    group.add(axle);

    const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.35, 12), matRosewood);
    spool.rotation.z = Math.PI / 2;
    spool.position.set(0, -H / 2 + 1.45, 0);
    group.add(spool);

    // Crank Handle on Right
    const crankArm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), matBrass);
    crankArm.position.set(0.60, -H / 2 + 1.38, 0);
    group.add(crankArm);

    const crankPeg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), matRosewood);
    crankPeg.rotation.x = Math.PI / 2;
    crankPeg.position.set(0.60, -H / 2 + 1.28, 0.06);
    group.add(crankPeg);

    // Hanging Wooden Water Bucket (吊桶)
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.10, 0.26, 12), matRosewood);
    bucket.position.set(0, -H / 2 + 0.95, 0);
    group.add(bucket);

    const bucketHoop = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.008, 6, 16), matBrass);
    bucketHoop.rotation.x = Math.PI / 2;
    bucketHoop.position.set(0, -H / 2 + 0.95, 0);
    group.add(bucketHoop);

    addBoundingAnchors(group, W, H, D);
    return group;
}

// =========================================================================
// 4. Taihu Stone Ornamental Rockery & Moss (太湖石叠石假山) - ID 108
// 2.8m W x 2.4m H x 2.0m D
// =========================================================================
function buildTaihuRockery() {
    const group = new THREE.Group();
    group.name = 'Pal1TaihuRockery';
    const W = 2.8, H = 2.4, D = 2.0;

    // Carved Stone Plinth Basin (须弥座石盆台)
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.22, 1.65), matGranite);
    plinth.position.set(0, -H / 2 + 0.11, 0);
    group.add(plinth);

    const plinthRim = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.06, 1.75), matGranite);
    plinthRim.position.set(0, -H / 2 + 0.23, 0);
    group.add(plinthRim);

    const soilBed = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.04, 1.55), matDarkBrick);
    soilBed.position.set(0, -H / 2 + 0.25, 0);
    group.add(soilBed);

    // Clustered Organic Porous Rock Masses (太湖石主峰与侧峰)
    const peak1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.68, 1), matTaihuStone);
    peak1.scale.set(0.9, 1.55, 0.8);
    peak1.position.set(-0.15, -H / 2 + 1.25, 0.05);
    peak1.rotation.set(0.2, 0.4, -0.15);
    group.add(peak1);

    const peakTop = new THREE.Mesh(new THREE.DodecahedronGeometry(0.48, 1), matTaihuStone);
    peakTop.scale.set(0.85, 1.3, 0.75);
    peakTop.position.set(-0.10, -H / 2 + 1.85, -0.05);
    peakTop.rotation.set(-0.3, 0.6, 0.2);
    group.add(peakTop);

    const peak2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 1), matTaihuStone);
    peak2.scale.set(1.1, 1.15, 0.9);
    peak2.position.set(-0.68, -H / 2 + 0.85, -0.12);
    peak2.rotation.set(0.1, -0.5, 0.3);
    group.add(peak2);

    const peak3 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.52, 1), matTaihuStone);
    peak3.scale.set(0.95, 1.25, 0.85);
    peak3.position.set(0.62, -H / 2 + 0.95, 0.15);
    peak3.rotation.set(-0.4, 0.3, -0.2);
    group.add(peak3);

    const foot1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.38, 1), matTaihuStone);
    foot1.position.set(0.75, -H / 2 + 0.45, -0.35);
    group.add(foot1);

    const foot2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 1), matTaihuStone);
    foot2.position.set(-0.75, -H / 2 + 0.42, 0.38);
    group.add(foot2);

    // Moss Pillows
    const moss1 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), matMoss);
    moss1.scale.set(1.4, 0.4, 1.2);
    moss1.position.set(-0.35, -H / 2 + 0.28, 0.45);
    group.add(moss1);

    const moss2 = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), matMoss);
    moss2.scale.set(1.2, 0.4, 1.1);
    moss2.position.set(0.45, -H / 2 + 0.28, -0.25);
    group.add(moss2);

    const moss3 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), matMoss);
    moss3.scale.set(1.0, 0.5, 0.8);
    moss3.position.set(0.15, -H / 2 + 1.15, 0.42);
    group.add(moss3);

    // Pine Accent
    const pineTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.45, 6), matRosewood);
    pineTrunk.position.set(0.38, -H / 2 + 1.35, 0.20);
    pineTrunk.rotation.z = -0.55;
    group.add(pineTrunk);

    const pineFoliage = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), matMoss);
    pineFoliage.scale.set(1.4, 0.6, 1.2);
    pineFoliage.position.set(0.55, -H / 2 + 1.52, 0.22);
    group.add(pineFoliage);

    addBoundingAnchors(group, W, H, D);
    return group;
}

// =========================================================================
// 5. Whitewashed Courtyard Wall with Leak Window (白粉墙与海棠漏窗) - ID 109
// 4.0m W x 4.0m H x 0.35m D
// =========================================================================
function buildGardenWall() {
    const group = new THREE.Group();
    group.name = 'Pal1GardenWall';
    const W = 4.0, H = 4.0, D = 0.35;

    // Dark grey brick footing
    const footing = new THREE.Mesh(new THREE.BoxGeometry(W, 0.45, D), matDarkBrick);
    footing.position.set(0, -H / 2 + 0.225, 0);
    group.add(footing);

    // Solid Whitewashed Plaster Wall below window
    const bottomWall = new THREE.Mesh(new THREE.BoxGeometry(W, 1.05, D * 0.85), matWhitePlaster);
    bottomWall.position.set(0, -H / 2 + 0.45 + 0.525, 0);
    group.add(bottomWall);

    // Solid Whitewashed Plaster Wall above window
    const topWall = new THREE.Mesh(new THREE.BoxGeometry(W, 1.05, D * 0.85), matWhitePlaster);
    topWall.position.set(0, H / 2 - 0.35 - 0.525, 0);
    group.add(topWall);

    // Left and Right Wall flanking window
    const flankW = 1.35;
    const windowH = 1.10;
    const leftFlank = new THREE.Mesh(new THREE.BoxGeometry(flankW, windowH, D * 0.85), matWhitePlaster);
    leftFlank.position.set(-W / 2 + flankW / 2, 0.125, 0);
    group.add(leftFlank);

    const rightFlank = new THREE.Mesh(new THREE.BoxGeometry(flankW, windowH, D * 0.85), matWhitePlaster);
    rightFlank.position.set(W / 2 - flankW / 2, 0.125, 0);
    group.add(rightFlank);

    // Central Open Leak Window Frame
    const winW = W - 2 * flankW; // 1.30m
    const frameT = 0.08;

    const winLeft = new THREE.Mesh(new THREE.BoxGeometry(frameT, windowH, D * 0.9), matRosewood);
    winLeft.position.set(-winW / 2 + frameT / 2, 0.125, 0);
    group.add(winLeft);

    const winRight = new THREE.Mesh(new THREE.BoxGeometry(frameT, windowH, D * 0.9), matRosewood);
    winRight.position.set(winW / 2 - frameT / 2, 0.125, 0);
    group.add(winRight);

    const winTop = new THREE.Mesh(new THREE.BoxGeometry(winW, frameT, D * 0.9), matRosewood);
    winTop.position.set(0, 0.125 + windowH / 2 - frameT / 2, 0);
    group.add(winTop);

    const winBottom = new THREE.Mesh(new THREE.BoxGeometry(winW, frameT, D * 0.9), matRosewood);
    winBottom.position.set(0, 0.125 - windowH / 2 + frameT / 2, 0);
    group.add(winBottom);

    // Classical Suzhou Garden Begonia & Diamond Leak Window Lattice (苏式园林海棠方胜冰裂漏窗)
    const ribT = 0.024;
    const innerW = winW - 2 * frameT;
    const innerH = windowH - 2 * frameT;

    // Outer Circular Torus Border (圆光内外相映)
    const ringR = 0.38;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.022, 12, 36), matRosewood);
    ring.position.set(0, 0.125, 0);
    group.add(ring);

    // Center Diamond (方胜纹旋转方框)
    const diamondR = 0.16; // half diagonal length
    const dSide = diamondR * Math.SQRT2;
    for (let i = 0; i < 4; i++) {
        const theta = (i * Math.PI / 2) + Math.PI / 4;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(dSide, ribT, 0.04), matRosewood);
        bar.position.set(
            Math.cos(theta) * (diamondR * 0.707),
            0.125 + Math.sin(theta) * (diamondR * 0.707),
            0
        );
        bar.rotation.z = (i % 2 === 0) ? -Math.PI / 4 : Math.PI / 4;
        group.add(bar);
    }

    // 4 Cross Struts connecting Diamond to Circular Ring (四向延展经纬棂条)
    const strutLen = ringR - diamondR;
    const strutH = new THREE.Mesh(new THREE.BoxGeometry(strutLen, ribT, 0.04), matRosewood);
    strutH.position.set(-diamondR - strutLen / 2, 0.125, 0);
    group.add(strutH);

    const strutH2 = new THREE.Mesh(new THREE.BoxGeometry(strutLen, ribT, 0.04), matRosewood);
    strutH2.position.set(diamondR + strutLen / 2, 0.125, 0);
    group.add(strutH2);

    const strutV = new THREE.Mesh(new THREE.BoxGeometry(ribT, strutLen, 0.04), matRosewood);
    strutV.position.set(0, 0.125 + diamondR + strutLen / 2, 0);
    group.add(strutV);

    const strutV2 = new THREE.Mesh(new THREE.BoxGeometry(ribT, strutLen, 0.04), matRosewood);
    strutV2.position.set(0, 0.125 - diamondR - strutLen / 2, 0);
    group.add(strutV2);

    // 4 Corner diagonal ties connecting Circular Ring to Outer Rectangular Frame (四角套结托角棂)
    const cornerTieLen = 0.22;
    const cornerOffsets = [
        [-innerW / 2 + 0.10, innerH / 2 - 0.10, Math.PI / 4],
        [innerW / 2 - 0.10, innerH / 2 - 0.10, -Math.PI / 4],
        [-innerW / 2 + 0.10, -innerH / 2 + 0.10, -Math.PI / 4],
        [innerW / 2 - 0.10, -innerH / 2 + 0.10, Math.PI / 4],
    ];
    for (const [cx, cy, rot] of cornerOffsets) {
        const tie = new THREE.Mesh(new THREE.BoxGeometry(cornerTieLen, ribT, 0.04), matRosewood);
        tie.position.set(cx, 0.125 + cy, 0);
        tie.rotation.z = rot;
        group.add(tie);
    }

    // Tile Coping along Wall Top
    const coping = new THREE.Mesh(new THREE.BoxGeometry(W + 0.10, 0.12, D + 0.12), matDarkBrick);
    coping.position.set(0, H / 2 - 0.22, 0);
    group.add(coping);

    const ridgeRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, W + 0.15, 10), matDarkBrick);
    ridgeRoll.rotation.z = Math.PI / 2;
    ridgeRoll.position.set(0, H / 2 - 0.13, 0);
    group.add(ridgeRoll);

    for (let x = -W / 2 + 0.2; x <= W / 2 - 0.1; x += 0.3) {
        const dripFront = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 8), matDarkBrick);
        dripFront.rotation.x = Math.PI / 2;
        dripFront.position.set(x, H / 2 - 0.26, D / 2 + 0.04);
        group.add(dripFront);

        const dripBack = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 8), matDarkBrick);
        dripBack.rotation.x = Math.PI / 2;
        dripBack.position.set(x, H / 2 - 0.26, -D / 2 - 0.04);
        group.add(dripBack);
    }

    addBoundingAnchors(group, W, H, D);
    return group;
}

// =========================================================================
// Main Export Routine
// =========================================================================
async function main() {
    console.log('Generating Chinese Classical Courtyard & Garden 3D Models...');

    await exportGLB(buildMoonGate(), 'pal1-courtyard-moon-gate.glb');
    await exportGLB(buildStoneTable(), 'pal1-courtyard-stone-table.glb');
    await exportGLB(buildAncientWell(), 'pal1-courtyard-ancient-well.glb');
    await exportGLB(buildTaihuRockery(), 'pal1-courtyard-rockery.glb');
    await exportGLB(buildGardenWall(), 'pal1-courtyard-garden-wall.glb');

    console.log('All 5 courtyard assets exported successfully!');
}

main().catch((err) => {
    console.error('Failed to generate courtyard assets:', err);
    process.exit(1);
});
