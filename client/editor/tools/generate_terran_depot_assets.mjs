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
                console.log(`[OK] Saved Terran Depot GLB: ${filename} (${fs.statSync(outPath).size} bytes)`);
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
// StarCraft 1 Terran Supply Depot Materials
// =========================================================================
const matNeosteelHull = new THREE.MeshStandardMaterial({
    color: 0x242a34, // Dark slate gunmetal
    roughness: 0.55,
    metalness: 0.80,
});

const matNeosteelOchre = new THREE.MeshStandardMaterial({
    color: 0xba7d34, // Classic SC1 Terran ochre / industrial gold
    roughness: 0.45,
    metalness: 0.70,
});

const matNeosteelTrim = new THREE.MeshStandardMaterial({
    color: 0x505c6d, // Light gunmetal trim
    roughness: 0.40,
    metalness: 0.85,
});

const matChrome = new THREE.MeshStandardMaterial({
    color: 0xdddddd,
    roughness: 0.15,
    metalness: 0.95,
});

const matHazardYellow = new THREE.MeshStandardMaterial({
    color: 0xd99b00,
    roughness: 0.4,
    metalness: 0.3,
});

const matHazardBlack = new THREE.MeshStandardMaterial({
    color: 0x161616,
    roughness: 0.6,
    metalness: 0.2,
});

const matPlasmaGlowCyan = new THREE.MeshStandardMaterial({
    color: 0x00f0ff,
    emissive: 0x00d8ff,
    emissiveIntensity: 1.8,
    roughness: 0.1,
    metalness: 0.1,
});

const matScreenGlowGreen = new THREE.MeshStandardMaterial({
    color: 0x00ff66,
    emissive: 0x00e655,
    emissiveIntensity: 1.5,
    roughness: 0.2,
    metalness: 0.1,
});

const matScreenGlowAmber = new THREE.MeshStandardMaterial({
    color: 0xffaa00,
    emissive: 0xff8800,
    emissiveIntensity: 1.4,
    roughness: 0.2,
    metalness: 0.1,
});

const matBeaconRed = new THREE.MeshStandardMaterial({
    color: 0xff1111,
    emissive: 0xff1111,
    emissiveIntensity: 1.6,
    roughness: 0.2,
});

const matBeaconGreen = new THREE.MeshStandardMaterial({
    color: 0x00ff44,
    emissive: 0x00ee33,
    emissiveIntensity: 1.6,
    roughness: 0.2,
});

const matOliveCrate = new THREE.MeshStandardMaterial({
    color: 0x3d4936, // Olive military crate
    roughness: 0.6,
    metalness: 0.5,
});

const matAmberCrate = new THREE.MeshStandardMaterial({
    color: 0x82541e, // Heavy ammo crate
    roughness: 0.5,
    metalness: 0.6,
});

const matPalletWood = new THREE.MeshStandardMaterial({
    color: 0x5a4835, // Treated composite industrial skid
    roughness: 0.8,
    metalness: 0.2,
});

const matDarkMesh = new THREE.MeshStandardMaterial({
    color: 0x181a1f,
    roughness: 0.8,
    metalness: 0.3,
});

// Helper for hazard stripes
function createHazardChevrons(parent, width, depth, yPos) {
    const stripeCount = 7;
    const stripeW = width / stripeCount;
    for (let i = 0; i < stripeCount; i++) {
        const isYellow = i % 2 === 0;
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(stripeW * 0.95, 0.02, depth),
            isYellow ? matHazardYellow : matHazardBlack
        );
        mesh.position.set(-width / 2 + stripeW * (i + 0.5), yPos, 0);
        parent.add(mesh);
    }
}

