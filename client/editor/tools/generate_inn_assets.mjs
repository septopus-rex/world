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

// Materials palette for Yuhang Inn interior
const matDarkRosewood = new THREE.MeshStandardMaterial({
    color: 0x481c10,
    roughness: 0.45,
    metalness: 0.08,
});
const matPolishedWood = new THREE.MeshStandardMaterial({
    color: 0x6e2f18,
    roughness: 0.35,
    metalness: 0.05,
});
const matBrass = new THREE.MeshStandardMaterial({
    color: 0xd4a34b,
    roughness: 0.28,
    metalness: 0.85,
});
const matPaper = new THREE.MeshStandardMaterial({
    color: 0xf4eedb,
    roughness: 0.75,
    metalness: 0.02,
});
const matCeladon = new THREE.MeshStandardMaterial({
    color: 0x76a38f,
    roughness: 0.22,
    metalness: 0.12,
});
const matPineNeedles = new THREE.MeshStandardMaterial({
    color: 0x1f4625,
    roughness: 0.65,
    metalness: 0.05,
});
const matDarkStone = new THREE.MeshStandardMaterial({
    color: 0x33363a,
    roughness: 0.85,
    metalness: 0.05,
});

// =========================================================================
// 1. L-Shaped Inn Counter (掌柜账台) - 2.2m x 1.6m x 1.05m
// =========================================================================
function buildInnCounter() {
    const group = new THREE.Group();

    // Main Counter Body (Front facing south, along X)
    const mainW = 2.2;
    const depth = 0.65;
    const height = 1.05;
    const topT = 0.08;

    // Plinth base
    const plinthGeom = new THREE.BoxGeometry(mainW, depth, 0.1);
    const plinth = new THREE.Mesh(plinthGeom, matDarkRosewood);
    plinth.position.set(0, 0.05, 0);
    group.add(plinth);

    // Front panelling with vertical grooves (stiles & rails)
    const frontPanelGeom = new THREE.BoxGeometry(mainW - 0.08, 0.04, height - 0.12);
    const frontPanel = new THREE.Mesh(frontPanelGeom, matPolishedWood);
    frontPanel.position.set(0, (height - 0.02) / 2, depth / 2 - 0.02);
    group.add(frontPanel);

    // Decorative raised vertical moulding battens on front
    for (let x = -0.9; x <= 0.9; x += 0.3) {
        const battenGeom = new THREE.BoxGeometry(0.04, 0.025, height - 0.18);
        const batten = new THREE.Mesh(battenGeom, matDarkRosewood);
        batten.position.set(x, (height - 0.02) / 2, depth / 2 - 0.005);
        group.add(batten);
    }

    // Countertop ledge
    const topGeom = new THREE.BoxGeometry(mainW + 0.1, depth + 0.08, topT);
    const top = new THREE.Mesh(topGeom, matDarkRosewood);
    top.position.set(0, height - topT / 2, 0);
    group.add(top);

    // Return Wing (along Z, right angle corner)
    const wingL = 1.4;
    const wingPlinthGeom = new THREE.BoxGeometry(depth, wingL, 0.1);
    const wingPlinth = new THREE.Mesh(wingPlinthGeom, matDarkRosewood);
    wingPlinth.position.set(mainW / 2 - depth / 2, 0.05, -wingL / 2);
    group.add(wingPlinth);

    const wingPanelGeom = new THREE.BoxGeometry(0.04, wingL - 0.08, height - 0.12);
    const wingPanel = new THREE.Mesh(wingPanelGeom, matPolishedWood);
    wingPanel.position.set(mainW / 2 - 0.02, (height - 0.02) / 2, -wingL / 2);
    group.add(wingPanel);

    const wingTopGeom = new THREE.BoxGeometry(depth + 0.08, wingL + 0.1, topT);
    const wingTop = new THREE.Mesh(wingTopGeom, matDarkRosewood);
    wingTop.position.set(mainW / 2 - depth / 2, height - topT / 2, -wingL / 2);
    group.add(wingTop);

    // --- Countertop Accessories ---
    // 1. Chinese Brass Abacus (算盘)
    const abacusGeom = new THREE.BoxGeometry(0.35, 0.2, 0.03);
    const abacus = new THREE.Mesh(abacusGeom, matDarkRosewood);
    abacus.position.set(-0.3, height + 0.015, 0.05);
    group.add(abacus);

    const beamGeom = new THREE.BoxGeometry(0.33, 0.015, 0.015);
    const abacusBeam = new THREE.Mesh(beamGeom, matBrass);
    abacusBeam.position.set(-0.3, height + 0.03, 0.05);
    group.add(abacusBeam);

    // 2. Open Ledger Book (账册)
    const bookGeom = new THREE.BoxGeometry(0.26, 0.32, 0.02);
    const book = new THREE.Mesh(bookGeom, matPaper);
    book.position.set(0.3, height + 0.01, 0.05);
    book.rotation.y = 0.15;
    group.add(book);

    // 3. Ceramic Tea Bowl (青瓷茶碗)
    const bowlGeom = new THREE.CylinderGeometry(0.06, 0.035, 0.05, 12);
    const bowl = new THREE.Mesh(bowlGeom, matCeladon);
    bowl.position.set(0.65, height + 0.025, 0.08);
    group.add(bowl);

    // Center geometry so bounding box is centered at (0, 0, 0)
    const bbox = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    group.position.sub(center);

    const wrapper = new THREE.Group();
    wrapper.add(group);
    return wrapper;
}

