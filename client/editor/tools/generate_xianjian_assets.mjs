import * as THREE from '../../../engine/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../../../engine/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(HERE, '../../desktop/public/assets');

if (typeof globalThis.FileReader === 'undefined') {
    globalThis.FileReader = class FileReader {
        readAsArrayBuffer(blob) {
            blob.arrayBuffer().then((buf) => {
                this.result = buf;
                if (this.onloadend) this.onloadend();
            });
        }
    };
}

function exportGlb(object, filename) {
    const exporter = new GLTFExporter();
    exporter.parse(
        object,
        (gltf) => {
            const outPath = path.resolve(ASSETS_DIR, filename);
            fs.writeFileSync(outPath, Buffer.from(gltf));
            console.log(`Saved ${filename} (${fs.statSync(outPath).size} bytes) -> ${outPath}`);
        },
        (err) => console.error(err),
        { binary: true }
    );
}

// =========================================================================
// 1. PAL1 Tavern Table & Benches (仙剑余杭客栈 八仙桌与长条凳 + 白瓷酒壶)
// =========================================================================
function buildPal1TavernTable() {
    const group = new THREE.Group();
    group.name = 'Pal1TavernTable';

    const matWood = new THREE.MeshStandardMaterial({
        color: 0x582114, // Dark walnut / rosewood
        roughness: 0.42,
        metalness: 0.12,
    });

    const matPorcelain = new THREE.MeshStandardMaterial({
        color: 0xf2f8fa, // Celadon white porcelain
        roughness: 0.15,
        metalness: 0.05,
    });

    const matWineRed = new THREE.MeshStandardMaterial({
        color: 0xad1d1d,
        roughness: 0.5,
        metalness: 0.1,
    });

    // --- Table Top (1.2m x 1.2m x 0.07m at y=0.82) ---
    const topGeom = new THREE.BoxGeometry(1.2, 0.07, 1.2);
    const tableTop = new THREE.Mesh(topGeom, matWood);
    tableTop.position.y = 0.815;
    group.add(tableTop);

    // Table Apron / Stretchers (罗锅枨与牙条)
    const apronGeom = new THREE.BoxGeometry(1.06, 0.06, 0.03);
    for (const [pz, rot] of [[0.53, 0], [-0.53, 0], [0.53, Math.PI / 2], [-0.53, Math.PI / 2]]) {
        const apron = new THREE.Mesh(apronGeom, matWood);
        if (rot === 0) {
            apron.position.set(0, 0.75, pz);
        } else {
            apron.position.set(pz, 0.75, 0);
            apron.rotation.y = Math.PI / 2;
        }
        group.add(apron);
    }

    // 4 Horse-hoof Legs (马蹄足方桌腿)
    const legGeom = new THREE.BoxGeometry(0.08, 0.78, 0.08);
    for (const [lx, lz] of [[-0.48, -0.48], [0.48, -0.48], [-0.48, 0.48], [0.48, 0.48]]) {
        const leg = new THREE.Mesh(legGeom, matWood);
        leg.position.set(lx, 0.39, lz);
        group.add(leg);

        // Hoof base
        const hoofGeom = new THREE.BoxGeometry(0.09, 0.05, 0.09);
        const hoof = new THREE.Mesh(hoofGeom, matWood);
        hoof.position.set(lx, 0.025, lz);
        group.add(hoof);
    }

    // --- Two Long Benches (两把客栈长条板凳) ---
    for (const bz of [-0.85, 0.85]) {
        // Bench Top (1.3m x 0.24m x 0.05m at y=0.48)
        const bTopGeom = new THREE.BoxGeometry(1.3, 0.05, 0.24);
        const benchTop = new THREE.Mesh(bTopGeom, matWood);
        benchTop.position.set(0, 0.475, bz);
        group.add(benchTop);

        // 4 Splayed Legs for bench
        for (const bx of [-0.45, 0.45]) {
            const bLegGeom = new THREE.BoxGeometry(0.06, 0.45, 0.06);
            const bLeg = new THREE.Mesh(bLegGeom, matWood);
            bLeg.position.set(bx, 0.225, bz);
            bLeg.rotation.z = bx < 0 ? 0.08 : -0.08;
            group.add(bLeg);
        }
        // Bench Stretcher
        const bStrGeom = new THREE.BoxGeometry(0.96, 0.04, 0.04);
        const bStr = new THREE.Mesh(bStrGeom, matWood);
        bStr.position.set(0, 0.20, bz);
        group.add(bStr);
    }

    // --- Tabletop Props: Celadon Wine Pot & Cups (白瓷执壶与小酒盅) ---
    // Wine pot belly
    const potBelly = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), matPorcelain);
    potBelly.position.set(-0.15, 0.94, -0.1);
    group.add(potBelly);

    // Wine pot neck & lid
    const potNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.12, 12), matPorcelain);
    potNeck.position.set(-0.15, 1.04, -0.1);
    group.add(potNeck);

    const potLid = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), matPorcelain);
    potLid.position.set(-0.15, 1.11, -0.1);
    group.add(potLid);

    // 2 Wine Cups
    for (const [cx, cz] of [[0.15, -0.15], [0.22, 0.10]]) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.02, 0.05, 8), matPorcelain);
        cup.position.set(cx, 0.875, cz);
        group.add(cup);
    }

    return group;
}