// =========================================================================
// 1. terran-depot-roof-vent.glb (ID 136)
// Rooftop industrial ventilation hatch with dual heavy turbine exhaust fans
// =========================================================================
function buildDepotRoofVent() {
    const root = new THREE.Group();

    // Base skid frame
    const baseSkid = new THREE.Mesh(
        new THREE.BoxGeometry(3.6, 0.3, 3.2),
        matNeosteelHull
    );
    baseSkid.position.set(0, 0.15, 0);
    root.add(baseSkid);

    // Beveled raised hood
    const hood = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 1.8, 0.7, 8),
        matNeosteelOchre
    );
    hood.position.set(0, 0.65, 0);
    root.add(hood);

    // Two circular turbine exhaust cowl housings
    const cowlPositions = [-0.85, 0.85];
    cowlPositions.forEach((cx) => {
        // Outer cowl ring
        const cowl = new THREE.Mesh(
            new THREE.CylinderGeometry(0.65, 0.70, 0.6, 24),
            matNeosteelTrim
        );
        cowl.position.set(cx, 1.1, 0);
        root.add(cowl);

        // Dark interior recess
        const innerVoid = new THREE.Mesh(
            new THREE.CylinderGeometry(0.55, 0.55, 0.58, 24),
            matDarkMesh
        );
        innerVoid.position.set(cx, 1.12, 0);
        root.add(innerVoid);

        // Central spinner hub
        const hub = new THREE.Mesh(
            new THREE.ConeGeometry(0.18, 0.35, 16),
            matChrome
        );
        hub.position.set(cx, 1.35, 0);
        root.add(hub);

        // 8 Fan blades
        for (let b = 0; b < 8; b++) {
            const angle = (b / 8) * Math.PI * 2;
            const blade = new THREE.Mesh(
                new THREE.BoxGeometry(0.06, 0.02, 0.42),
                matChrome
            );
            blade.position.set(
                cx + Math.cos(angle) * 0.26,
                1.28,
                Math.sin(angle) * 0.26
            );
            blade.rotation.y = angle + 0.3;
            root.add(blade);
        }

        // Protective radial wire grates
        for (let g = 0; g < 4; g++) {
            const gAngle = (g / 4) * Math.PI;
            const wire = new THREE.Mesh(
                new THREE.CylinderGeometry(0.012, 0.012, 1.15, 8),
                matNeosteelTrim
            );
            wire.rotation.z = Math.PI / 2;
            wire.rotation.y = gAngle;
            wire.position.set(cx, 1.42, 0);
            root.add(wire);
        }
    });

    // Hydraulic lift pistons on sides
    [-1.75, 1.75].forEach((px) => {
        const pistonJacket = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.1, 0.8, 16),
            matNeosteelHull
        );
        pistonJacket.position.set(px, 0.6, 0);
        root.add(pistonJacket);

        const pistonRod = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.9, 16),
            matChrome
        );
        pistonRod.position.set(px, 1.0, 0);
        root.add(pistonRod);
    });

    // Warning hazard stripes across front and rear perimeter
    createHazardChevrons(root, 3.2, 0.25, 0.32);

    // Strobe beacon
    const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.1, 0.15, 12),
        matBeaconRed
    );
    beacon.position.set(0, 1.1, 1.3);
    root.add(beacon);

    return root;
}

