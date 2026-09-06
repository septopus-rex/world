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
                console.log(`[OK] Saved Terran Living GLB: ${filename} (${fs.statSync(outPath).size} bytes)`);
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
// StarCraft 1 Terran Habitation Material Palette
// =========================================================================
const matNeosteelHull = new THREE.MeshStandardMaterial({
    color: 0x272e38, // Slate dark battleship steel
    roughness: 0.50,
    metalness: 0.80,
});

const matNeosteelArmor = new THREE.MeshStandardMaterial({
    color: 0xb87333, // Weathered ochre/bronze secondary armor
    roughness: 0.45,
    metalness: 0.70,
});

const matNeosteelTrim = new THREE.MeshStandardMaterial({
    color: 0x5a6878, // Medium battleship steel bevels & trim
    roughness: 0.40,
    metalness: 0.75,
});

const matSilverChrome = new THREE.MeshStandardMaterial({
    color: 0xc4d4e2, // Polished silver ladder, rails, pipes
    roughness: 0.20,
    metalness: 0.90,
});

const matTerranRed = new THREE.MeshStandardMaterial({
    color: 0xb51a1a, // Iconic SC1 Team Red banner & stripes
    roughness: 0.38,
    metalness: 0.50,
});

const matHazardYellow = new THREE.MeshStandardMaterial({
    color: 0xdfa010, // Hazard caution yellow
    roughness: 0.35,
    metalness: 0.30,
});

const matHazardBlack = new THREE.MeshStandardMaterial({
    color: 0x16181c, // Hazard diagonal black
    roughness: 0.60,
    metalness: 0.20,
});

const matMattress = new THREE.MeshStandardMaterial({
    color: 0x2e3b38, // Military canvas cushion
    roughness: 0.85,
    metalness: 0.10,
});

const matBlanket = new THREE.MeshStandardMaterial({
    color: 0x243242, // Deep blue thermal blanket
    roughness: 0.90,
    metalness: 0.05,
});

const matCyanGlow = new THREE.MeshStandardMaterial({
    color: 0x00e5ff,
    emissive: 0x00c8f0,
    emissiveIntensity: 1.2,
    roughness: 0.15,
    metalness: 0.3,
});

const matGreenCRT = new THREE.MeshStandardMaterial({
    color: 0x0fe045,
    emissive: 0x0bbb3a,
    emissiveIntensity: 1.1,
    roughness: 0.20,
    metalness: 0.1,
});

const matAmberLight = new THREE.MeshStandardMaterial({
    color: 0xffaa00,
    emissive: 0xff8800,
    emissiveIntensity: 0.9,
    roughness: 0.25,
    metalness: 0.2,
});

const matRedBeacon = new THREE.MeshStandardMaterial({
    color: 0xff2222,
    emissive: 0xee1111,
    emissiveIntensity: 1.2,
    roughness: 0.2,
});

const matTintedGlass = new THREE.MeshStandardMaterial({
    color: 0x122a36,
    roughness: 0.10,
    metalness: 0.85,
    transparent: true,
    opacity: 0.70,
});

const matSolarCell = new THREE.MeshStandardMaterial({
    color: 0x0d1f38,
    roughness: 0.18,
    metalness: 0.88,
});

// Helper: create striped hazard box
function createHazardStripeMesh(width, height, depth) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), matHazardYellow);
    group.add(base);

    const stripeCount = Math.max(2, Math.floor(width / 0.15));
    const stripeW = width / (stripeCount * 2);
    for (let i = 0; i < stripeCount; i++) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(stripeW, height + 0.002, depth + 0.002), matHazardBlack);
        stripe.position.x = -width / 2 + (i * 2 + 0.5) * stripeW;
        group.add(stripe);
    }
    return group;
}