// =========================================================================
// 2. Inn Staircase (直跑实木雕花楼梯) - 1.2m W x 3.2m L x 2.6m H
// =========================================================================
function buildInnStairs() {
    const group = new THREE.Group();

    const steps = 10;
    const stairW = 1.2;
    const totalL = 3.2;
    const totalH = 2.6;
    const stepL = totalL / steps;
    const stepH = totalH / steps;

    for (let i = 0; i < steps; i++) {
        // Step tread & riser
        const x = 0;
        const y = (i + 0.5) * stepH;
        const z = -totalL / 2 + (i + 0.5) * stepL;

        const stepGeom = new THREE.BoxGeometry(stairW, stepH * (i + 1), stepL + 0.04);
        const step = new THREE.Mesh(stepGeom, matPolishedWood);
        step.position.set(0, y / 2, z);
        group.add(step);

        // Tread overhang nosing
        const nosingGeom = new THREE.BoxGeometry(stairW + 0.04, 0.04, stepL + 0.04);
        const nosing = new THREE.Mesh(nosingGeom, matDarkRosewood);
        nosing.position.set(0, (i + 1) * stepH - 0.02, z);
        group.add(nosing);
    }

    // Outer Handrail Balustrade (outer side: X = stairW/2)
    const railX = stairW / 2 + 0.02;
    const railH = 0.85;

    // Posts at bottom, middle, and top
    const postIndices = [0, 5, steps - 1];
    for (const idx of postIndices) {
        const py = (idx + 1) * stepH + railH / 2;
        const pz = -totalL / 2 + (idx + 0.5) * stepL;
        const postGeom = new THREE.BoxGeometry(0.08, railH, 0.08);
        const post = new THREE.Mesh(postGeom, matDarkRosewood);
        post.position.set(railX, py, pz);
        group.add(post);

        // Post decorative finial ball
        const finialGeom = new THREE.SphereGeometry(0.055, 8, 8);
        const finial = new THREE.Mesh(finialGeom, matBrass);
        finial.position.set(railX, py + railH / 2 + 0.05, pz);
        group.add(finial);
    }

    // Slanted Handrail Bar
    const railLength = Math.hypot(totalL, totalH);
    const railAngle = Math.atan2(totalH, totalL);
    const handrailGeom = new THREE.BoxGeometry(0.06, 0.06, railLength);
    const handrail = new THREE.Mesh(handrailGeom, matDarkRosewood);
    handrail.position.set(railX, totalH / 2 + railH, 0);
    handrail.rotation.x = railAngle;
    group.add(handrail);

    // Balusters along the incline
    for (let i = 1; i < steps; i++) {
        if (postIndices.includes(i)) continue;
        const by = (i + 0.5) * stepH + railH / 2;
        const bz = -totalL / 2 + (i + 0.5) * stepL;
        const balusterGeom = new THREE.CylinderGeometry(0.02, 0.02, railH - 0.1, 8);
        const baluster = new THREE.Mesh(balusterGeom, matPolishedWood);
        baluster.position.set(railX, by, bz);
        group.add(baluster);
    }

    // Center at origin
    const bbox = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    group.position.sub(center);

    const wrapper = new THREE.Group();
    wrapper.add(group);
    return wrapper;
}