// =========================================================================
// 2. PAL1 Wine Casks & Tavern Flag (仙剑客栈封泥大酒坛与酒肆幌子)
// =========================================================================
function buildPal1WineCask() {
    const group = new THREE.Group();
    group.name = 'Pal1WineCasksAndFlag';

    const matClay = new THREE.MeshStandardMaterial({
        color: 0x422c22, // Dark earthenware clay
        roughness: 0.75,
        metalness: 0.1,
    });

    const matRedCloth = new THREE.MeshStandardMaterial({
        color: 0xc82020, // Bright vermilion silk seal
        roughness: 0.55,
        metalness: 0.05,
    });

    const matHempRope = new THREE.MeshStandardMaterial({
        color: 0xbfaa80, // Hemp rope
        roughness: 0.85,
        metalness: 0.05,
    });

    const matBamboo = new THREE.MeshStandardMaterial({
        color: 0x8a6d3b,
        roughness: 0.45,
        metalness: 0.15,
    });

    const matBanner = new THREE.MeshStandardMaterial({
        color: 0xf6f0de, // Natural coarse linen
        roughness: 0.7,
        metalness: 0.02,
    });

    const matIndigo = new THREE.MeshStandardMaterial({
        color: 0x1a2e4c, // Indigo border and character
        roughness: 0.6,
        metalness: 0.1,
    });

    // Helper: make a wine urn
    function makeUrn(radius, height, px, pz) {
        const urn = new THREE.Group();
        urn.position.set(px, 0, pz);

        // Lower body
        const lower = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.1, radius * 0.7, height * 0.55, 12), matClay);
        lower.position.y = height * 0.275;
        urn.add(lower);

        // Shoulder
        const upper = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.65, radius * 1.1, height * 0.35, 12), matClay);
        upper.position.y = height * 0.725;
        urn.add(upper);

        // Neck
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.62, radius * 0.65, height * 0.12, 12), matClay);
        neck.position.y = height * 0.96;
        urn.add(neck);

        // Red cloth seal
        const cloth = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.72, radius * 0.62, height * 0.10, 12), matRedCloth);
        cloth.position.y = height * 1.04;
        urn.add(cloth);

        // Tied hemp rope ring
        const rope = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.66, 0.02, 6, 12), matHempRope);
        rope.rotation.x = Math.PI / 2;
        rope.position.y = height * 0.98;
        urn.add(rope);

        // Red paper diamond label "酒" on belly
        const label = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.7, radius * 0.7, 0.01), matRedCloth);
        label.position.set(0, height * 0.55, radius * 1.06);
        label.rotation.z = Math.PI / 4;
        urn.add(label);

        return urn;
    }

    // 3 Wine Urns clustered together
    group.add(makeUrn(0.38, 0.75, 0, 0));
    group.add(makeUrn(0.32, 0.62, 0.55, 0.15));
    group.add(makeUrn(0.26, 0.52, 0.25, 0.55));

    // --- Bamboo Pole & Tavern Banner (酒旗/酒帘) ---
    // Pole standing tall (height 2.8m)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 2.8, 8), matBamboo);
    pole.position.set(-0.45, 1.4, -0.35);
    group.add(pole);

    // Crossbar projecting outward
    const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 8), matBamboo);
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.set(-0.1, 2.65, -0.35);
    group.add(crossbar);

    // Hanging Linen Tavern Banner ("酒" 旗)
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.95, 0.02), matBanner);
    banner.position.set(-0.1, 2.10, -0.35);
    group.add(banner);

    // Indigo borders on banner
    const topBorder = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.025), matIndigo);
    topBorder.position.set(-0.1, 2.535, -0.35);
    group.add(topBorder);

    const bottomBorder = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.025), matIndigo);
    bottomBorder.position.set(-0.1, 1.665, -0.35);
    group.add(bottomBorder);

    // Central Indigo "酒" Character Emblem
    const charBox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.03), matIndigo);
    charBox.position.set(-0.1, 2.10, -0.35);
    group.add(charBox);

    return group;
}