// =========================================================================
// 2. terran-power-core.glb (ID 137)
// Cold fusion generator reactor with glowing cyan containment tube
// =========================================================================
function buildPowerCore() {
    const root = new THREE.Group();

    // Heavy octagonal base
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2, 1.4, 0.5, 8),
        matNeosteelHull
    );
    base.position.set(0, 0.25, 0);
    root.add(base);

    // Base collar ring with anchor bolt heads
    const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(1.0, 1.05, 0.2, 8),
        matNeosteelOchre
    );
    collar.position.set(0, 0.6, 0);
    root.add(collar);

    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const bolt = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 0.08, 6),
            matChrome
        );
        bolt.position.set(Math.cos(angle) * 0.92, 0.72, Math.sin(angle) * 0.92);
        root.add(bolt);
    }

    // Central transparent reactor column casing
    const glassTube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 2.0, 24),
        new THREE.MeshStandardMaterial({
            color: 0x88ffff,
            roughness: 0.1,
            metalness: 0.2,
            transparent: true,
            opacity: 0.35,
        })
    );
    glassTube.position.set(0, 1.7, 0);
    root.add(glassTube);

    // Glowing cyan plasma core inside
    const plasmaCore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 1.9, 20),
        matPlasmaGlowCyan
    );
    plasmaCore.position.set(0, 1.7, 0);
    root.add(plasmaCore);

    // Magnetic confinement rings around tube
    [1.0, 1.5, 2.0, 2.5].forEach((ry) => {
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.56, 0.05, 12, 24),
            matNeosteelTrim
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, ry, 0);
        root.add(ring);
    });

    // 4 Vertical copper magnetic containment stanchions
    for (let s = 0; s < 4; s++) {
        const sAngle = (s / 4) * Math.PI * 2 + Math.PI / 4;
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 2.2, 12),
            matNeosteelOchre
        );
        pole.position.set(Math.cos(sAngle) * 0.72, 1.75, Math.sin(sAngle) * 0.72);
        root.add(pole);
    }

    // Top cap & heavy condenser head
    const topCap = new THREE.Mesh(
        new THREE.CylinderGeometry(1.1, 0.85, 0.5, 8),
        matNeosteelHull
    );
    topCap.position.set(0, 2.95, 0);
    root.add(topCap);

    // Lateral cooling radiator fins
    [-0.95, 0.95].forEach((fx) => {
        for (let fin = 0; fin < 6; fin++) {
            const finMesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.15, 0.03, 0.8),
                matNeosteelTrim
            );
            finMesh.position.set(fx, 1.1 + fin * 0.25, 0);
            root.add(finMesh);
        }
    });

    // High voltage conduit cables running to ground
    const cable = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 1.5, 12),
        matHazardYellow
    );
    cable.position.set(0.7, 0.8, 0.7);
    cable.rotation.z = -0.3;
    root.add(cable);

    return root;
}

// =========================================================================
// 3. terran-supply-crates.glb (ID 138)
// Stacks of military supply containers on heavy-duty industrial pallet
// =========================================================================
function buildSupplyCrates() {
    const root = new THREE.Group();

    // Heavy pallet base (industrial composite)
    const palletBase = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.16, 1.8),
        matPalletWood
    );
    palletBase.position.set(0, 0.08, 0);
    root.add(palletBase);

    // Pallet skid runners
    [-0.7, 0, 0.7].forEach((px) => {
        const runner = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.16, 1.8),
            matNeosteelHull
        );
        runner.position.set(px, 0.08, 0);
        root.add(runner);
    });

    // Tier 1: Left large military container (Olive Drab)
    const crate1 = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, 0.8, 1.5),
        matOliveCrate
    );
    crate1.position.set(-0.55, 0.56, 0);
    root.add(crate1);

    // Crate 1 corner reinforcements
    const trim1 = new THREE.Mesh(
        new THREE.BoxGeometry(1.08, 0.82, 0.08),
        matNeosteelTrim
    );
    trim1.position.set(-0.55, 0.56, 0.72);
    root.add(trim1);

    // Tier 1: Right large military container (Gunmetal)
    const crate2 = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, 0.8, 1.5),
        matNeosteelHull
    );
    crate2.position.set(0.55, 0.56, 0);
    root.add(crate2);

    // Crate 2 ochre hazard stencil band
    const band2 = new THREE.Mesh(
        new THREE.BoxGeometry(1.07, 0.12, 1.52),
        matNeosteelOchre
    );
    band2.position.set(0.55, 0.56, 0);
    root.add(band2);

    // Tier 2: Ammunition crate (Dark Amber)
    const ammoCrate = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.5, 1.1),
        matAmberCrate
    );
    ammoCrate.position.set(-0.45, 1.21, 0.1);
    root.add(ammoCrate);

    // Tier 2: High-tech refrigerated rations canister (Silver / Cyan LED)
    const canisterBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.45, 0.6),
        matNeosteelTrim
    );
    canisterBox.position.set(0.5, 1.19, -0.3);
    root.add(canisterBox);

    const ledBlue = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.04, 0.02),
        matPlasmaGlowCyan
    );
    ledBlue.position.set(0.5, 1.25, 0.02);
    root.add(ledBlue);

    // Tier 2: Medical / emergency crate (Light Gray with Red cross marker)
    const medCrate = new THREE.Mesh(
        new THREE.BoxGeometry(0.75, 0.4, 0.6),
        new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.4 })
    );
    medCrate.position.set(0.5, 1.16, 0.4);
    root.add(medCrate);

    const redCrossH = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.05, 0.02),
        matBeaconRed
    );
    redCrossH.position.set(0.5, 1.16, 0.71);
    root.add(redCrossH);

    const redCrossV = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.2, 0.02),
        matBeaconRed
    );
    redCrossV.position.set(0.5, 1.16, 0.71);
    root.add(redCrossV);

    // Cargo tie-down tension straps
    [-0.5, 0.4].forEach((sz) => {
        const strap = new THREE.Mesh(
            new THREE.BoxGeometry(2.35, 0.02, 0.06),
            matHazardYellow
        );
        strap.position.set(0, 1.47, sz);
        root.add(strap);
    });

    return root;
}

