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
// Materials Palette for Classical Chinese Countryside & Water Town Landscape
// =========================================================================
const matGranite = new THREE.MeshStandardMaterial({
    color: 0x686c76,      // Weathered grey granite stone (青石板与石台阶)
    roughness: 0.82,
    metalness: 0.04,
});

const matDarkBrick = new THREE.MeshStandardMaterial({
    color: 0x363a42,      // Dark grey brick base & coping (青砖与水桥石基)
    roughness: 0.88,
    metalness: 0.04,
});

const matCedarWood = new THREE.MeshStandardMaterial({
    color: 0x543725,      // Weathered cedar/pine wood (老杉木桩与桥木)
    roughness: 0.72,
    metalness: 0.05,
});

const matBambooCulm = new THREE.MeshStandardMaterial({
    color: 0x4a7a35,      // Fresh emerald green bamboo culm (翠竹竿)
    roughness: 0.48,
    metalness: 0.06,
});

const matBambooLeaf = new THREE.MeshStandardMaterial({
    color: 0x3f6e2b,      // Dense bamboo leaves (茂密竹叶簇)
    roughness: 0.58,
    metalness: 0.02,
});

const matWillowBark = new THREE.MeshStandardMaterial({
    color: 0x382c22,      // Gnarled ancient willow trunk (苍古柳树皲裂树皮)
    roughness: 0.95,
    metalness: 0.02,
});

const matWillowFoliage = new THREE.MeshStandardMaterial({
    color: 0x5c8e3c,      // Tender weeping willow foliage (柔嫩垂柳丝绦)
    roughness: 0.65,
    metalness: 0.02,
});

const matLanternGlow = new THREE.MeshStandardMaterial({
    color: 0xffd577,      // Warm incandescent lamp core (石灯笼暖光灯芯)
    roughness: 0.25,
    metalness: 0.1,
    emissive: 0xffaa22,
    emissiveIntensity: 0.85,
});

const matMoss = new THREE.MeshStandardMaterial({
    color: 0x3c542a,      // Lush ground moss & earth (沿路绿苔与松泥)
    roughness: 0.96,
    metalness: 0.01,
});

const matBrass = new THREE.MeshStandardMaterial({
    color: 0xa8843c,      // Antique brass/cord accents (铜箍与麻绳绑扎)
    roughness: 0.55,
    metalness: 0.45,
});

/** Absolute Bounding Box Anchors */
function addBoundingAnchors(group, W, H, D) {
    const anchorMat = new THREE.MeshBasicMaterial({ visible: false });
    const minBox = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001), anchorMat);
    minBox.position.set(-W / 2, -H / 2, -D / 2);
    group.add(minBox);

    const maxBox = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001), anchorMat);
    maxBox.position.set(W / 2, H / 2, D / 2);
    group.add(maxBox);
}