// =========================================================================
// 3. PAL1 Inn Signboard (余杭客栈 飞檐木匾与挑梁红灯笼)
// =========================================================================
function buildPal1InnSign() {
    const group = new THREE.Group();
    group.name = 'Pal1InnSign';

    const matWood = new THREE.MeshStandardMaterial({
        color: 0x5a180d, // Red rosewood
        roughness: 0.45,
        metalness: 0.1,
    });

    const matGold = new THREE.MeshStandardMaterial({
        color: 0xd4af37, // Burnished gold relief
        roughness: 0.3,
        metalness: 0.6,
    });

    const matBoard = new THREE.MeshStandardMaterial({
        color: 0x181412, // Dark ebony lacquer board
        roughness: 0.25,
        metalness: 0.1,
    });

    const matTile = new THREE.MeshStandardMaterial({
        color: 0x54585c, // Ancient grey clay tiles
        roughness: 0.65,
        metalness: 0.05,
    });

    const matLanternRed = new THREE.MeshStandardMaterial({
        color: 0xd81c1c, // Translucent bright vermilion silk
        roughness: 0.3,
        metalness: 0.1,
    });

    // --- Main Plaque (匾额底板 2.0m x 0.65m x 0.06m) ---
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 0.06), matBoard);
    board.position.set(0, 0, 0);
    group.add(board);

    // Rosewood Frame around board (上下左右线脚边框)
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.08, 0.09), matWood);
    frameTop.position.set(0, 0.34, 0);
    group.add(frameTop);

    const frameBottom = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.08, 0.09), matWood);
    frameBottom.position.set(0, -0.34, 0);
    group.add(frameBottom);

    const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.09), matWood);
    frameLeft.position.set(-1.03, 0, 0);
    group.add(frameLeft);

    const frameRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.09), matWood);
    frameRight.position.set(1.03, 0, 0);
    group.add(frameRight);

    // Inner Gold Inscription Border (金边内线)
    const goldTrim = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.52, 0.07), matGold);
    goldTrim.position.set(0, 0, 0.005);
    group.add(goldTrim);

    const goldCore = new THREE.Mesh(new THREE.BoxGeometry(1.80, 0.46, 0.08), matBoard);
    goldCore.position.set(0, 0, 0.01);
    group.add(goldCore);

    // 4 Stylized Gold Inscription Blocks (代表“余杭客栈”)
    for (const gx of [-0.65, -0.22, 0.22, 0.65]) {
        const charPlaque = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.02), matGold);
        charPlaque.position.set(gx, 0, 0.055);
        group.add(charPlaque);
    }

    // --- Miniature Eaves Canopy above Signboard (仿古挑檐小瓦顶) ---
    const roofBase = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.42), matWood);
    roofBase.position.set(0, 0.42, 0.16);
    group.add(roofBase);

    const tiles = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 2.5, 6), matTile);
    tiles.rotation.z = Math.PI / 2;
    tiles.rotation.x = Math.PI / 6;
    tiles.position.set(0, 0.49, 0.16);
    group.add(tiles);

    // --- Twin Hanging Red Lanterns with Gold Caps (左右悬挂红灯笼) ---
    for (const lx of [-1.22, 1.22]) {
        // Carved wooden arm extending outward
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.25), matWood);
        arm.position.set(lx * 0.95, 0.35, 0.1);
        group.add(arm);

        // Hanging cord
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 6), matGold);
        cord.position.set(lx, 0.24, 0.22);
        group.add(cord);

        // Lantern sphere
        const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), matLanternRed);
        lantern.scale.set(1.0, 1.25, 1.0);
        lantern.position.set(lx, 0.02, 0.22);
        group.add(lantern);

        // Top and bottom gold caps
        const topCap = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.04, 8), matGold);
        topCap.position.set(lx, 0.16, 0.22);
        group.add(topCap);

        const botCap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.04, 8), matGold);
        botCap.position.set(lx, -0.12, 0.22);
        group.add(botCap);

        // Golden tassel (流苏)
        const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 8), matGold);
        tassel.rotation.x = Math.PI;
        tassel.position.set(lx, -0.23, 0.22);
        group.add(tassel);
    }

    return group;
}