// =========================================================================
// 4. terran-cryo-freezer.glb (ID 139)
// Cryogenic food & ration freezer vault with frosted glass windows
// =========================================================================
function buildCryoFreezer() {
    const root = new THREE.Group();

    // Heavy armored vault cabinet
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 2.2, 0.9),
        matNeosteelHull
    );
    body.position.set(0, 1.1, 0);
    root.add(body);

    // Dual vertical door panels (left / right)
    [-0.38, 0.38].forEach((dx) => {
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(0.72, 1.9, 0.08),
            matNeosteelTrim
        );
        door.position.set(dx, 1.08, 0.48);
        root.add(door);

        // Frosted inspection window slit
        const frostedGlass = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 1.1, 0.02),
            new THREE.MeshStandardMaterial({
                color: 0x99ddff,
                roughness: 0.2,
                metalness: 0.1,
                transparent: true,
                opacity: 0.7,
                emissive: 0x0088cc,
                emissiveIntensity: 0.3,
            })
        );
        frostedGlass.position.set(dx, 1.15, 0.53);
        root.add(frostedGlass);

        // Rotary release wheel / handle
        const handleHub = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16),
            matChrome
        );
        handleHub.rotation.x = Math.PI / 2;
        handleHub.position.set(dx, 0.85, 0.54);
        root.add(handleHub);

        const handleBar = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.04, 0.04),
            matNeosteelOchre
        );
        handleBar.position.set(dx, 0.85, 0.58);
        root.add(handleBar);
    });

    // Top refrigeration unit & compressor coils
    const compressor = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.35, 0.75),
        matNeosteelOchre
    );
    compressor.position.set(0, 2.38, 0);
    root.add(compressor);

    // Copper heat exchanger tubes
    for (let c = 0; c < 5; c++) {
        const pipe = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 1.2, 12),
            new THREE.MeshStandardMaterial({ color: 0xc87030, metalness: 0.9, roughness: 0.2 })
        );
        pipe.rotation.z = Math.PI / 2;
        pipe.position.set(0, 2.32 + (c % 2) * 0.08, 0.42);
        root.add(pipe);
    }

    // Digital temperature readout display (-80°C)
    const displayPanel = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.15, 0.02),
        matScreenGlowGreen
    );
    displayPanel.position.set(0, 2.05, 0.52);
    root.add(displayPanel);

    return root;
}

