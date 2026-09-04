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
    side: THREE.DoubleSide,
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
// 4. Traditional Chinese Continuous Partition Lattice Window Bay (四扇连排落地隔扇长窗间) - 2.4m x 0.14m x 2.65m
// =========================================================================
function buildInnWindow() {
    const group = new THREE.Group();
    group.name = 'Pal1InnWindowBay';

    const W = 2.40;
    const H = 2.65;
    const D = 0.14;
    const colW = 0.08;
    const beamH = 0.09;
    const sillH = 0.08;

    // 1. Boundary Framing: Left & Right Timber Columns (间柱 / 立柱)
    const colGeom = new THREE.BoxGeometry(colW, H, D);
    const leftCol = new THREE.Mesh(colGeom, matDarkRosewood);
    leftCol.position.set(-W / 2 + colW / 2, 0, 0);
    group.add(leftCol);

    const rightCol = new THREE.Mesh(colGeom, matDarkRosewood);
    rightCol.position.set(W / 2 - colW / 2, 0, 0);
    group.add(rightCol);

    // 2. Continuous Top Lintel Beam (额枋 / 楣梁) & Bottom Sill (下槛 / 地栿)
    const spanW = W - 2 * colW;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(spanW, beamH, D), matDarkRosewood);
    lintel.position.set(0, H / 2 - beamH / 2, 0);
    group.add(lintel);

    const sill = new THREE.Mesh(new THREE.BoxGeometry(spanW, sillH, D), matDarkRosewood);
    sill.position.set(0, -H / 2 + sillH / 2, 0);
    group.add(sill);

    // Decorative carved corner brackets (雀替) under lintel at both columns
    for (const sx of [-1, 1]) {
        const bracketGeom = new THREE.BoxGeometry(0.18, 0.10, D * 0.7);
        const bracket = new THREE.Mesh(bracketGeom, matPolishedWood);
        bracket.position.set(sx * (W / 2 - colW - 0.09), H / 2 - beamH - 0.05, 0);
        group.add(bracket);
    }

    // 3. 4 Continuous Window Leaves (四扇格扇窗扇)
    const numLeaves = 4;
    const leafW = spanW / numLeaves; // exactly (2.4 - 0.16) / 4 = 0.56m
    const leafH = H - beamH - sillH; // 2.65 - 0.09 - 0.08 = 2.48m
    const leafY = (-H / 2 + sillH + H / 2 - beamH) / 2;
    const leafD = 0.07;
    const stileT = 0.038;

    for (let i = 0; i < numLeaves; i++) {
        const leafGroup = new THREE.Group();
        const lx = -spanW / 2 + (i + 0.5) * leafW;

        // Leaf outer stiles (left and right)
        const leafStileGeom = new THREE.BoxGeometry(stileT, leafH, leafD);
        const lsLeft = new THREE.Mesh(leafStileGeom, matDarkRosewood);
        lsLeft.position.set(-leafW / 2 + stileT / 2, 0, 0);
        leafGroup.add(lsLeft);

        const lsRight = new THREE.Mesh(leafStileGeom, leafH, leafD);
        const lsRightMesh = new THREE.Mesh(leafStileGeom, matDarkRosewood);
        lsRightMesh.position.set(leafW / 2 - stileT / 2, 0, 0);
        leafGroup.add(lsRightMesh);

        const innerLeafW = leafW - 2 * stileT; // ~0.484m

        // Top rail, bottom rail of leaf
        const railGeom = new THREE.BoxGeometry(innerLeafW, 0.045, leafD);
        const topRail = new THREE.Mesh(railGeom, matDarkRosewood);
        topRail.position.set(0, leafH / 2 - 0.0225, 0);
        leafGroup.add(topRail);

        const botRail = new THREE.Mesh(new THREE.BoxGeometry(innerLeafW, 0.06, leafD), matDarkRosewood);
        botRail.position.set(0, -leafH / 2 + 0.03, 0);
        leafGroup.add(botRail);

        // Mid dividing rails:
        const transomRailY = leafH / 2 - 0.40;
        const transomRail = new THREE.Mesh(new THREE.BoxGeometry(innerLeafW, 0.035, leafD * 0.95), matDarkRosewood);
        transomRail.position.set(0, transomRailY, 0);
        leafGroup.add(transomRail);

        const waistRailUpperY = -0.32;
        const waistRailUpper = new THREE.Mesh(new THREE.BoxGeometry(innerLeafW, 0.035, leafD * 0.95), matDarkRosewood);
        waistRailUpper.position.set(0, waistRailUpperY, 0);
        leafGroup.add(waistRailUpper);

        const waistRailLowerY = -0.56;
        const waistRailLower = new THREE.Mesh(new THREE.BoxGeometry(innerLeafW, 0.035, leafD * 0.95), matDarkRosewood);
        waistRailLower.position.set(0, waistRailLowerY, 0);
        leafGroup.add(waistRailLower);

        // A. Top Transom (楣子 / 亮子): height ~0.35m
        const tH = (leafH / 2 - 0.045) - (transomRailY + 0.0175);
        const tY = (leafH / 2 - 0.045 + transomRailY + 0.0175) / 2;
        const tPaper = new THREE.Mesh(new THREE.PlaneGeometry(innerLeafW, tH), matPaper);
        tPaper.position.set(0, tY, 0.002);
        leafGroup.add(tPaper);
        for (let tr = 1; tr <= 2; tr++) {
            const rx = -innerLeafW / 2 + tr * (innerLeafW / 3);
            const rib = new THREE.Mesh(new THREE.BoxGeometry(0.018, tH, 0.025), matPolishedWood);
            rib.position.set(rx, tY, 0);
            leafGroup.add(rib);
        }

        // B. Central Lattice Window Core (槅心): height ~1.03m
        const coreH = (transomRailY - 0.0175) - (waistRailUpperY + 0.0175);
        const coreY = (transomRailY - 0.0175 + waistRailUpperY + 0.0175) / 2;

        const paper = new THREE.Mesh(new THREE.PlaneGeometry(innerLeafW - 0.005, coreH - 0.005), matPaper);
        paper.position.set(0, coreY, 0.002);
        leafGroup.add(paper);

        // 3D Interlocking Diamond Lattice (方胜纹格眼)
        const vCols = 3;
        const vStep = innerLeafW / (vCols + 1);
        const hRows = 6;
        const hStep = coreH / (hRows + 1);
        const ribW = 0.018;
        const ribD = 0.028;

        for (let vc = 1; vc <= vCols; vc++) {
            const vx = -innerLeafW / 2 + vc * vStep;
            const vRib = new THREE.Mesh(new THREE.BoxGeometry(ribW, coreH, ribD), matPolishedWood);
            vRib.position.set(vx, coreY, 0);
            leafGroup.add(vRib);
        }
        for (let hr = 1; hr <= hRows; hr++) {
            const hy = coreY - coreH / 2 + hr * hStep;
            const hRib = new THREE.Mesh(new THREE.BoxGeometry(innerLeafW, ribW, ribD), matPolishedWood);
            hRib.position.set(0, hy, 0);
            leafGroup.add(hRib);
        }
        for (let vc = 1; vc <= vCols - 1; vc++) {
            for (let hr = 1; hr <= hRows - 1; hr++) {
                if ((vc + hr) % 2 === 0) {
                    const cx = -innerLeafW / 2 + (vc + 0.5) * vStep;
                    const cy = coreY - coreH / 2 + (hr + 0.5) * hStep;
                    const dGeom = new THREE.BoxGeometry(vStep * 0.65, ribW * 0.85, ribD * 0.9);
                    const d1 = new THREE.Mesh(dGeom, matPolishedWood);
                    d1.position.set(cx, cy, 0);
                    d1.rotation.z = Math.PI / 4;
                    leafGroup.add(d1);
                    const d2 = new THREE.Mesh(dGeom, matPolishedWood);
                    d2.position.set(cx, cy, 0);
                    d2.rotation.z = -Math.PI / 4;
                    leafGroup.add(d2);
                }
            }
        }

        // C. Waist Board (绦环板): height ~0.20m
        const waistH = (waistRailUpperY - 0.0175) - (waistRailLowerY + 0.0175);
        const waistY = (waistRailUpperY - 0.0175 + waistRailLowerY + 0.0175) / 2;
        const wBase = new THREE.Mesh(new THREE.BoxGeometry(innerLeafW, waistH, leafD * 0.7), matDarkRosewood);
        wBase.position.set(0, waistY, 0);
        leafGroup.add(wBase);

        const wPlate = new THREE.Mesh(new THREE.BoxGeometry(innerLeafW * 0.78, waistH * 0.65, leafD * 0.85), matPolishedWood);
        wPlate.position.set(0, waistY, 0);
        leafGroup.add(wPlate);

        // D. Bottom Apron Board (裙板): height ~0.60m
        const apronH = (waistRailLowerY - 0.0175) - (-leafH / 2 + 0.06);
        const apronY = (waistRailLowerY - 0.0175 + -leafH / 2 + 0.06) / 2;
        const aBase = new THREE.Mesh(new THREE.BoxGeometry(innerLeafW, apronH, leafD * 0.7), matDarkRosewood);
        aBase.position.set(0, apronY, 0);
        leafGroup.add(aBase);

        const aPanel1 = new THREE.Mesh(new THREE.BoxGeometry(innerLeafW * 0.82, apronH * 0.80, leafD * 0.82), matPolishedWood);
        aPanel1.position.set(0, apronY, 0);
        leafGroup.add(aPanel1);

        const aPanel2 = new THREE.Mesh(new THREE.BoxGeometry(innerLeafW * 0.65, apronH * 0.58, leafD * 0.92), matDarkRosewood);
        aPanel2.position.set(0, apronY, 0);
        leafGroup.add(aPanel2);

        // Corner brass plates on each window leaf
        const bSize = 0.045;
        const bT = 0.004;
        for (const [bx, by] of [
            [-innerLeafW / 2 + bSize / 2, leafH / 2 - bSize / 2],
            [innerLeafW / 2 - bSize / 2, leafH / 2 - bSize / 2],
            [-innerLeafW / 2 + bSize / 2, -leafH / 2 + bSize / 2],
            [innerLeafW / 2 - bSize / 2, -leafH / 2 + bSize / 2],
        ]) {
            const bMesh = new THREE.Mesh(new THREE.BoxGeometry(bSize, bSize, bT), matBrass);
            bMesh.position.set(bx, by, leafD / 2 + bT / 2);
            leafGroup.add(bMesh);
        }

        leafGroup.position.set(lx, leafY, 0);
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
// 6. Traditional Chinese Door Bay with Flanking Windows (客房双开门与两侧连窗间) - 2.4m x 0.14m x 2.65m
// =========================================================================
function buildInnDoor() {
    const group = new THREE.Group();
    group.name = 'Pal1InnDoorBay';

    const W = 2.40;
    const H = 2.65;
    const D = 0.14;
    const colW = 0.08;
    const beamH = 0.09;
    const sillH = 0.08;

    // 1. Boundary Timber Columns & Top Lintel
    const colGeom = new THREE.BoxGeometry(colW, H, D);
    const leftCol = new THREE.Mesh(colGeom, matDarkRosewood);
    leftCol.position.set(-W / 2 + colW / 2, 0, 0);
    group.add(leftCol);

    const rightCol = new THREE.Mesh(colGeom, matDarkRosewood);
    rightCol.position.set(W / 2 - colW / 2, 0, 0);
    group.add(rightCol);

    const spanW = W - 2 * colW;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(spanW, beamH, D), matDarkRosewood);
    lintel.position.set(0, H / 2 - beamH / 2, 0);
    group.add(lintel);

    const sill = new THREE.Mesh(new THREE.BoxGeometry(spanW, sillH, D), matDarkRosewood);
    sill.position.set(0, -H / 2 + sillH / 2, 0);
    group.add(sill);

    // 2. Center Doorway flanked by 2 window leaves
    const flankW = 0.56;
    const doorOpeningW = spanW - 2 * flankW; // 1.12m

    const jambW = 0.045;
    const jambGeom = new THREE.BoxGeometry(jambW, H - beamH - sillH, D * 0.95);
    const leftJamb = new THREE.Mesh(jambGeom, matDarkRosewood);
    leftJamb.position.set(-doorOpeningW / 2 + jambW / 2, (-beamH + sillH) / 2, 0);
    group.add(leftJamb);

    const rightJamb = new THREE.Mesh(jambGeom, matDarkRosewood);
    rightJamb.position.set(doorOpeningW / 2 - jambW / 2, (-beamH + sillH) / 2, 0);
    group.add(rightJamb);

    const doorLintelH = 0.06;
    const doorLintelY = H / 2 - beamH - 0.45;
    const dLintel = new THREE.Mesh(new THREE.BoxGeometry(doorOpeningW - 2 * jambW, doorLintelH, D * 0.9), matDarkRosewood);
    dLintel.position.set(0, doorLintelY, 0);
    group.add(dLintel);

    // Door Pivot Pins (门簪)
    for (const mx of [-0.20, 0.20]) {
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.08, 6), matBrass);
        pin.rotation.x = Math.PI / 2;
        pin.position.set(mx, doorLintelY, D / 2 + 0.02);
        group.add(pin);
    }

    // Doorway Upper Transom (门头上槛格眼)
    const dTransomH = (H / 2 - beamH) - (doorLintelY + doorLintelH / 2);
    const dTransomY = (H / 2 - beamH + doorLintelY + doorLintelH / 2) / 2;
    const dTransomPaper = new THREE.Mesh(new THREE.PlaneGeometry(doorOpeningW - 2 * jambW, dTransomH), matPaper);
    dTransomPaper.position.set(0, dTransomY, 0.002);
    group.add(dTransomPaper);

    for (let tr = 1; tr <= 4; tr++) {
        const rx = -(doorOpeningW - 2 * jambW) / 2 + tr * ((doorOpeningW - 2 * jambW) / 5);
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.018, dTransomH, 0.025), matPolishedWood);
        rib.position.set(rx, dTransomY, 0);
        group.add(rib);
    }

    // Double-leaf Door (双开板门)
    const doorLeafW = (doorOpeningW - 2 * jambW - 0.01) / 2;
    const doorH = doorLintelY - doorLintelH / 2 - (-H / 2 + sillH);
    const doorY = (doorLintelY - doorLintelH / 2 + -H / 2 + sillH) / 2;

    for (const [leafX, side] of [[-doorLeafW / 2 - 0.003, -1], [doorLeafW / 2 + 0.003, 1]]) {
        const leafGroup = new THREE.Group();
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(doorLeafW, doorH, 0.045), matDarkRosewood);
        leafGroup.add(leaf);

        const panelH = doorH * 0.42;
        const panel1 = new THREE.Mesh(new THREE.BoxGeometry(doorLeafW - 0.08, panelH, 0.055), matPolishedWood);
        panel1.position.set(0, doorH * 0.20, 0);
        leafGroup.add(panel1);

        const panel2 = new THREE.Mesh(new THREE.BoxGeometry(doorLeafW - 0.08, panelH, 0.055), matPolishedWood);
        panel2.position.set(0, -doorH * 0.25, 0);
        leafGroup.add(panel2);

        // Brass Knocker (铺首衔环)
        const knockerX = side * (-doorLeafW / 2 + 0.07);
        const knockerY = 0.05;
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 8), matBrass);
        plate.rotation.x = Math.PI / 2;
        plate.position.set(knockerX, knockerY, 0.03);
        leafGroup.add(plate);

        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.008, 8, 16), matBrass);
        ring.position.set(knockerX, knockerY - 0.035, 0.038);
        leafGroup.add(ring);

        leafGroup.position.set(leafX, doorY, 0);
        group.add(leafGroup);
    }

    // 3. Flanking Window Leaves (Left and Right of door)
    const fLeafH = H - beamH - sillH;
    const fLeafY = (-H / 2 + sillH + H / 2 - beamH) / 2;
    for (const fx of [-spanW / 2 + flankW / 2, spanW / 2 - flankW / 2]) {
        const fGroup = new THREE.Group();
        const innerLeafW = flankW - 0.07;
        const leafD = 0.07;

        const lsLeft = new THREE.Mesh(new THREE.BoxGeometry(0.035, fLeafH, leafD), matDarkRosewood);
        lsLeft.position.set(-flankW / 2 + 0.0175, 0, 0);
        fGroup.add(lsLeft);

        const lsRight = new THREE.Mesh(new THREE.BoxGeometry(0.035, fLeafH, leafD), matDarkRosewood);
        lsRight.position.set(flankW / 2 - 0.0175, 0, 0);
        fGroup.add(lsRight);

        const coreH = 1.05;
        const coreY = 0.20;
        const paper = new THREE.Mesh(new THREE.PlaneGeometry(innerLeafW, coreH), matPaper);
        paper.position.set(0, coreY, 0.002);
        fGroup.add(paper);

        for (let vc = 1; vc <= 2; vc++) {
            const rx = -innerLeafW / 2 + vc * (innerLeafW / 3);
            const vRib = new THREE.Mesh(new THREE.BoxGeometry(0.018, coreH, 0.028), matPolishedWood);
            vRib.position.set(rx, coreY, 0);
            fGroup.add(vRib);
        }
        for (let hr = 1; hr <= 5; hr++) {
            const ry = coreY - coreH / 2 + hr * (coreH / 6);
            const hRib = new THREE.Mesh(new THREE.BoxGeometry(innerLeafW, 0.018, 0.028), matPolishedWood);
            hRib.position.set(0, ry, 0);
            fGroup.add(hRib);
        }

        const apronH = 0.65;
        const apronY = -fLeafH / 2 + apronH / 2 + 0.05;
        const aBase = new THREE.Mesh(new THREE.BoxGeometry(innerLeafW, apronH, leafD * 0.75), matDarkRosewood);
        aBase.position.set(0, apronY, 0);
        fGroup.add(aBase);

        const aPanel = new THREE.Mesh(new THREE.BoxGeometry(innerLeafW * 0.8, apronH * 0.75, leafD * 0.88), matPolishedWood);
        aPanel.position.set(0, apronY, 0);
        fGroup.add(aPanel);

        fGroup.position.set(fx, fLeafY, 0);
        group.add(fGroup);
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