// =========================================================================
// 1. terran-bunk-bed.glb (ID 128): 双层合金太空舱床位
// =========================================================================
function buildBunkBed() {
    const scene = new THREE.Scene();
    const bedGroup = new THREE.Group();

    const L = 2.1, W = 1.05, H = 2.15;
    const postR = 0.045;

    // 4 vertical posts
    const postGeom = new THREE.BoxGeometry(postR * 2, H, postR * 2);
    const postPositions = [
        [-L / 2 + postR, postR, -W / 2 + postR],
        [L / 2 - postR, postR, -W / 2 + postR],
        [-L / 2 + postR, postR, W / 2 - postR],
        [L / 2 - postR, postR, W / 2 - postR],
    ];

    postPositions.forEach(([x, _, y]) => {
        const post = new THREE.Mesh(postGeom, matNeosteelHull);
        post.position.set(x, H / 2, y);
        bedGroup.add(post);

        // Foot pad
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(postR * 1.6, postR * 1.8, 0.06, 8), matNeosteelTrim);
        foot.position.set(x, 0.03, y);
        bedGroup.add(foot);

        // Top cap
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(postR * 1.5, postR * 1.5, 0.04, 8), matNeosteelArmor);
        cap.position.set(x, H + 0.02, y);
        bedGroup.add(cap);
    });

    // Lower bunk frame and mattress (Z ~ 0.35m)
    const lowerDeck = new THREE.Mesh(new THREE.BoxGeometry(L - 0.1, 0.12, W - 0.1), matNeosteelHull);
    lowerDeck.position.set(0, 0.35, 0);
    bedGroup.add(lowerDeck);

    // Under-bed storage drawers (2 drawers)
    for (let i = -1; i <= 1; i += 2) {
        const drawer = new THREE.Mesh(new THREE.BoxGeometry((L - 0.2) / 2 - 0.04, 0.24, W - 0.16), matNeosteelTrim);
        drawer.position.set(i * (L - 0.2) / 4, 0.14, 0);
        bedGroup.add(drawer);

        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.04), matSilverChrome);
        handle.position.set(i * (L - 0.2) / 4, 0.16, W / 2 - 0.06);
        bedGroup.add(handle);
    }

    const lowerMattress = new THREE.Mesh(new THREE.BoxGeometry(L - 0.14, 0.14, W - 0.14), matMattress);
    lowerMattress.position.set(0, 0.48, 0);
    bedGroup.add(lowerMattress);

    const lowerBlanket = new THREE.Mesh(new THREE.BoxGeometry((L - 0.14) * 0.65, 0.15, W - 0.12), matBlanket);
    lowerBlanket.position.set(0.25, 0.49, 0);
    bedGroup.add(lowerBlanket);

    const lowerPillow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.10, W - 0.3), matNeosteelTrim);
    lowerPillow.position.set(-L / 2 + 0.3, 0.58, 0);
    bedGroup.add(lowerPillow);

    // Upper bunk frame and mattress (Z ~ 1.45m)
    const upperDeck = new THREE.Mesh(new THREE.BoxGeometry(L - 0.1, 0.12, W - 0.1), matNeosteelHull);
    upperDeck.position.set(0, 1.45, 0);
    bedGroup.add(upperDeck);

    const upperMattress = new THREE.Mesh(new THREE.BoxGeometry(L - 0.14, 0.14, W - 0.14), matMattress);
    upperMattress.position.set(0, 1.58, 0);
    bedGroup.add(upperMattress);

    const upperBlanket = new THREE.Mesh(new THREE.BoxGeometry((L - 0.14) * 0.65, 0.15, W - 0.12), matBlanket);
    upperBlanket.position.set(0.25, 1.59, 0);
    bedGroup.add(upperBlanket);

    const upperPillow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.10, W - 0.3), matNeosteelTrim);
    upperPillow.position.set(-L / 2 + 0.3, 1.68, 0);
    bedGroup.add(upperPillow);

    // Upper safety railing
    const railGeom = new THREE.CylinderGeometry(0.02, 0.02, L * 0.65, 8);
    const rail = new THREE.Mesh(railGeom, matSilverChrome);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0.25, 1.76, W / 2 - 0.03);
    bedGroup.add(rail);

    // Headboard & Footboard Enclosure Panels
    [-1, 1].forEach((dir) => {
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.8, W - 0.08), matNeosteelArmor);
        board.position.set(dir * (L / 2 - 0.03), 1.0, 0);
        bedGroup.add(board);

        // Red accent stripe
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, W - 0.14), matTerranRed);
        stripe.position.set(dir * (L / 2 - 0.03), 1.15, 0);
        bedGroup.add(stripe);
    });

    // Bedside Reading Panel (Integrated Display)
    const lowerScreen = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.32), matCyanGlow);
    lowerScreen.position.set(-L / 2 + 0.06, 0.85, -0.2);
    bedGroup.add(lowerScreen);

    const upperScreen = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.32), matCyanGlow);
    upperScreen.position.set(-L / 2 + 0.06, 1.95, -0.2);
    bedGroup.add(upperScreen);

    // Access Ladder (on front face, toward head)
    const ladderX = -L / 2 + 0.55;
    const ladderZ = W / 2 + 0.05;
    const stringerGeom = new THREE.CylinderGeometry(0.025, 0.025, 1.9, 8);
    [-0.18, 0.18].forEach(dx => {
        const stringer = new THREE.Mesh(stringerGeom, matSilverChrome);
        stringer.position.set(ladderX + dx, 0.95, ladderZ);
        bedGroup.add(stringer);
    });
    for (let r = 0; r < 5; r++) {
        const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.36, 8), matSilverChrome);
        rung.rotation.z = Math.PI / 2;
        rung.position.set(ladderX, 0.35 + r * 0.32, ladderZ);
        bedGroup.add(rung);
    }

    scene.add(bedGroup);
    return exportGLB(scene, 'terran-bunk-bed.glb');
}