// =========================================================================
// 5. terran-logistics-console.glb (ID 140)
// Logistics inventory dispatch workstation with dual CRT monitors
// =========================================================================
function buildLogisticsConsole() {
    const root = new THREE.Group();

    // Heavy Neosteel desk frame
    const deskTop = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.1, 1.0),
        matNeosteelTrim
    );
    deskTop.position.set(0, 0.8, 0);
    root.add(deskTop);

    // Desk legs & side server tower
    const tower = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.75, 0.9),
        matNeosteelHull
    );
    tower.position.set(0.65, 0.38, 0);
    root.add(tower);

    const leftLeg = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.75, 0.9),
        matNeosteelHull
    );
    leftLeg.position.set(-0.8, 0.38, 0);
    root.add(leftLeg);

    // Footrest rail
    const footrail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 1.4, 12),
        matChrome
    );
    footrail.rotation.z = Math.PI / 2;
    footrail.position.set(-0.1, 0.2, -0.2);
    root.add(footrail);

    // Main central retro CRT monitor (Inventory UI Green)
    const monitor1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.55, 0.5),
        matNeosteelHull
    );
    monitor1.position.set(-0.2, 1.15, -0.15);
    root.add(monitor1);

    const screen1 = new THREE.Mesh(
        new THREE.PlaneGeometry(0.58, 0.42),
        matScreenGlowGreen
    );
    screen1.position.set(-0.2, 1.15, 0.11);
    root.add(screen1);

    // Secondary monitor angled on right (Telemetry Amber)
    const monitor2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.45, 0.4),
        matNeosteelHull
    );
    monitor2.position.set(0.55, 1.12, -0.12);
    monitor2.rotation.y = -0.35;
    root.add(monitor2);

    const screen2 = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 0.34),
        matScreenGlowAmber
    );
    screen2.position.set(0.55, 1.12, 0.09);
    screen2.rotation.y = -0.35;
    root.add(screen2);

    // Rugged mechanical keyboard
    const keyboard = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.04, 0.22),
        matNeosteelHull
    );
    keyboard.position.set(-0.15, 0.86, 0.22);
    keyboard.rotation.x = 0.1;
    root.add(keyboard);

    // Trackball / scanner wand
    const wand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.025, 0.16, 12),
        matNeosteelOchre
    );
    wand.position.set(0.3, 0.86, 0.25);
    wand.rotation.z = Math.PI / 3;
    root.add(wand);

    // Heavy duty swivel stool
    const stoolBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.35, 0.08, 16),
        matNeosteelHull
    );
    stoolBase.position.set(-0.1, 0.04, 0.7);
    root.add(stoolBase);

    const stoolColumn = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.5, 12),
        matChrome
    );
    stoolColumn.position.set(-0.1, 0.32, 0.7);
    root.add(stoolColumn);

    const stoolSeat = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.08, 16),
        matNeosteelOchre
    );
    stoolSeat.position.set(-0.1, 0.58, 0.7);
    root.add(stoolSeat);

    return root;
}