// =========================================================================
// 1. Classical Jiangnan Garden Stone Lantern (江南石经幢石灯笼) - ID 110
// 0.8m W x 1.6m H x 0.8m D
// =========================================================================
function buildStoneLantern() {
    const group = new THREE.Group();
    group.name = 'Pal1StoneLantern';
    const W = 0.8, H = 1.6, D = 0.8;

    // 1. Octagonal Sub-base Plinth (下层青石基座)
    const baseBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.10, 8), matGranite);
    baseBottom.position.set(0, -H / 2 + 0.05, 0);
    group.add(baseBottom);

    const baseMiddle = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.12, 8), matGranite);
    baseMiddle.position.set(0, -H / 2 + 0.16, 0);
    group.add(baseMiddle);

    // 2. Carved Pedestal Column (八角中柱立柱)
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.45, 8), matGranite);
    column.position.set(0, -H / 2 + 0.445, 0);
    group.add(column);

    // 3. Lotus Petal Seat (承托仰莲中台)
    const lotusSeat = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.16, 0.14, 8), matGranite);
    lotusSeat.position.set(0, -H / 2 + 0.74, 0);
    group.add(lotusSeat);

    // 4. Hollow Lamp Chamber (透光火舍/灯室)
    // 4 vertical corner stone pillars
    const chamberH = 0.34;
    const chamberY = -H / 2 + 0.74 + 0.07 + chamberH / 2;
    const postR = 0.22;
    for (let i = 0; i < 4; i++) {
        const theta = (i * Math.PI / 2) + Math.PI / 4;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, chamberH, 0.06), matGranite);
        post.position.set(Math.cos(theta) * postR, chamberY, Math.sin(theta) * postR);
        group.add(post);
    }

    // Glowing Candle/Lamp Core in center of chamber
    const lampCore = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, chamberH * 0.75, 12), matLanternGlow);
    lampCore.position.set(0, chamberY, 0);
    group.add(lampCore);

    // 5. Four-corner Flared Pagoda Roof / Umbrella Coping (飞檐四角宝盖屋顶)
    const roofBase = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.24, 0.12, 4), matGranite);
    roofBase.rotation.y = Math.PI / 4;
    roofBase.position.set(0, chamberY + chamberH / 2 + 0.06, 0);
    group.add(roofBase);

    // Upturned corner points
    for (let i = 0; i < 4; i++) {
        const theta = (i * Math.PI / 2) + Math.PI / 4;
        const point = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.12), matDarkBrick);
        point.position.set(Math.cos(theta) * 0.36, chamberY + chamberH / 2 + 0.12, Math.sin(theta) * 0.36);
        point.rotation.y = theta;
        point.rotation.z = 0.3;
        group.add(point);
    }

    // 6. Jewel Top Finial (宝珠结顶)
    const finialSphere = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), matGranite);
    finialSphere.position.set(0, chamberY + chamberH / 2 + 0.12 + 0.08, 0);
    group.add(finialSphere);

    const finialTip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 8), matBrass);
    finialTip.position.set(0, chamberY + chamberH / 2 + 0.12 + 0.17, 0);
    group.add(finialTip);

    addBoundingAnchors(group, W, H, D);
    return group;
}

// =========================================================================
// 2. Verdant Bamboo Grove Cluster (青翠修竹林丛) - ID 111
// 3.2m W x 3.8m H x 1.2m D
// =========================================================================
function buildBambooGrove() {
    const group = new THREE.Group();
    group.name = 'Pal1BambooGrove';
    const W = 3.2, H = 3.8, D = 1.2;

    // Ground moss mound
    const mound = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.55, 0.12, 16), matMoss);
    mound.scale.set(1.0, 0.8, 0.35);
    mound.position.set(0, -H / 2 + 0.05, 0);
    group.add(mound);

    // Bamboo culm specs: [x, z, height, leanAngleX, leanAngleZ, radius]
    const culmSpecs = [
        [-1.10, -0.15, 3.4, 0.04, -0.06, 0.038],
        [-0.75, 0.20, 3.7, -0.05, 0.04, 0.045],
        [-0.35, -0.10, 3.6, 0.02, -0.03, 0.042],
        [0.05, 0.18, 3.8, -0.03, 0.05, 0.048],
        [0.45, -0.18, 3.5, 0.04, -0.05, 0.040],
        [0.85, 0.12, 3.6, -0.02, 0.04, 0.044],
        [1.15, -0.08, 3.3, 0.03, -0.07, 0.036],
    ];

    for (const [cx, cz, cHeight, leanX, leanZ, r] of culmSpecs) {
        const culm = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, cHeight, 10), matBambooCulm);
        culm.position.set(cx, -H / 2 + cHeight / 2, cz);
        culm.rotation.set(leanX, 0, leanZ);
        group.add(culm);

        // Bamboo rings (竹节环) every ~0.45m
        for (let y = 0.45; y < cHeight; y += 0.45) {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.08, 0.007, 6, 12), matBambooCulm);
            ring.rotation.x = Math.PI / 2;
            ring.position.set(cx + Math.sin(leanZ) * y, -H / 2 + y, cz - Math.sin(leanX) * y);
            group.add(ring);
        }

        // Leaf clusters towards upper half
        for (let ly = cHeight * 0.55; ly < cHeight; ly += 0.55) {
            const leafCluster = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.65, 5), matBambooLeaf);
            leafCluster.position.set(
                cx + Math.sin(leanZ) * ly + (Math.random() - 0.5) * 0.15,
                -H / 2 + ly,
                cz - Math.sin(leanX) * ly + (Math.random() - 0.5) * 0.15
            );
            leafCluster.rotation.set(
                (Math.random() - 0.5) * 0.4,
                Math.random() * Math.PI,
                (Math.random() - 0.5) * 0.4
            );
            group.add(leafCluster);
        }
    }

    // Top canopy foliage puff
    for (let i = -1.0; i <= 1.0; i += 0.5) {
        const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), matBambooLeaf);
        canopy.scale.set(1.4, 0.7, 0.9);
        canopy.position.set(i, H / 2 - 0.35, (Math.random() - 0.5) * 0.3);
        group.add(canopy);
    }

    addBoundingAnchors(group, W, H, D);
    return group;
}