// =========================================================================
// 2. terran-ration-dispenser.glb (ID 129): 食物与咖啡配给合成机及高脚椅
// =========================================================================
function buildRationDispenser() {
    const scene = new THREE.Scene();
    const group = new THREE.Group();

    // Main dispenser counter cabinet
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.95, 0.75), matNeosteelHull);
    counter.position.set(0, 0.475, 0);
    group.add(counter);

    // Countertop slate
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.06, 0.82), matNeosteelTrim);
    top.position.set(0, 0.97, 0);
    group.add(top);

    // Automated Dispenser Unit on top (Back housing + Canopy + Side Columns)
    // Back panel
    const backPanel = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.85, 0.15), matNeosteelArmor);
    backPanel.position.set(0, 1.425, -0.25);
    group.add(backPanel);

    // Top canopy
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.30, 0.52), matNeosteelHull);
    canopy.position.set(0, 1.70, -0.08);
    group.add(canopy);

    // Red Team banner across dispenser top
    const banner = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.10, 0.54), matTerranRed);
    banner.position.set(0, 1.80, -0.08);
    group.add(banner);

    // Left and Right Side Pillars
    [-0.46, 0.46].forEach((colX) => {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.45, 0.46), matNeosteelArmor);
        col.position.set(colX, 1.225, -0.08);
        group.add(col);
    });

    // Dispensing Niche bottom plate
    const nicheLedge = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.04, 0.42), matNeosteelTrim);
    nicheLedge.position.set(0, 1.02, -0.06);
    group.add(nicheLedge);

    // Glowing Cyan Niche Backlight Strip
    const nicheLight = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.02, 0.02), matCyanGlow);
    nicheLight.position.set(0, 1.44, -0.16);
    group.add(nicheLight);

    // 2 Nutrient cups/flasks in cavity
    [-0.18, 0.18].forEach((dx) => {
        const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.18, 12), matSilverChrome);
        mug.position.set(dx, 1.13, -0.06);
        group.add(mug);
    });

    // Control Keypad & Display Panel on Canopy Front
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.02), matCyanGlow);
    screen.position.set(0, 1.68, 0.185);
    group.add(screen);

    // Status indicator array (green, amber, red)
    const ledGeom = new THREE.CylinderGeometry(0.018, 0.018, 0.02, 8);
    const leds = [
        { color: matGreenCRT, x: 0.32, y: 1.72 },
        { color: matAmberLight, x: 0.32, y: 1.67 },
        { color: matRedBeacon, x: 0.32, y: 1.62 },
    ];
    leds.forEach(({ color, x, y }) => {
        const led = new THREE.Mesh(ledGeom, color);
        led.rotation.x = Math.PI / 2;
        led.position.set(x, y, 0.185);
        group.add(led);
    });

    // Hazard stripes on counter base
    const hazardTrim = createHazardStripeMesh(1.82, 0.12, 0.77);
    hazardTrim.position.set(0, 0.06, 0);
    group.add(hazardTrim);

    // 2 High Swivel Metallic Bar Stools
    [-0.55, 0.55].forEach((stX) => {
        const stoolGroup = new THREE.Group();
        stoolGroup.position.set(stX, 0, 0.72);

        // Stool Base
        const sBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.04, 16), matNeosteelHull);
        sBase.position.y = 0.02;
        stoolGroup.add(sBase);

        // Pneumatic column
        const sCol = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.65, 12), matSilverChrome);
        sCol.position.y = 0.35;
        stoolGroup.add(sCol);

        // Footring
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 8, 24), matSilverChrome);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.22;
        stoolGroup.add(ring);

        // Round Padded Seat
        const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.19, 0.08, 20), matMattress);
        seat.position.y = 0.68;
        stoolGroup.add(seat);

        // Low metal back support arch
        const backArch = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.018, 8, 16, Math.PI), matNeosteelTrim);
        backArch.position.set(0, 0.82, -0.06);
        backArch.rotation.y = Math.PI;
        stoolGroup.add(backArch);

        group.add(stoolGroup);
    });

    scene.add(group);
    return exportGLB(scene, 'terran-ration-dispenser.glb');
}