// =========================================================================
// 3. Potted Pine Bonsai (青瓷迎客松盆景) - 0.8m x 0.8m x 1.2m
// =========================================================================
function buildInnBonsai() {
    const group = new THREE.Group();

    // 1. Carved Rosewood Pedestal Stand (红木底座)
    const standGeom = new THREE.BoxGeometry(0.55, 0.28, 0.55);
    const stand = new THREE.Mesh(standGeom, matDarkRosewood);
    stand.position.set(0, 0.14, 0);
    group.add(stand);

    // 2. Hexagonal Celadon Ceramic Pot (青瓷六角花盆)
    const potH = 0.26;
    const potGeom = new THREE.CylinderGeometry(0.32, 0.24, potH, 6);
    const pot = new THREE.Mesh(potGeom, matCeladon);
    pot.position.set(0, 0.28 + potH / 2, 0);
    group.add(pot);

    // Soil
    const soilGeom = new THREE.CylinderGeometry(0.30, 0.30, 0.04, 6);
    const soil = new THREE.Mesh(soilGeom, matDarkStone);
    soil.position.set(0, 0.28 + potH - 0.01, 0);
    group.add(soil);

    // 3. Gnarled Bonsai Pine Trunk & Branches
    const trunkCurves = [
        [0, 0.52, 0, 0.08, 0.30, 0.1], // Base trunk
        [0.08, 0.78, 0.04, 0.06, 0.26, -0.3], // Mid bend
        [-0.04, 0.96, 0.02, 0.045, 0.24, 0.4], // Upper branch left
        [0.18, 0.92, -0.04, 0.04, 0.22, -0.5], // Upper branch right
    ];

    for (const [x, y, z, r, len, rotZ] of trunkCurves) {
        const branchGeom = new THREE.CylinderGeometry(r * 0.8, r, len, 8);
        const branch = new THREE.Mesh(branchGeom, matDarkRosewood);
        branch.position.set(x, y, z);
        branch.rotation.z = rotZ;
        group.add(branch);
    }

    // 4. Pine Foliage Clusters (Foliage clouds)
    const foliageClusters = [
        [-0.18, 1.08, 0.05, 0.20, 0.10],
        [0.02, 1.15, 0.0, 0.24, 0.12],
        [0.26, 1.02, -0.06, 0.18, 0.09],
        [-0.05, 0.88, 0.15, 0.16, 0.08],
        [0.15, 0.82, 0.12, 0.15, 0.08],
    ];

    for (const [cx, cy, cz, rxz, ry] of foliageClusters) {
        const folGeom = new THREE.SphereGeometry(rxz, 8, 6);
        folGeom.scale(1.0, ry / rxz, 1.0);
        const fol = new THREE.Mesh(folGeom, matPineNeedles);
        fol.position.set(cx, cy, cz);
        group.add(fol);
    }

    // Center at origin
    const bbox = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    group.position.sub(center);

    const wrapper = new THREE.Group();
    wrapper.add(group);
    return wrapper;
}