// =========================================================================
// 3. Ancient Jiangnan Weeping Willow (江南古意垂柳) - ID 112
// 3.6m W x 4.2m H x 3.6m D
// =========================================================================
function buildWeepingWillow() {
    const group = new THREE.Group();
    group.name = 'Pal1WeepingWillow';
    const W = 3.6, H = 4.2, D = 3.6;

    // 1. Gnarled trunk base (老桩粗根)
    const baseTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.38, 1.10, 10), matWillowBark);
    baseTrunk.position.set(0, -H / 2 + 0.55, 0);
    group.add(baseTrunk);

    // Root flairs on ground
    for (let i = 0; i < 4; i++) {
        const theta = (i * Math.PI / 2) + 0.3;
        const root = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.18, 0.65, 8), matWillowBark);
        root.rotation.z = Math.PI / 3;
        root.rotation.y = theta;
        root.position.set(Math.cos(theta) * 0.32, -H / 2 + 0.18, Math.sin(theta) * 0.32);
        group.add(root);
    }

    // 2. Middle curved trunk (扭曲上升的主干)
    const midTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.35, 10), matWillowBark);
    midTrunk.position.set(0.15, -H / 2 + 1.65, -0.10);
    midTrunk.rotation.set(0.15, 0.2, -0.12);
    group.add(midTrunk);

    // 3. Spreading branches (舒展主枝)
    const branchConfigs = [
        [-0.85, 2.75, 0.45, -0.3, 0.4, 0.6, 1.4],
        [0.90, 2.85, -0.35, 0.4, -0.3, -0.5, 1.5],
        [0.25, 2.95, 0.85, -0.5, 0.2, 0.2, 1.3],
        [-0.30, 2.90, -0.90, 0.3, -0.4, -0.2, 1.4],
    ];

    for (const [bx, by, bz, rx, ry, rz, len] of branchConfigs) {
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.15, len, 8), matWillowBark);
        branch.position.set(bx * 0.6, -H / 2 + by - 0.2, bz * 0.6);
        branch.rotation.set(rx, ry, rz);
        group.add(branch);
    }

    // 4. Canopy domes & Cascading Willow Weeping Fronds (垂柳丝绦与绿冠)
    // Main upper canopy dome
    const canopyTop = new THREE.Mesh(new THREE.SphereGeometry(1.45, 12, 8), matWillowFoliage);
    canopyTop.scale.set(1.15, 0.65, 1.15);
    canopyTop.position.set(0.05, H / 2 - 0.95, 0);
    group.add(canopyTop);

    // Cascading downward fronds hanging from outer canopy
    const numFronds = 14;
    for (let i = 0; i < numFronds; i++) {
        const theta = (i / numFronds) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
        const rad = 1.15 + (Math.random() - 0.5) * 0.25;
        const fx = Math.cos(theta) * rad;
        const fz = Math.sin(theta) * rad;
        const fLen = 1.4 + Math.random() * 0.5;

        const frond = new THREE.Mesh(new THREE.ConeGeometry(0.22, fLen, 6), matWillowFoliage);
        frond.rotation.x = Math.PI; // pointing downwards
        frond.position.set(fx, H / 2 - 1.2 - fLen / 2, fz);
        group.add(frond);
    }

    addBoundingAnchors(group, W, H, D);
    return group;
}