// =========================================================================
// 3. terran-crew-locker.glb (ID 130): 个人战术防暴装备储物柜
// =========================================================================
function buildCrewLocker() {
    const scene = new THREE.Scene();
    const group = new THREE.Group();

    const W = 1.3, D = 0.65, H = 2.15;

    // Main cabinet body
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), matNeosteelHull);
    body.position.set(0, H / 2, 0);
    group.add(body);

    // Bevel top frame
    const topCap = new THREE.Mesh(new THREE.BoxGeometry(W + 0.06, 0.08, D + 0.06), matNeosteelArmor);
    topCap.position.set(0, H + 0.04, 0);
    group.add(topCap);

    // Dual doors
    [-W / 4, W / 4].forEach((doorX, idx) => {
        const door = new THREE.Mesh(new THREE.BoxGeometry(W / 2 - 0.04, H - 0.32, 0.04), matNeosteelTrim);
        door.position.set(doorX, H / 2, D / 2 + 0.02);
        group.add(door);

        // Door handle & keypad
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.05), matSilverChrome);
        handle.position.set(doorX + (idx === 0 ? 0.22 : -0.22), 1.05, D / 2 + 0.05);
        group.add(handle);

        const keypad = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.02), matCyanGlow);
        keypad.position.set(doorX + (idx === 0 ? 0.22 : -0.22), 1.28, D / 2 + 0.05);
        group.add(keypad);

        // Ventilation louvers (3 stamped lines on door)
        for (let l = 0; l < 3; l++) {
            const louver = new THREE.Mesh(new THREE.BoxGeometry(W / 2 - 0.18, 0.02, 0.02), matNeosteelHull);
            louver.position.set(doorX, 1.80 + l * 0.05, D / 2 + 0.04);
            group.add(louver);
        }
    });

    // Upper unit ID tag: "BAY-04" Red Panel
    const tag = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.15, 0.03), matTerranRed);
    tag.position.set(0, H - 0.12, D / 2 + 0.02);
    group.add(tag);

    // Bottom Hazard Stripe Trim
    const hazardTrim = createHazardStripeMesh(W + 0.04, 0.14, D + 0.04);
    hazardTrim.position.set(0, 0.07, 0);
    group.add(hazardTrim);

    // Side hook with emergency breathing mask
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.12), matSilverChrome);
    hook.position.set(W / 2 + 0.02, 1.45, 0);
    group.add(hook);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), matNeosteelArmor);
    helmet.scale.set(0.9, 1.1, 1.0);
    helmet.position.set(W / 2 + 0.06, 1.32, 0.05);
    group.add(helmet);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.10, 0.16), matCyanGlow);
    visor.position.set(W / 2 + 0.16, 1.34, 0.05);
    group.add(visor);

    scene.add(group);
    return exportGLB(scene, 'terran-crew-locker.glb');
}