// =========================================================================
// 4. Traditional Chinese Partition Lattice Window (落地隔扇木格花窗) - 1.3m x 0.08m x 2.6m
// =========================================================================
function buildInnWindow() {
    const group = new THREE.Group();
    group.name = 'Pal1InnWindow';

    const W = 1.30;
    const H = 2.60;
    const D = 0.08;
    const frameT = 0.07;

    // 1. Outer Frame (Rosewood)
    const stileGeom = new THREE.BoxGeometry(frameT, H, D);
    const leftStile = new THREE.Mesh(stileGeom, matDarkRosewood);
    leftStile.position.set(-W / 2 + frameT / 2, 0, 0);
    group.add(leftStile);

    const rightStile = new THREE.Mesh(stileGeom, matDarkRosewood);
    rightStile.position.set(W / 2 - frameT / 2, 0, 0);
    group.add(rightStile);

    const innerW = W - 2 * frameT;
    const topRailGeom = new THREE.BoxGeometry(innerW, frameT, D);
    const topRail = new THREE.Mesh(topRailGeom, matDarkRosewood);
    topRail.position.set(0, H / 2 - frameT / 2, 0);
    group.add(topRail);

    const bottomRailGeom = new THREE.BoxGeometry(innerW, 0.10, D);
    const bottomRail = new THREE.Mesh(bottomRailGeom, matDarkRosewood);
    bottomRail.position.set(0, -H / 2 + 0.05, 0);
    group.add(bottomRail);

    // 2. Horizontal Dividing Rails
    const midRailGeom = new THREE.BoxGeometry(innerW, 0.05, D * 0.9);
    const midRailTop = new THREE.Mesh(midRailGeom, matDarkRosewood);
    midRailTop.position.set(0, 0.82, 0);
    group.add(midRailTop);

    const waistRail = new THREE.Mesh(midRailGeom, matDarkRosewood);
    waistRail.position.set(0, -0.40, 0);
    group.add(waistRail);

    const apronRail = new THREE.Mesh(midRailGeom, matDarkRosewood);
    apronRail.position.set(0, -0.65, 0);
    group.add(apronRail);

    // 3. Central Lattice Window Core (槅心)
    const coreH = 0.82 - (-0.40) - 0.05;
    const coreY = (-0.40 + 0.82) / 2;

    // Translucent warm silk paper backing
    const paperGeom = new THREE.PlaneGeometry(innerW - 0.02, coreH - 0.02);
    const paperFront = new THREE.Mesh(paperGeom, matPaper);
    paperFront.position.set(0, coreY, 0.005);
    group.add(paperFront);
    const paperBack = new THREE.Mesh(paperGeom, matPaper);
    paperBack.position.set(0, coreY, -0.005);
    paperBack.rotation.y = Math.PI;
    group.add(paperBack);

    // 3D Interlocking Lattice Grille
    const ribT = 0.022;
    const ribD = 0.035;

    // Vertical ribs (4 bars)
    const vCols = 4;
    const vSpacing = innerW / (vCols + 1);
    for (let c = 1; c <= vCols; c++) {
        const rx = -innerW / 2 + c * vSpacing;
        const vRib = new THREE.Mesh(new THREE.BoxGeometry(ribT, coreH, ribD), matPolishedWood);
        vRib.position.set(rx, coreY, 0);
        group.add(vRib);
    }

    // Horizontal ribs (6 bars)
    const hRows = 6;
    const hSpacing = coreH / (hRows + 1);
    for (let r = 1; r <= hRows; r++) {
        const ry = coreY - coreH / 2 + r * hSpacing;
        const hRib = new THREE.Mesh(new THREE.BoxGeometry(innerW, ribT, ribD), matPolishedWood);
        hRib.position.set(0, ry, 0);
        group.add(hRib);
    }

    // Geometric diamond lattice centers (方胜菱形木棂)
    for (let c = 1; c <= vCols - 1; c++) {
        for (let r = 1; r <= hRows - 1; r++) {
            if ((c + r) % 2 === 0) {
                const cx = -innerW / 2 + (c + 0.5) * vSpacing;
                const cy = coreY - coreH / 2 + (r + 0.5) * hSpacing;
                const diagGeom = new THREE.BoxGeometry(vSpacing * 0.55, ribT * 0.8, ribD * 0.9);
                const d1 = new THREE.Mesh(diagGeom, matPolishedWood);
                d1.position.set(cx, cy, 0);
                d1.rotation.z = Math.PI / 4;
                group.add(d1);
                const d2 = new THREE.Mesh(diagGeom, matPolishedWood);
                d2.position.set(cx, cy, 0);
                d2.rotation.z = -Math.PI / 4;
                group.add(d2);
            }
        }
    }

    // 4. Top Transom Lattice (楣子)
    const transomH = H / 2 - frameT - 0.82 - 0.025;
    const transomY = 0.82 + 0.025 + transomH / 2;
    const transomPaper = new THREE.Mesh(new THREE.PlaneGeometry(innerW - 0.02, transomH - 0.02), matPaper);
    transomPaper.position.set(0, transomY, 0.005);
    group.add(transomPaper);

    for (let c = 1; c <= 3; c++) {
        const rx = -innerW / 2 + c * (innerW / 4);
        const tRib = new THREE.Mesh(new THREE.BoxGeometry(ribT, transomH, ribD), matPolishedWood);
        tRib.position.set(rx, transomY, 0);
        group.add(tRib);
    }

    // 5. Waist Board (绦环板)
    const waistH = 0.20;
    const waistY = -0.525;
    const waistPanel = new THREE.Mesh(new THREE.BoxGeometry(innerW, waistH, D * 0.6), matDarkRosewood);
    waistPanel.position.set(0, waistY, 0);
    group.add(waistPanel);

    const waistCarve = new THREE.Mesh(new THREE.BoxGeometry(innerW * 0.7, waistH * 0.6, D * 0.75), matPolishedWood);
    waistCarve.position.set(0, waistY, 0);
    group.add(waistCarve);

    // 6. Bottom Apron Board (裙板)
    const apronH = (-0.65 - 0.025) - (-H / 2 + 0.10);
    const apronY = (-H / 2 + 0.10 + -0.675) / 2;
    const apronPanel = new THREE.Mesh(new THREE.BoxGeometry(innerW, apronH, D * 0.6), matDarkRosewood);
    apronPanel.position.set(0, apronY, 0);
    group.add(apronPanel);

    const apronCarve1 = new THREE.Mesh(new THREE.BoxGeometry(innerW * 0.82, apronH * 0.78, D * 0.75), matPolishedWood);
    apronCarve1.position.set(0, apronY, 0);
    group.add(apronCarve1);
    const apronCarve2 = new THREE.Mesh(new THREE.BoxGeometry(innerW * 0.65, apronH * 0.55, D * 0.85), matDarkRosewood);
    apronCarve2.position.set(0, apronY, 0);
    group.add(apronCarve2);

    // 7. Antique Brass Corner Plates (錾铜包角)
    const bracketSize = 0.08;
    const bracketT = 0.005;
    const bracketZ = D / 2 + bracketT / 2;
    const corners = [
        [-W / 2 + bracketSize / 2, H / 2 - bracketSize / 2],
        [W / 2 - bracketSize / 2, H / 2 - bracketSize / 2],
        [-W / 2 + bracketSize / 2, -H / 2 + bracketSize / 2],
        [W / 2 - bracketSize / 2, -H / 2 + bracketSize / 2],
    ];
    for (const [cx, cy] of corners) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(bracketSize, bracketSize, bracketT), matBrass);
        b.position.set(cx, cy, bracketZ);
        group.add(b);
        const bBack = new THREE.Mesh(new THREE.BoxGeometry(bracketSize, bracketSize, bracketT), matBrass);
        bBack.position.set(cx, cy, -bracketZ);
        group.add(bBack);
    }

    const bbox = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    group.position.sub(center);

    const wrapper = new THREE.Group();
    wrapper.add(group);
    return wrapper;
}