// =========================================================================
// 4. Single-Span Arched Stone Canal Bridge (单孔青石小拱桥) - ID 113
// 2.4m W x 1.2m H x 4.0m D
// =========================================================================
function buildStoneBridge() {
    const group = new THREE.Group();
    group.name = 'Pal1StoneBridge';
    const W = 2.4, H = 1.2, D = 4.0;

    // Bridge Abutments (南北两侧青石引桥台)
    const abutmentS = new THREE.Mesh(new THREE.BoxGeometry(W, 0.45, 1.2), matGranite);
    abutmentS.position.set(0, -H / 2 + 0.225, -D / 2 + 0.6);
    group.add(abutmentS);

    const abutmentN = new THREE.Mesh(new THREE.BoxGeometry(W, 0.45, 1.2), matGranite);
    abutmentN.position.set(0, -H / 2 + 0.225, D / 2 - 0.6);
    group.add(abutmentN);

    // Arched Bridge Deck Slopes (拱桥起拱踏步坡面)
    // South ramp rising to crown
    const rampS = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.16, 1.35), matGranite);
    rampS.position.set(0, -H / 2 + 0.48, -0.65);
    rampS.rotation.x = -0.22;
    group.add(rampS);

    // North ramp rising to crown
    const rampN = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.16, 1.35), matGranite);
    rampN.position.set(0, -H / 2 + 0.48, 0.65);
    rampN.rotation.x = 0.22;
    group.add(rampN);

    // Crown stone slab (桥顶金券石平踏)
    const crownSlab = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.16, 0.8), matGranite);
    crownSlab.position.set(0, -H / 2 + 0.62, 0);
    group.add(crownSlab);

    // Bridge Side Railings (东西两侧青石寻杖栏板与望柱)
    const railT = 0.12;
    const railH = 0.48;

    for (const side of [-1, 1]) {
        const rx = side * (W / 2 - railT / 2 - 0.05);

        // Railing curb
        const railCurb = new THREE.Mesh(new THREE.BoxGeometry(railT, 0.12, D * 0.95), matGranite);
        railCurb.position.set(rx, -H / 2 + 0.48, 0);
        group.add(railCurb);

        // Railing panels
        const panel = new THREE.Mesh(new THREE.BoxGeometry(railT * 0.7, railH * 0.6, D * 0.88), matGranite);
        panel.position.set(rx, -H / 2 + 0.72, 0);
        group.add(panel);

        // Top rail (寻杖)
        const topRail = new THREE.Mesh(new THREE.BoxGeometry(railT * 0.9, 0.08, D * 0.95), matGranite);
        topRail.position.set(rx, -H / 2 + 0.92, 0);
        group.add(topRail);

        // 4 Baluster Posts (雕花望柱与仰莲柱头) along the span
        for (const pz of [-1.8, -0.6, 0.6, 1.8]) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(railT * 1.15, railH + 0.18, railT * 1.15), matGranite);
            post.position.set(rx, -H / 2 + 0.62, pz);
            group.add(post);

            // Carved bud/lotus head on post
            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), matGranite);
            cap.position.set(rx, -H / 2 + 0.62 + (railH + 0.18) / 2 + 0.05, pz);
            group.add(cap);
        }
    }

    addBoundingAnchors(group, W, H, D);
    return group;
}