// =========================================================================
// 6. terran-fold-bunks.glb (ID 141)
// Bulkhead-mounted folding crew bunks with thermal sleep bags & ladders
// =========================================================================
function buildFoldBunks() {
    const root = new THREE.Group();

    // Bulkhead back recess frame
    const frame = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 2.6, 0.2),
        matNeosteelHull
    );
    frame.position.set(0, 1.3, -0.4);
    root.add(frame);

    // Top and side armor trim
    const topTrim = new THREE.Mesh(
        new THREE.BoxGeometry(2.5, 0.15, 0.3),
        matNeosteelOchre
    );
    topTrim.position.set(0, 2.62, -0.35);
    root.add(topTrim);

    // Two tiers of folding bunk platforms (Lower Y=0.5, Upper Y=1.55)
    [0.5, 1.55].forEach((by) => {
        // Bed tray
        const tray = new THREE.Mesh(
            new THREE.BoxGeometry(2.1, 0.08, 0.95),
            matNeosteelTrim
        );
        tray.position.set(0, by, 0.12);
        root.add(tray);

        // Padded mattress
        const mattress = new THREE.Mesh(
            new THREE.BoxGeometry(2.0, 0.12, 0.88),
            new THREE.MeshStandardMaterial({ color: 0x383e48, roughness: 0.7 })
        );
        mattress.position.set(0, by + 0.08, 0.12);
        root.add(mattress);

        // Thermal blanket
        const blanket = new THREE.Mesh(
            new THREE.BoxGeometry(1.4, 0.14, 0.85),
            new THREE.MeshStandardMaterial({ color: 0x4f5d73, roughness: 0.6 })
        );
        blanket.position.set(-0.25, by + 0.1, 0.12);
        root.add(blanket);

        // Headrest pillow
        const pillow = new THREE.Mesh(
            new THREE.BoxGeometry(0.35, 0.14, 0.6),
            new THREE.MeshStandardMaterial({ color: 0x8a99ad, roughness: 0.5 })
        );
        pillow.position.set(0.75, by + 0.12, 0.12);
        root.add(pillow);

        // Protective safety rail
        const rail = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 1.2, 8),
            matChrome
        );
        rail.rotation.z = Math.PI / 2;
        rail.position.set(-0.35, by + 0.28, 0.58);
        root.add(rail);

        // Bedside reading light
        const light = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.06, 0.04),
            new THREE.MeshStandardMaterial({
                color: 0xffeebb,
                emissive: 0xffdd88,
                emissiveIntensity: 1.2,
            })
        );
        light.position.set(0.85, by + 0.35, -0.28);
        root.add(light);
    });

    // Fold-out access ladder on right
    const ladderX = 0.95;
    [-0.1, 0.15].forEach((lz) => {
        const ladderStringer = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 2.4, 8),
            matChrome
        );
        ladderStringer.position.set(ladderX, 1.2, lz + 0.45);
        root.add(ladderStringer);
    });

    for (let r = 0; r < 6; r++) {
        const rung = new THREE.Mesh(
            new THREE.CylinderGeometry(0.015, 0.015, 0.25, 8),
            matChrome
        );
        rung.rotation.x = Math.PI / 2;
        rung.position.set(ladderX, 0.35 + r * 0.36, 0.47);
        root.add(rung);
    }

    return root;
}

// =========================================================================
// 7. terran-depot-airlock.glb (ID 142)
// Heavy cargo airlock blast door with hydraulic interlocking lock teeth
// =========================================================================
function buildDepotAirlock() {
    const root = new THREE.Group();

    // Outer door frame portal
    const topBeam = new THREE.Mesh(
        new THREE.BoxGeometry(3.6, 0.45, 0.5),
        matNeosteelOchre
    );
    topBeam.position.set(0, 3.2, 0);
    root.add(topBeam);

    [-1.65, 1.65].forEach((px) => {
        const pillar = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 3.2, 0.45),
            matNeosteelHull
        );
        pillar.position.set(px, 1.6, 0);
        root.add(pillar);
    });

    // Left and right sliding blast door leaves
    const doorMat = new THREE.MeshStandardMaterial({
        color: 0x303945,
        roughness: 0.4,
        metalness: 0.85,
    });

    const doorLeft = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 2.9, 0.2),
        doorMat
    );
    doorLeft.position.set(-0.72, 1.5, 0);
    root.add(doorLeft);

    const doorRight = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 2.9, 0.2),
        doorMat
    );
    doorRight.position.set(0.72, 1.5, 0);
    root.add(doorRight);

    // Interlocking center lock teeth
    for (let t = 0; t < 5; t++) {
        const tooth = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.25, 0.24),
            matChrome
        );
        tooth.position.set(t % 2 === 0 ? -0.02 : 0.02, 0.6 + t * 0.5, 0);
        root.add(tooth);
    }

    // Heavy hydraulic rams on top
    [-0.8, 0.8].forEach((rx) => {
        const ram = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 0.9, 16),
            matChrome
        );
        ram.rotation.z = Math.PI / 2;
        ram.position.set(rx, 3.0, 0.18);
        root.add(ram);
    });

    // Threshold ramp plate with hazard stripes
    createHazardChevrons(root, 3.2, 0.35, 0.04);

    // Status beacons
    const beaconR = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 0.14, 12),
        matBeaconRed
    );
    beaconR.position.set(-1.2, 3.2, 0.28);
    root.add(beaconR);

    const beaconG = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 0.14, 12),
        matBeaconGreen
    );
    beaconG.position.set(1.2, 3.2, 0.28);
    root.add(beaconG);

    return root;
}