// =========================================================================
// 5. Traditional Chinese Openwork Gallery Balustrade (二楼走廊雕花透空栏杆) - 2.0m x 0.10m x 0.85m
// =========================================================================
function buildInnRailing() {
    const group = new THREE.Group();
    group.name = 'Pal1InnRailing';

    const W = 2.0;
    const H = 0.85;
    const D = 0.10;

    // 1. Newel Posts (望柱) - Left, Center, Right
    const postW = 0.08;
    const postH = 0.95;
    const postPositions = [-W / 2 + postW / 2, 0, W / 2 - postW / 2];

    for (const px of postPositions) {
        // Main square post
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(postW, postH - 0.12, postW), matDarkRosewood);
        shaft.position.set(px, (postH - 0.12) / 2, 0);
        group.add(shaft);

        // Brass base collar
        const baseCollar = new THREE.Mesh(new THREE.BoxGeometry(postW + 0.015, 0.08, postW + 0.015), matBrass);
        baseCollar.position.set(px, 0.04, 0);
        group.add(baseCollar);

        // Lotus bud finial
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(postW * 0.35, postW * 0.45, 0.04, 8), matBrass);
        neck.position.set(px, postH - 0.10, 0);
        group.add(neck);

        const finialGeom = new THREE.SphereGeometry(postW * 0.42, 8, 8);
        finialGeom.scale(1.0, 1.35, 1.0);
        const finial = new THREE.Mesh(finialGeom, matBrass);
        finial.position.set(px, postH - 0.04, 0);
        group.add(finial);
    }

    // 2. Horizontal Rails
    const railL = W;

    // Top Handrail (寻杖 / 扶手)
    const handrail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, railL, 12), matDarkRosewood);
    handrail.rotation.z = Math.PI / 2;
    handrail.position.set(0, H, 0);
    group.add(handrail);

    // Brass handrail end caps
    for (const ex of [-W / 2 + 0.01, W / 2 - 0.01]) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 12), matBrass);
        cap.rotation.z = Math.PI / 2;
        cap.position.set(ex, H, 0);
        group.add(cap);
    }

    // Intermediate Waist Rail (盆唇 / 枋木)
    const waistRail = new THREE.Mesh(new THREE.BoxGeometry(railL - 0.02, 0.04, 0.05), matDarkRosewood);
    waistRail.position.set(0, H - 0.12, 0);
    group.add(waistRail);

    // Bottom Base Sill Rail (地袱)
    const baseRail = new THREE.Mesh(new THREE.BoxGeometry(railL, 0.06, 0.08), matDarkRosewood);
    baseRail.position.set(0, 0.03, 0);
    group.add(baseRail);

    // 3. Openwork Baluster Spindles (透空直棂立柱 / 雕花透空栏板)
    // Completely OPENWORK with genuine see-through empty spacing!
    const spanWidth = W / 2 - postW;
    const numBalustersPerSpan = 6;
    const balusterW = 0.03;
    const balusterD = 0.03;
    const balusterH = (H - 0.12) - 0.06;
    const balusterY = 0.06 + balusterH / 2;

    const spanCenters = [-W / 4, W / 4];

    for (const sc of spanCenters) {
        const step = (spanWidth - 0.04) / (numBalustersPerSpan + 1);
        for (let i = 1; i <= numBalustersPerSpan; i++) {
            const bx = sc - spanWidth / 2 + 0.02 + i * step;

            const spindle = new THREE.Mesh(new THREE.BoxGeometry(balusterW, balusterH, balusterD), matPolishedWood);
            spindle.position.set(bx, balusterY, 0);
            group.add(spindle);

            // Carved central bead ring
            const bead = new THREE.Mesh(new THREE.BoxGeometry(balusterW + 0.012, 0.025, balusterD + 0.012), matDarkRosewood);
            bead.position.set(bx, balusterY, 0);
            group.add(bead);
        }

        // Upper decorative pierced brackets under waist rail
        const bracket = new THREE.Mesh(new THREE.BoxGeometry(spanWidth * 0.7, 0.03, 0.02), matPolishedWood);
        bracket.position.set(sc, H - 0.12 - 0.02, 0);
        group.add(bracket);
    }

    const bbox = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    group.position.sub(center);

    const wrapper = new THREE.Group();
    wrapper.add(group);
    return wrapper;
}