// =========================================================================
// 4. PAL1 Herbalist Drying Stand (李郎中药铺 晾药竹筛与草药架)
// =========================================================================
function buildPal1HerbStand() {
    const group = new THREE.Group();
    group.name = 'Pal1HerbStand';

    const matWood = new THREE.MeshStandardMaterial({
        color: 0x6e4e30, // Light weathered wood
        roughness: 0.6,
        metalness: 0.05,
    });

    const matBamboo = new THREE.MeshStandardMaterial({
        color: 0xb59e66, // Woven bamboo rattan
        roughness: 0.55,
        metalness: 0.05,
    });

    const matHerbs = new THREE.MeshStandardMaterial({
        color: 0x3d7032, // Medicinal green herbs
        roughness: 0.7,
        metalness: 0.02,
    });

    const matFlowers = new THREE.MeshStandardMaterial({
        color: 0xba3c2a, // Dried red saffron / wolfberries
        roughness: 0.65,
        metalness: 0.02,
    });

    // --- A-Frame Trestle Legs (人字型木制晾药架) ---
    const legGeom = new THREE.BoxGeometry(0.05, 1.45, 0.05);
    for (const lx of [-0.45, 0.45]) {
        const legFront = new THREE.Mesh(legGeom, matWood);
        legFront.position.set(lx, 0.7, 0.22);
        legFront.rotation.x = -0.18;
        group.add(legFront);

        const legBack = new THREE.Mesh(legGeom, matWood);
        legBack.position.set(lx, 0.7, -0.22);
        legBack.rotation.x = 0.18;
        group.add(legBack);

        // Cross bracing
        const cross = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.46), matWood);
        cross.position.set(lx, 0.4, 0);
        group.add(cross);
    }

    // Top Beam & 2 shelf bars
    const beamTop = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.05), matWood);
    beamTop.position.set(0, 1.35, 0);
    group.add(beamTop);

    const beamMid = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.04), matWood);
    beamMid.position.set(0, 0.82, 0);
    group.add(beamMid);

    const beamLow = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.04), matWood);
    beamLow.position.set(0, 0.38, 0);
    group.add(beamLow);

    // --- 3 Bamboo Drying Sieves with Herbs (竹编药筛与盛晾草药) ---
    const sieves = [
        { y: 1.15, z: 0.05, r: 0.36, herbMat: matHerbs },
        { y: 0.78, z: 0.08, r: 0.40, herbMat: matFlowers },
        { y: 0.35, z: 0.12, r: 0.44, herbMat: matHerbs },
    ];

    for (const s of sieves) {
        const sieveGroup = new THREE.Group();
        sieveGroup.position.set(0, s.y, s.z);
        sieveGroup.rotation.x = -0.12;

        // Rim (竹圈边框)
        const rim = new THREE.Mesh(new THREE.TorusGeometry(s.r, 0.025, 6, 16), matBamboo);
        rim.rotation.x = Math.PI / 2;
        sieveGroup.add(rim);

        // Bottom woven mat
        const bottom = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.98, s.r * 0.98, 0.01, 16), matBamboo);
        sieveGroup.add(bottom);

        // Layer of herbs inside sieve
        const herbs = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.90, s.r * 0.90, 0.025, 12), s.herbMat);
        herbs.position.y = 0.015;
        sieveGroup.add(herbs);

        group.add(sieveGroup);
    }

    return group;
}