// =========================================================================
// 5. Rustic Wattle & Criss-Cross Bamboo Fence (柴扉竹篱笆) - ID 114
// 4.0m W x 1.3m H x 0.35m D
// =========================================================================
function buildBambooFence() {
    const group = new THREE.Group();
    group.name = 'Pal1BambooFence';
    const W = 4.0, H = 1.3, D = 0.35;

    // Dark grey brick footing curb (青砖压脚)
    const footing = new THREE.Mesh(new THREE.BoxGeometry(W, 0.16, D * 0.8), matDarkBrick);
    footing.position.set(0, -H / 2 + 0.08, 0);
    group.add(footing);

    // 5 Sturdy Wooden/Bamboo Support Posts (立柱)
    const numPosts = 5;
    const postR = 0.055;
    const postH = H - 0.12;
    for (let i = 0; i < numPosts; i++) {
        const px = -W / 2 + 0.15 + (i / (numPosts - 1)) * (W - 0.30);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, postH, 10), matCedarWood);
        post.position.set(px, -H / 2 + 0.16 + postH / 2, 0);
        group.add(post);

        // Tied cord binding accent
        const cord = new THREE.Mesh(new THREE.TorusGeometry(postR * 1.15, 0.012, 6, 12), matBrass);
        cord.rotation.x = Math.PI / 2;
        cord.position.set(px, -H / 2 + 0.16 + postH * 0.6, 0);
        group.add(cord);
    }

    // Horizontal Bamboo Railings (上下两道横档竹竿)
    const railR = 0.038;
    const bottomRail = new THREE.Mesh(new THREE.CylinderGeometry(railR, railR, W - 0.1, 10), matBambooCulm);
    bottomRail.rotation.z = Math.PI / 2;
    bottomRail.position.set(0, -H / 2 + 0.32, 0);
    group.add(bottomRail);

    const topRail = new THREE.Mesh(new THREE.CylinderGeometry(railR, railR, W - 0.1, 10), matBambooCulm);
    topRail.rotation.z = Math.PI / 2;
    topRail.position.set(0, H / 2 - 0.12, 0);
    group.add(topRail);

    // Criss-Cross Bamboo Slats (人字斜织编篱格)
    const slatW = 0.024;
    const slatT = 0.012;
    const slatLen = 1.18;
    const slatAngle = Math.PI / 4; // 45 deg

    for (let x = -W / 2 + 0.3; x <= W / 2 - 0.3; x += 0.28) {
        // Positive slope slat
        const slatPos = new THREE.Mesh(new THREE.BoxGeometry(slatLen, slatW, slatT), matBambooCulm);
        slatPos.position.set(x, -H / 2 + 0.65, 0.02);
        slatPos.rotation.z = slatAngle;
        group.add(slatPos);

        // Negative slope slat
        const slatNeg = new THREE.Mesh(new THREE.BoxGeometry(slatLen, slatW, slatT), matBambooCulm);
        slatNeg.position.set(x, -H / 2 + 0.65, -0.02);
        slatNeg.rotation.z = -slatAngle;
        group.add(slatNeg);
    }

    addBoundingAnchors(group, W, H, D);
    return group;
}

// =========================================================================
// Main Runner
// =========================================================================
async function main() {
    console.log('Generating Classical Jiangnan Countryside & Garden Environmental 3D Assets...');
    await exportGLB(buildStoneLantern(), 'pal1-env-stone-lantern.glb');
    await exportGLB(buildBambooGrove(), 'pal1-env-bamboo-grove.glb');
    await exportGLB(buildWeepingWillow(), 'pal1-env-willow-tree.glb');
    await exportGLB(buildStoneBridge(), 'pal1-env-stone-bridge.glb');
    await exportGLB(buildBambooFence(), 'pal1-env-bamboo-fence.glb');
    console.log('All 5 environmental assets exported successfully!');
}

main().catch((err) => {
    console.error('Asset generation failed:', err);
    process.exit(1);
});