// =========================================================================
// 4. terran-life-support.glb (ID 131): 维生环境循环净化柱
// =========================================================================
function buildLifeSupport() {
    const scene = new THREE.Scene();
    const group = new THREE.Group();

    const H = 2.4;

    // Heavy octagonal base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.20, 8), matNeosteelHull);
    base.position.y = 0.10;
    group.add(base);

    // Base bolts (8 around perimeter)
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.05, 6), matSilverChrome);
        bolt.position.set(Math.cos(angle) * 0.44, 0.22, Math.sin(angle) * 0.44);
        group.add(bolt);
    }

    // Lower canister housing
    const lowerHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.55, 16), matNeosteelArmor);
    lowerHousing.position.y = 0.475;
    group.add(lowerHousing);

    // Glowing Cyan Core Filter Chamber (glass + glow inside)
    const glassCylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.90, 16), matTintedGlass);
    glassCylinder.position.y = 1.20;
    group.add(glassCylinder);

    const innerCore = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.86, 12), matCyanGlow);
    innerCore.position.y = 1.20;
    group.add(innerCore);

    // Chrome Structural Support Rods (4 vertical rods around glass)
    for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.96, 8), matSilverChrome);
        rod.position.set(Math.cos(angle) * 0.38, 1.20, Math.sin(angle) * 0.38);
        group.add(rod);
    }

    // Upper compressor housing
    const upperHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.45, 16), matNeosteelHull);
    upperHousing.position.y = 1.875;
    group.add(upperHousing);

    // Terran Red Identification Ring
    const idRing = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.10, 16), matTerranRed);
    idRing.position.y = 1.85;
    group.add(idRing);

    // Top exhaust dome & louvers
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), matNeosteelTrim);
    dome.position.y = 2.10;
    group.add(dome);

    // Pressure gauge on the front
    const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 16), matSilverChrome);
    gauge.rotation.x = Math.PI / 2;
    gauge.position.set(0, 0.55, 0.44);
    group.add(gauge);

    const gaugeFace = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 16), matAmberLight);
    gaugeFace.rotation.x = Math.PI / 2;
    gaugeFace.position.set(0, 0.55, 0.465);
    group.add(gaugeFace);

    // Side oxygen pipe loop
    const pipeCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.44, 0.40, 0),
        new THREE.Vector3(0.55, 1.00, 0),
        new THREE.Vector3(0.55, 1.50, 0),
        new THREE.Vector3(0.44, 1.90, 0),
    ]);
    const pipeGeom = new THREE.TubeGeometry(pipeCurve, 20, 0.03, 8, false);
    const pipeMesh = new THREE.Mesh(pipeGeom, matSilverChrome);
    group.add(pipeMesh);

    scene.add(group);
    return exportGLB(scene, 'terran-life-support.glb');
}

// =========================================================================
// 5. terran-workstation.glb (ID 132): 战术终端工作台与人体工学转椅
// =========================================================================
function buildWorkstation() {
    const scene = new THREE.Scene();
    const group = new THREE.Group();

    // Heavy Neosteel Desk
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.08, 0.85), matNeosteelTrim);
    deskTop.position.set(0, 0.74, 0);
    group.add(deskTop);

    // Side legs / computer tower housing (left side pedestal)
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.70, 0.75), matNeosteelHull);
    tower.position.set(-0.52, 0.35, 0);
    group.add(tower);

    // Tower front drive slots and LED
    for (let s = 0; s < 3; s++) {
        const slot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.02), matSilverChrome);
        slot.position.set(-0.52, 0.52 - s * 0.08, 0.38);
        group.add(slot);
    }
    const towerLED = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.02, 8), matCyanGlow);
    towerLED.rotation.x = Math.PI / 2;
    towerLED.position.set(-0.44, 0.62, 0.38);
    group.add(towerLED);

    // Right side cantilever steel leg
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.70, 0.75), matNeosteelHull);
    rightLeg.position.set(0.66, 0.35, 0);
    group.add(rightLeg);

    // Keyboard & Trackball console
    const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.03, 0.22), matNeosteelHull);
    keyboard.position.set(0.05, 0.795, 0.20);
    group.add(keyboard);

    const trackball = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), matSilverChrome);
    trackball.position.set(0.38, 0.80, 0.20);
    group.add(trackball);

    // Iconic StarCraft 1 Green CRT Monitor
    const crtBase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.05, 12), matNeosteelTrim);
    crtBase.position.set(0.05, 0.805, -0.15);
    group.add(crtBase);

    const crtNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.10, 8), matSilverChrome);
    crtNeck.position.set(0.05, 0.87, -0.15);
    group.add(crtNeck);

    // Curved CRT casing (bulky trapezoidal body)
    const crtCasing = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.44, 0.42), matNeosteelArmor);
    crtCasing.position.set(0.05, 1.12, -0.18);
    group.add(crtCasing);

    // CRT Screen bezel & glowing phosphor screen
    const screenBezel = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.36, 0.03), matNeosteelHull);
    screenBezel.position.set(0.05, 1.12, 0.04);
    group.add(screenBezel);

    const screenGlass = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.30, 0.02), matGreenCRT);
    screenGlass.position.set(0.05, 1.12, 0.055);
    group.add(screenGlass);

    // Small status display above monitor
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.06, 0.44), matTerranRed);
    topBar.position.set(0.05, 1.36, -0.18);
    group.add(topBar);

    // Ergonomic Swivel Mesh Chair (placed in front of desk)
    const chairGroup = new THREE.Group();
    chairGroup.position.set(0.05, 0, 0.65);
    chairGroup.rotation.y = -Math.PI / 12; // slight casual angle

    // 5-star wheeled base
    const baseHub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 12), matNeosteelHull);
    baseHub.position.y = 0.08;
    chairGroup.add(baseHub);

    for (let c = 0; c < 5; c++) {
        const cAngle = (c / 5) * Math.PI * 2;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.28), matNeosteelTrim);
        arm.position.set(Math.sin(cAngle) * 0.14, 0.08, Math.cos(cAngle) * 0.14);
        arm.rotation.y = cAngle;
        chairGroup.add(arm);

        const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), matNeosteelHull);
        wheel.position.set(Math.sin(cAngle) * 0.28, 0.03, Math.cos(cAngle) * 0.28);
        chairGroup.add(wheel);
    }

    // Piston cylinder
    const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.40, 8), matSilverChrome);
    piston.position.y = 0.28;
    chairGroup.add(piston);

    // Seat cushion
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.48), matMattress);
    seat.position.y = 0.50;
    chairGroup.add(seat);

    // Backrest with mesh contour
    const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.54, 0.06), matNeosteelHull);
    backrest.position.set(0, 0.82, -0.22);
    chairGroup.add(backrest);

    // Armrests
    [-0.26, 0.26].forEach((ax) => {
        const aPost = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), matSilverChrome);
        aPost.position.set(ax, 0.62, 0);
        chairGroup.add(aPost);

        const aPad = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.26), matNeosteelTrim);
        aPad.position.set(ax, 0.73, 0);
        chairGroup.add(aPad);
    });

    group.add(chairGroup);

    scene.add(group);
    return exportGLB(scene, 'terran-workstation.glb');
}