// =========================================================================
// 6. Traditional Chinese Guest Room Door (客房双开隔扇门) - 1.3m x 0.10m x 2.6m
// =========================================================================
function buildInnDoor() {
    const group = new THREE.Group();
    group.name = 'Pal1InnDoor';

    const W = 1.30;
    const H = 2.60;
    const D = 0.10;
    const frameT = 0.08;

    // Doorframe
    const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(frameT, H, D), matDarkRosewood);
    leftJamb.position.set(-W / 2 + frameT / 2, 0, 0);
    group.add(leftJamb);

    const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(frameT, H, D), matDarkRosewood);
    rightJamb.position.set(W / 2 - frameT / 2, 0, 0);
    group.add(rightJamb);

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(W - 2 * frameT, frameT, D), matDarkRosewood);
    lintel.position.set(0, H / 2 - frameT / 2, 0);
    group.add(lintel);

    const sill = new THREE.Mesh(new THREE.BoxGeometry(W - 2 * frameT, 0.12, D), matDarkRosewood);
    sill.position.set(0, -H / 2 + 0.06, 0);
    group.add(sill);

    // Door Pivot Plugs (门簪)
    for (const mx of [-0.22, 0.22]) {
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.08, 6), matBrass);
        pin.rotation.x = Math.PI / 2;
        pin.position.set(mx, H / 2 - frameT / 2, D / 2 + 0.03);
        group.add(pin);
    }

    // Double-leaf door panels
    const doorW = (W - 2 * frameT - 0.02) / 2;
    const doorH = H - frameT - 0.12 - 0.01;
    const doorY = (-H / 2 + 0.12 + H / 2 - frameT) / 2;

    for (const [leafX, side] of [[-doorW / 2 - 0.005, -1], [doorW / 2 + 0.005, 1]]) {
        const leafGroup = new THREE.Group();

        const leaf = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.04), matDarkRosewood);
        leafGroup.add(leaf);

        // Top lattice panel
        const topLatticeH = doorH * 0.42;
        const topLatticeY = doorH / 2 - topLatticeH / 2 - 0.06;
        const topScreen = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.08, topLatticeH, 0.045), matPolishedWood);
        topScreen.position.set(0, topLatticeY, 0);
        leafGroup.add(topScreen);

        for (let r = -1; r <= 1; r++) {
            const hBar = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.10, 0.02, 0.05), matDarkRosewood);
            hBar.position.set(0, topLatticeY + r * 0.12, 0);
            leafGroup.add(hBar);
        }
        for (let c = -1; c <= 1; c++) {
            const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.02, topLatticeH - 0.04, 0.05), matDarkRosewood);
            vBar.position.set(c * 0.11, topLatticeY, 0);
            leafGroup.add(vBar);
        }

        // Bottom carved panel
        const bottomPanelH = doorH * 0.40;
        const bottomPanelY = -doorH / 2 + bottomPanelH / 2 + 0.06;
        const bPanel = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.08, bottomPanelH, 0.048), matPolishedWood);
        bPanel.position.set(0, bottomPanelY, 0);
        leafGroup.add(bPanel);

        // Brass Door Knocker & Ring (铺首衔环)
        const plateX = side * (-doorW / 2 + 0.06);
        const plateY = 0.0;
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 8), matBrass);
        plate.rotation.x = Math.PI / 2;
        plate.position.set(plateX, plateY, 0.025);
        leafGroup.add(plate);

        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 8, 16), matBrass);
        ring.position.set(plateX, plateY - 0.03, 0.032);
        leafGroup.add(ring);

        leafGroup.position.set(leafX, doorY, 0);
        group.add(leafGroup);
    }

    const bbox = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    group.position.sub(center);

    const wrapper = new THREE.Group();
    wrapper.add(group);
    return wrapper;
}

// Generate all assets
async function main() {
    console.log('Generating Yuhang Inn 3D Assets...');
    await exportGLB(buildInnCounter(), 'pal1-inn-counter.glb');
    await exportGLB(buildInnStairs(), 'pal1-inn-stairs.glb');
    await exportGLB(buildInnBonsai(), 'pal1-inn-bonsai.glb');
    await exportGLB(buildInnWindow(), 'pal1-inn-window.glb');
    await exportGLB(buildInnRailing(), 'pal1-inn-railing.glb');
    await exportGLB(buildInnDoor(), 'pal1-inn-door.glb');
    console.log('All Yuhang Inn assets generated successfully!');
}

main().catch(console.error);