// =========================================================================
// 8. terran-depot-corner-damper.glb (ID 143)
// Exterior seismic foundation damper & corner buttress
// =========================================================================
function buildCornerDamper() {
    const root = new THREE.Group();

    // Heavy cast iron footing plate
    const footing = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.2, 1.2),
        matNeosteelHull
    );
    footing.position.set(0, 0.1, 0);
    root.add(footing);

    // Foundation anchor bolts (4 corners)
    [-0.45, 0.45].forEach((bx) => {
        [-0.45, 0.45].forEach((bz) => {
            const bolt = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04, 0.04, 0.1, 6),
                matChrome
            );
            bolt.position.set(bx, 0.24, bz);
            root.add(bolt);
        });
    });

    // Lower pivoting clevis bracket
    const clevis = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.2, 0.3, 16),
        matNeosteelOchre
    );
    clevis.position.set(0, 0.35, 0);
    root.add(clevis);

    // Diagonal telescoping hydraulic damper arm
    const damperJacket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 1.4, 16),
        matNeosteelHull
    );
    damperJacket.rotation.z = 0.55;
    damperJacket.position.set(0.35, 1.0, 0);
    root.add(damperJacket);

    // Inner chrome cylinder
    const damperPiston = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 1.0, 16),
        matChrome
    );
    damperPiston.rotation.z = 0.55;
    damperPiston.position.set(0.7, 1.55, 0);
    root.add(damperPiston);

    // Heavy coil spring around damper
    for (let c = 0; c < 7; c++) {
        const coil = new THREE.Mesh(
            new THREE.TorusGeometry(0.16, 0.025, 8, 16),
            matNeosteelOchre
        );
        coil.rotation.y = Math.PI / 2;
        coil.rotation.x = -0.55;
        coil.position.set(0.15 + c * 0.08, 0.7 + c * 0.11, 0);
        root.add(coil);
    }

    // Upper anchor head
    const upperHead = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.3, 0.3),
        matNeosteelTrim
    );
    upperHead.position.set(0.95, 1.95, 0);
    root.add(upperHead);

    return root;
}

// =========================================================================
// Main Export Routine
// =========================================================================
async function main() {
    console.log('Generating 8 StarCraft 1 Terran Supply Depot 3D PBR GLB Assets...');

    await exportGLB(buildDepotRoofVent(), 'terran-depot-roof-vent.glb');
    await exportGLB(buildPowerCore(), 'terran-power-core.glb');
    await exportGLB(buildSupplyCrates(), 'terran-supply-crates.glb');
    await exportGLB(buildCryoFreezer(), 'terran-cryo-freezer.glb');
    await exportGLB(buildLogisticsConsole(), 'terran-logistics-console.glb');
    await exportGLB(buildFoldBunks(), 'terran-fold-bunks.glb');
    await exportGLB(buildDepotAirlock(), 'terran-depot-airlock.glb');
    await exportGLB(buildCornerDamper(), 'terran-depot-corner-damper.glb');

    console.log('All 8 Terran Supply Depot Assets Successfully Generated!');
}

main().catch((err) => {
    console.error('Asset Generation Error:', err);
    process.exit(1);
});