// =========================================================================
// 6. terran-airlock-door.glb (ID 133): 重型液压气密舱门
// =========================================================================
function buildAirlockDoor() {
    const scene = new THREE.Scene();
    const group = new THREE.Group();

    const frameW = 2.4, frameH = 2.8, wallD = 0.35;
    const doorW = 1.4, doorH = 2.4;

    // Heavy Bulkhead Portal Frame (Left, Right, Lintel, Threshold)
    const postW = (frameW - doorW) / 2;
    [-frameW / 2 + postW / 2, frameW / 2 - postW / 2].forEach(px => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(postW, frameH, wallD), matNeosteelHull);
        post.position.set(px, frameH / 2, 0);
        group.add(post);

        // Yellow/Black Hazard Strip on door frame edge
        const hazardEdge = createHazardStripeMesh(0.12, frameH, 0.02);
        hazardEdge.position.set(px + (px > 0 ? -postW / 2 + 0.06 : postW / 2 - 0.06), frameH / 2, wallD / 2 + 0.01);
        group.add(hazardEdge);
    });

    // Lintel Header
    const lintelH = frameH - doorH;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW, lintelH, wallD), matNeosteelArmor);
    lintel.position.set(0, doorH + lintelH / 2, 0);
    group.add(lintel);

    // Terran Team Red Banner on Lintel
    const redBanner = new THREE.Mesh(new THREE.BoxGeometry(doorW, 0.12, wallD + 0.04), matTerranRed);
    redBanner.position.set(0, doorH + lintelH / 2, 0);
    group.add(redBanner);

    // Threshold plate with diamond tread
    const threshold = new THREE.Mesh(new THREE.BoxGeometry(doorW, 0.08, wallD + 0.12), matNeosteelTrim);
    threshold.position.set(0, 0.04, 0);
    group.add(threshold);

    // Split Sliding Blast Doors (left & right leaf, slightly ajar / recessed)
    [-doorW / 4 + 0.02, doorW / 4 - 0.02].forEach((lx, idx) => {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(doorW / 2 - 0.03, doorH - 0.08, 0.08), matNeosteelHull);
        leaf.position.set(lx, doorH / 2 + 0.04, 0);
        group.add(leaf);

        // Heavy reinforcement rib on door leaf
        const rib = new THREE.Mesh(new THREE.BoxGeometry(doorW / 2 - 0.12, 0.12, 0.12), matNeosteelTrim);
        rib.position.set(lx, 1.20, 0);
        group.add(rib);

        // Door interlock seal teeth
        const interlock = new THREE.Mesh(new THREE.BoxGeometry(0.04, doorH - 0.2, 0.10), matSilverChrome);
        interlock.position.set(idx === 0 ? lx + doorW / 4 - 0.03 : lx - doorW / 4 + 0.03, doorH / 2 + 0.04, 0);
        group.add(interlock);
    });

    // Top Hydraulic Closer Cylinders
    [-doorW / 4, doorW / 4].forEach(cx => {
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.40, 8), matSilverChrome);
        cyl.rotation.z = Math.PI / 2;
        cyl.position.set(cx, doorH - 0.06, wallD / 2 + 0.06);
        group.add(cyl);
    });

    // Status Indicator Beacon Lamp on Lintel (Green = Pressurized)
    const lampHousing = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.08, 0.06), matNeosteelHull);
    lampHousing.position.set(0, doorH + 0.08, wallD / 2 + 0.04);
    group.add(lampHousing);

    const greenLamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.03), matGreenCRT);
    greenLamp.position.set(-0.06, doorH + 0.08, wallD / 2 + 0.07);
    group.add(greenLamp);

    const redLamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.03), matRedBeacon);
    redLamp.position.set(0.06, doorH + 0.08, wallD / 2 + 0.07);
    group.add(redLamp);

    // Wall Access Keypad Terminal on right doorpost
    const accessKeypad = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.28, 0.06), matNeosteelTrim);
    accessKeypad.position.set(frameW / 2 - 0.18, 1.35, wallD / 2 + 0.04);
    group.add(accessKeypad);

    const keypadScreen = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.02), matCyanGlow);
    keypadScreen.position.set(frameW / 2 - 0.18, 1.38, wallD / 2 + 0.075);
    group.add(keypadScreen);

    scene.add(group);
    return exportGLB(scene, 'terran-airlock-door.glb');
}