// =========================================================================
// 5. PAL1 Ancient Sword in Stone (仙剑·青锋石中剑与辟邪剑阵)
// =========================================================================
function buildPal1AncientSword() {
    const group = new THREE.Group();
    group.name = 'Pal1AncientSword';

    const matStone = new THREE.MeshStandardMaterial({
        color: 0x5a6065, // Mossy mountain granite
        roughness: 0.85,
        metalness: 0.05,
    });

    const matBlade = new THREE.MeshStandardMaterial({
        color: 0xccddee, // Cold silver-cyan steel
        roughness: 0.15,
        metalness: 0.92,
    });

    const matBronze = new THREE.MeshStandardMaterial({
        color: 0x8c733e, // Antique bronze guard & pommel
        roughness: 0.35,
        metalness: 0.75,
    });

    const matGrip = new THREE.MeshStandardMaterial({
        color: 0x221814, // Dark bound cord grip
        roughness: 0.6,
        metalness: 0.1,
    });

    const matTassel = new THREE.MeshStandardMaterial({
        color: 0xd61818, // Vermilion silk tassel
        roughness: 0.45,
        metalness: 0.05,
    });

    // --- Weathered Stone Boulder (斜插灵石基座) ---
    const stoneBase = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 1), matStone);
    stoneBase.scale.set(1.2, 0.9, 1.1);
    stoneBase.position.set(0, 0.45, 0);
    group.add(stoneBase);

    // Subsidiary stone crag
    const stoneSmall = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 1), matStone);
    stoneSmall.scale.set(0.9, 0.7, 0.8);
    stoneSmall.position.set(0.35, 0.25, 0.2);
    group.add(stoneSmall);

    // --- The Sword (斜插宝剑, 倾斜角度) ---
    const sword = new THREE.Group();
    sword.position.set(0, 0.65, 0);
    sword.rotation.z = -0.18;
    sword.rotation.x = 0.12;

    // Double-edged Blade (剑身 1.1m x 0.08m x 0.015m)
    const bladeGeom = new THREE.BoxGeometry(0.075, 1.1, 0.018);
    const blade = new THREE.Mesh(bladeGeom, matBlade);
    blade.position.set(0, 0.55, 0);
    sword.add(blade);

    // Central Fuller / Ridge (剑脊)
    const ridgeGeom = new THREE.BoxGeometry(0.015, 1.12, 0.024);
    const ridge = new THREE.Mesh(ridgeGeom, matBlade);
    ridge.position.set(0, 0.55, 0);
    sword.add(ridge);

    // Pointed Tip (剑尖)
    const tipGeom = new THREE.ConeGeometry(0.045, 0.16, 4);
    tipGeom.rotateY(Math.PI / 4);
    const tip = new THREE.Mesh(tipGeom, matBlade);
    tip.position.set(0, 1.18, 0);
    sword.add(tip);

    // Taoist Winged Guard (青铜饕餮纹/八卦剑格)
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 0.065), matBronze);
    guard.position.set(0, 1.12, 0);
    // Note: since blade is embedded in stone, blade extends down into stone!
    // In our coordinate, sword handle is UP, blade tip is IN STONE!
    // Let's invert the sword orientation: handle pointing UPWARDS, blade buried in stone:
    // So guard is at y=0.55 above stone, handle goes up to y=0.9, blade goes down to y=-0.2!
    sword.remove(blade);
    sword.remove(ridge);
    sword.remove(tip);

    // Reconstruct oriented right side up (hilt up, tip down in stone):
    // Blade extending down into stone
    const swordBlade = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.85, 0.018), matBlade);
    swordBlade.position.set(0, 0.425, 0);
    sword.add(swordBlade);

    const swordRidge = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.86, 0.024), matBlade);
    swordRidge.position.set(0, 0.425, 0);
    sword.add(swordRidge);

    // Guard (剑格)
    const swordGuard = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.05, 0.065), matBronze);
    swordGuard.position.set(0, 0.85, 0);
    sword.add(swordGuard);

    // Hilt Grip (剑柄)
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.28, 8), matGrip);
    hilt.position.set(0, 1.01, 0);
    sword.add(hilt);

    // Pommel (剑首)
    const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.045, 8), matBronze);
    pommel.position.set(0, 1.16, 0);
    sword.add(pommel);

    // Flowing Crimson Tassel (红色剑穗)
    const tasselGroup = new THREE.Group();
    tasselGroup.position.set(0, 1.18, 0);
    tasselGroup.rotation.z = 0.35;

    const tasselCord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6), matTassel);
    tasselCord.position.set(0.06, -0.10, 0);
    tasselGroup.add(tasselCord);

    const tasselSkirt = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.24, 8), matTassel);
    tasselSkirt.rotation.x = Math.PI;
    tasselSkirt.position.set(0.06, -0.28, 0);
    tasselGroup.add(tasselSkirt);

    sword.add(tasselGroup);
    group.add(sword);

    return group;
}

exportGlb(buildPal1TavernTable(), 'pal1-tavern-table.glb');
exportGlb(buildPal1WineCask(), 'pal1-wine-cask.glb');
exportGlb(buildPal1InnSign(), 'pal1-inn-sign.glb');
exportGlb(buildPal1HerbStand(), 'pal1-herb-stand.glb');
exportGlb(buildPal1AncientSword(), 'pal1-ancient-sword.glb');