// =========================================================================
// 7. terran-observation-window.glb (ID 134): 重型装甲防爆舷窗
// =========================================================================
function buildObservationWindow() {
    const scene = new THREE.Scene();
    const group = new THREE.Group();

    const frameW = 2.4, frameH = 1.6, wallD = 0.35;
    const glassW = 1.8, glassH = 1.1;

    // Outer Armored Window Casing
    const frame = new THREE.Mesh(new THREE.BoxGeometry(frameW, frameH, wallD), matNeosteelHull);
    frame.position.set(0, frameH / 2, 0);
    group.add(frame);

    // Glass cutout frame trim
    const trim = new THREE.Mesh(new THREE.BoxGeometry(glassW + 0.16, glassH + 0.16, wallD + 0.06), matNeosteelArmor);
    trim.position.set(0, frameH / 2, 0);
    group.add(trim);

    // Double-Layer Tinted Blast Glass
    const glass = new THREE.Mesh(new THREE.BoxGeometry(glassW, glassH, 0.08), matTintedGlass);
    glass.position.set(0, frameH / 2, 0);
    group.add(glass);

    // Heavy Cross Strut / Armor Mullion in center
    const vertStrut = new THREE.Mesh(new THREE.BoxGeometry(0.08, glassH, 0.14), matNeosteelTrim);
    vertStrut.position.set(0, frameH / 2, 0);
    group.add(vertStrut);

    // Exterior Slanted Blast Louver Visor (Sun/meteorite shield)
    const visor = new THREE.Mesh(new THREE.BoxGeometry(glassW + 0.24, 0.08, 0.35), matNeosteelArmor);
    visor.rotation.x = -Math.PI / 6;
    visor.position.set(0, frameH / 2 + glassH / 2 + 0.14, -wallD / 2 - 0.10);
    group.add(visor);

    // Interior Window Sill Shelf
    const sill = new THREE.Mesh(new THREE.BoxGeometry(glassW + 0.10, 0.08, 0.28), matNeosteelTrim);
    sill.position.set(0, frameH / 2 - glassH / 2 - 0.04, wallD / 2 + 0.10);
    group.add(sill);

    // Diagnostic Readout Strip along interior sill
    const readout = new THREE.Mesh(new THREE.BoxGeometry(glassW * 0.7, 0.02, 0.04), matCyanGlow);
    readout.position.set(0, frameH / 2 - glassH / 2 + 0.01, wallD / 2 + 0.14);
    group.add(readout);

    // Hex bolts along frame perimeter (12 bolts)
    for (let b = 0; b < 6; b++) {
        const bx = -glassW / 2 - 0.06 + (b / 5) * (glassW + 0.12);
        [-glassH / 2 - 0.06, glassH / 2 + 0.06].forEach(by => {
            const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 6), matSilverChrome);
            bolt.rotation.x = Math.PI / 2;
            bolt.position.set(bx, frameH / 2 + by, wallD / 2 + 0.04);
            group.add(bolt);
        });
    }

    scene.add(group);
    return exportGLB(scene, 'terran-observation-window.glb');
}

// =========================================================================
// 8. terran-habitat-roof-kit.glb (ID 135): 屋顶一体化设备包 (空调/太阳能/通讯)
// =========================================================================
function buildRoofKit() {
    const scene = new THREE.Scene();
    const group = new THREE.Group();

    // Base Equipment Skid Frame
    const skid = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 2.4), matNeosteelHull);
    skid.position.set(0, 0.06, 0);
    group.add(skid);

    // Dual-Turbine HVAC Ventilation Box
    const hvac = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.65, 1.8), matNeosteelArmor);
    hvac.position.set(-0.75, 0.445, 0);
    group.add(hvac);

    // 2 Circular Fan Wells with grates
    [-0.45, 0.45].forEach((fy) => {
        const fanWell = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.30, 0.06, 16), matNeosteelHull);
        fanWell.position.set(-0.75, 0.77, fy);
        group.add(fanWell);

        const fanGrate = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 12), matSilverChrome);
        fanGrate.position.set(-0.75, 0.80, fy);
        group.add(fanGrate);

        const fanCenter = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), matNeosteelTrim);
        fanCenter.position.set(-0.75, 0.82, fy);
        group.add(fanCenter);
    });

    // Slanted Photovoltaic Solar Panel Array (2 panels)
    for (let p = 0; p < 2; p++) {
        const panelGroup = new THREE.Group();
        panelGroup.position.set(0.65, 0.35, -0.55 + p * 1.1);
        panelGroup.rotation.x = -Math.PI / 8; // optimal solar angle

        const pFrame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.85), matNeosteelTrim);
        panelGroup.add(pFrame);

        const pCells = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.02, 0.79), matSolarCell);
        pCells.position.y = 0.035;
        panelGroup.add(pCells);

        group.add(panelGroup);
    }

    // Comms Mast and Small Satellite Dish
    const mastBase = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.12, 0.20, 8), matNeosteelHull);
    mastBase.position.set(1.15, 0.22, -0.85);
    group.add(mastBase);

    const mastPole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 8), matSilverChrome);
    mastPole.position.set(1.15, 0.90, -0.85);
    group.add(mastPole);

    // Dish Reflector
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.08, 0.14, 16, 1, true), matNeosteelArmor);
    dish.rotation.z = Math.PI / 4;
    dish.position.set(1.15, 1.25, -0.85);
    group.add(dish);

    const lnbHorn = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.22, 8), matSilverChrome);
    lnbHorn.position.set(1.28, 1.38, -0.85);
    lnbHorn.rotation.z = Math.PI / 4;
    group.add(lnbHorn);

    // Flashing Aviation Warning Beacon at mast tip
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), matRedBeacon);
    beacon.position.set(1.15, 1.62, -0.85);
    group.add(beacon);

    // Hazard safety stripes along skid border
    const skidStripe = createHazardStripeMesh(3.24, 0.06, 0.06);
    skidStripe.position.set(0, 0.03, 1.22);
    group.add(skidStripe);

    scene.add(group);
    return exportGLB(scene, 'terran-habitat-roof-kit.glb');
}

// =========================================================================
// Main Execution
// =========================================================================
async function main() {
    console.log('[START] Generating SC1 Terran Living Unit 3D PBR GLB Assets...');
    await buildBunkBed();
    await buildRationDispenser();
    await buildCrewLocker();
    await buildLifeSupport();
    await buildWorkstation();
    await buildAirlockDoor();
    await buildObservationWindow();
    await buildRoofKit();
    console.log('[DONE] All 8 Terran Living Unit assets generated successfully!');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
