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
                console.log(`[OK] Saved Terran Bunker GLB: ${filename} (${fs.statSync(outPath).size} bytes)`);
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
// StarCraft 1 Terran Bunker Material Palette
// =========================================================================
const matNeosteelHull = new THREE.MeshStandardMaterial({
    color: 0x222730, // Deep slate bunker armor
    roughness: 0.60,
    metalness: 0.82,
});

const matNeosteelOchre = new THREE.MeshStandardMaterial({
    color: 0xba7d34, // Classic SC1 Terran ochre / industrial gold trim
    roughness: 0.45,
    metalness: 0.70,
});

const matNeosteelTrim = new THREE.MeshStandardMaterial({
    color: 0x4d5868, // Medium gunmetal beveled reinforcement
    roughness: 0.45,
    metalness: 0.85,
});

const matChrome = new THREE.MeshStandardMaterial({
    color: 0xdedede,
    roughness: 0.15,
    metalness: 0.95,
});

const matHazardYellow = new THREE.MeshStandardMaterial({
    color: 0xd99b00,
    roughness: 0.4,
    metalness: 0.3,
    side: THREE.DoubleSide,
});

const matHazardBlack = new THREE.MeshStandardMaterial({
    color: 0x141414,
    roughness: 0.6,
    metalness: 0.2,
    side: THREE.DoubleSide,
});

const matSearchlightBeam = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xddf0ff,
    emissiveIntensity: 2.2,
    roughness: 0.1,
    metalness: 0.1,
    side: THREE.DoubleSide,
});

const matPlasmaCyan = new THREE.MeshStandardMaterial({
    color: 0x00f0ff,
    emissive: 0x00d8ff,
    emissiveIntensity: 1.8,
    roughness: 0.1,
    metalness: 0.1,
    side: THREE.DoubleSide,
});

const matRadarGreen = new THREE.MeshStandardMaterial({
    color: 0x00ff66,
    emissive: 0x00e655,
    emissiveIntensity: 1.8,
    roughness: 0.2,
    metalness: 0.1,
    side: THREE.DoubleSide,
});

const matStimRed = new THREE.MeshStandardMaterial({
    color: 0xff2222,
    emissive: 0xff1111,
    emissiveIntensity: 2.0,
    roughness: 0.2,
    metalness: 0.1,
    side: THREE.DoubleSide,
});

const matStimAmber = new THREE.MeshStandardMaterial({
    color: 0xff9900,
    emissive: 0xee7700,
    emissiveIntensity: 1.8,
    roughness: 0.2,
    metalness: 0.1,
    side: THREE.DoubleSide,
});

const matBrassAmmo = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    roughness: 0.3,
    metalness: 0.9,
    side: THREE.DoubleSide,
});

const matRubberGrip = new THREE.MeshStandardMaterial({
    color: 0x1a1a1c,
    roughness: 0.8,
    metalness: 0.1,
    side: THREE.DoubleSide,
});

// Helper for hazard stripes
function createHazardRing(parent, radius, thickness, yPos) {
    const segments = 16;
    const segAngle = (Math.PI * 2) / segments;
    for (let i = 0; i < segments; i++) {
        const isYellow = i % 2 === 0;
        const arc = new THREE.Mesh(
            new THREE.RingGeometry(radius - thickness / 2, radius + thickness / 2, 12, 1, i * segAngle, segAngle * 0.92),
            isYellow ? matHazardYellow : matHazardBlack
        );
        arc.rotation.x = -Math.PI / 2;
        arc.position.set(0, yPos, 0);
        parent.add(arc);
    }
}

// =========================================================================
// 1. terran-bunker-roof-dome.glb (ID 144)
// Low-profile octagonal armored roof dome with 360° searchlight & lifting lugs
// =========================================================================
function buildBunkerRoofDome() {
    const root = new THREE.Group();

    // Base octagonal outer dome plate
    const baseDome = new THREE.Mesh(
        new THREE.CylinderGeometry(3.6, 4.2, 0.45, 8),
        matNeosteelHull
    );
    baseDome.position.set(0, 0.225, 0);
    root.add(baseDome);

    // Secondary raised armored tier
    const midTier = new THREE.Mesh(
        new THREE.CylinderGeometry(2.4, 3.2, 0.40, 8),
        matNeosteelOchre
    );
    midTier.position.set(0, 0.65, 0);
    root.add(midTier);

    // Central cupola ring
    const cupola = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2, 1.6, 0.35, 16),
        matNeosteelTrim
    );
    cupola.position.set(0, 1.0, 0);
    root.add(cupola);

    // High-intensity rotatable searchlight housing
    const turretBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.6, 0.25, 16),
        matNeosteelHull
    );
    turretBase.position.set(0, 1.25, 0);
    root.add(turretBase);

    // Dual-barrel searchlight head
    const yokeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.15), matNeosteelTrim);
    yokeL.position.set(-0.35, 1.5, 0);
    root.add(yokeL);

    const yokeR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.15), matNeosteelTrim);
    yokeR.position.set(0.35, 1.5, 0);
    root.add(yokeR);

    const lightBarrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 0.5, 20),
        matNeosteelTrim
    );
    lightBarrel.rotation.x = Math.PI / 2;
    lightBarrel.position.set(0, 1.5, 0.05);
    root.add(lightBarrel);

    // Searchlight emissive lens
    const lens = new THREE.Mesh(
        new THREE.CircleGeometry(0.25, 20),
        matSearchlightBeam
    );
    lens.position.set(0, 1.5, 0.31);
    root.add(lens);

    // 4 Diagonal crane lifting lugs / shackles
    for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const lug = new THREE.Mesh(
            new THREE.TorusGeometry(0.18, 0.04, 8, 16),
            matChrome
        );
        lug.position.set(Math.cos(angle) * 3.2, 0.55, Math.sin(angle) * 3.2);
        lug.rotation.y = angle;
        root.add(lug);
    }

    // Armored periscope visor slit on front-right
    const periscopeVisor = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.2, 0.3),
        matNeosteelHull
    );
    periscopeVisor.position.set(1.4, 0.8, 1.4);
    periscopeVisor.rotation.y = Math.PI / 4;
    root.add(periscopeVisor);

    const visorSlit = new THREE.Mesh(
        new THREE.PlaneGeometry(0.45, 0.08),
        matRadarGreen
    );
    visorSlit.position.set(1.4, 0.8, 1.56);
    visorSlit.rotation.y = Math.PI / 4;
    root.add(visorSlit);

    return root;
}

// =========================================================================
// 2. terran-bunker-ammo-tower.glb (ID 145)
// Central automatic ammunition rotary carousel tower with 4-way feed chutes
// =========================================================================
function buildBunkerAmmoTower() {
    const root = new THREE.Group();

    // Heavy bolted deck base
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.75, 0.85, 0.25, 16),
        matNeosteelHull
    );
    base.position.set(0, 0.125, 0);
    root.add(base);

    // Main ammunition rotary magazine drum
    const drum = new THREE.Mesh(
        new THREE.CylinderGeometry(0.65, 0.65, 1.3, 24),
        matNeosteelOchre
    );
    drum.position.set(0, 0.9, 0);
    root.add(drum);

    // Drum armor reinforcement rings
    [0.4, 0.9, 1.4].forEach((ry) => {
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.66, 0.04, 8, 24),
            matNeosteelTrim
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, ry, 0);
        root.add(ring);
    });

    // Vertical inspection glass slit showing golden brass rounds
    const glassSlit = new THREE.Mesh(
        new THREE.PlaneGeometry(0.12, 1.0),
        new THREE.MeshStandardMaterial({
            color: 0x88ffff,
            roughness: 0.1,
            metalness: 0.1,
            transparent: true,
            opacity: 0.5,
        })
    );
    glassSlit.position.set(0, 0.9, 0.66);
    root.add(glassSlit);

    for (let c = 0; c < 8; c++) {
        const bullet = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.025, 0.08, 8),
            matBrassAmmo
        );
        bullet.rotation.z = Math.PI / 2;
        bullet.position.set(0, 0.5 + c * 0.11, 0.63);
        root.add(bullet);
    }

    // 4 Cardinal flexible linkless feed chutes (towards 4 stations)
    const dirs = [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 0, 1],
        [0, 0, -1],
    ];
    dirs.forEach(([dx, , dz]) => {
        const angle = Math.atan2(dx, dz);
        const chute = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, 0.08, 0.9),
            matNeosteelTrim
        );
        chute.position.set(dx * 0.8, 1.3, dz * 0.8);
        chute.rotation.y = angle;
        chute.rotation.x = 0.2;
        root.add(chute);

        // Feed motor housing
        const motor = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 0.2, 12),
            matNeosteelHull
        );
        motor.position.set(dx * 0.62, 1.35, dz * 0.62);
        root.add(motor);
    });

    // Top digital ammo counter ring & beacon
    const topCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.55, 0.35, 16),
        matNeosteelHull
    );
    topCap.position.set(0, 1.7, 0);
    root.add(topCap);

    // Green digital ammo readout display
    const readout = new THREE.Mesh(
        new THREE.CylinderGeometry(0.52, 0.52, 0.12, 16),
        matRadarGreen
    );
    readout.position.set(0, 1.75, 0);
    root.add(readout);

    // Strobe beacon on top
    const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 0.12, 12),
        matStimAmber
    );
    beacon.position.set(0, 1.95, 0);
    root.add(beacon);

    return root;
}

// =========================================================================
// 3. terran-bunker-gun-station.glb (ID 146)
// Marine combat tripod weapon mount with C-14 cradle, chest pad & grips
// =========================================================================
function buildBunkerGunStation() {
    const root = new THREE.Group();

    // Heavy tripod footing plate
    const basePlate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.55, 0.1, 12),
        matNeosteelHull
    );
    basePlate.position.set(0, 0.05, 0);
    root.add(basePlate);

    // 3 Stiffening tripod legs
    for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2;
        const leg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8),
            matNeosteelTrim
        );
        leg.position.set(Math.cos(angle) * 0.3, 0.25, Math.sin(angle) * 0.3);
        leg.rotation.z = Math.cos(angle) * 0.4;
        leg.rotation.x = Math.sin(angle) * 0.4;
        root.add(leg);
    }

    // Central pneumatic support column
    const column = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.09, 0.65, 16),
        matChrome
    );
    column.position.set(0, 0.55, 0);
    root.add(column);

    // Traverse gimbal & elevation knuckle
    const gimbal = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 12, 12),
        matNeosteelOchre
    );
    gimbal.position.set(0, 0.9, 0);
    root.add(gimbal);

    // C-14 Impaler Gauss Rifle cradle assembly
    const cradle = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.2, 0.8),
        matNeosteelTrim
    );
    cradle.position.set(0, 1.05, 0.15);
    root.add(cradle);

    // Twin 8mm barrels
    [-0.08, 0.08].forEach((bx) => {
        const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.035, 0.04, 0.7, 12),
            matChrome
        );
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(bx, 1.08, 0.75);
        root.add(barrel);

        // Flash hider muzzle
        const muzzle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.045, 0.04, 0.12, 8),
            matNeosteelHull
        );
        muzzle.rotation.x = Math.PI / 2;
        muzzle.position.set(bx, 1.08, 1.15);
        root.add(muzzle);
    });

    // Padded rubber chest recoil pad for marine in CMC armor
    const chestPad = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.25, 0.08),
        matRubberGrip
    );
    chestPad.position.set(0, 0.95, -0.32);
    root.add(chestPad);

    // Dual butterfly spade grips with trigger switches
    [-0.24, 0.24].forEach((gx) => {
        const grip = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 0.2, 8),
            matRubberGrip
        );
        grip.position.set(gx, 1.05, -0.22);
        root.add(grip);

        const handleBar = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.03, 0.03),
            matNeosteelTrim
        );
        handleBar.position.set(gx > 0 ? 0.18 : -0.18, 1.05, -0.22);
        root.add(handleBar);
    });

    // Optical collimator sight with glowing red reticle
    const sight = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.25, 12),
        matNeosteelHull
    );
    sight.rotation.x = Math.PI / 2;
    sight.position.set(0, 1.25, 0.1);
    root.add(sight);

    const reticle = new THREE.Mesh(
        new THREE.CircleGeometry(0.035, 12),
        matStimRed
    );
    reticle.position.set(0, 1.25, -0.03);
    reticle.rotation.y = Math.PI;
    root.add(reticle);

    // Downward spent brass deflector chute
    const deflector = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.35, 0.2),
        matNeosteelOchre
    );
    deflector.rotation.x = 0.4;
    deflector.position.set(0, 0.75, 0.1);
    root.add(deflector);

    return root;
}

// =========================================================================
// 4. terran-bunker-firing-slit.glb (ID 147)
// Exterior armored firing embrasure with blast louvers & laser optics
// =========================================================================
function buildBunkerFiringSlit() {
    const root = new THREE.Group();

    // Heavy beveled embrasure frame
    const frame = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 1.4, 0.45),
        matNeosteelHull
    );
    frame.position.set(0, 0.7, 0);
    root.add(frame);

    // Ochre reinforced perimeter trim
    const trim = new THREE.Mesh(
        new THREE.BoxGeometry(2.5, 0.15, 0.48),
        matNeosteelOchre
    );
    trim.position.set(0, 1.35, 0);
    root.add(trim);

    // Upper and lower sloped blast louvers
    const louverTop = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.25, 0.3),
        matNeosteelTrim
    );
    louverTop.rotation.x = 0.3;
    louverTop.position.set(0, 0.95, 0.15);
    root.add(louverTop);

    const louverBottom = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.25, 0.3),
        matNeosteelTrim
    );
    louverBottom.rotation.x = -0.3;
    louverBottom.position.set(0, 0.45, 0.15);
    root.add(louverBottom);

    // Central narrow firing aperture (dark void)
    const voidSlit = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.28, 0.35),
        matHazardBlack
    );
    voidSlit.position.set(0, 0.7, 0);
    root.add(voidSlit);

    // Target laser emitter lens
    const laserLens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.1, 8),
        matStimRed
    );
    laserLens.rotation.x = Math.PI / 2;
    laserLens.position.set(-0.95, 0.7, 0.22);
    root.add(laserLens);

    // Status beacons
    const beaconR = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 8, 8),
        matStimRed
    );
    beaconR.position.set(0.95, 0.85, 0.22);
    root.add(beaconR);

    const beaconG = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 8, 8),
        matRadarGreen
    );
    beaconG.position.set(0.95, 0.55, 0.22);
    root.add(beaconG);

    return root;
}

// =========================================================================
// 5. terran-bunker-periscope-console.glb (ID 148)
// 360° tactical fire control & periscope console with CRT screen
// =========================================================================
function buildBunkerPeriscopeConsole() {
    const root = new THREE.Group();

    // Pedestal stand
    const stand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.35, 0.85, 12),
        matNeosteelHull
    );
    stand.position.set(0, 0.425, 0);
    root.add(stand);

    // Angled console table
    const table = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.12, 0.8),
        matNeosteelTrim
    );
    table.position.set(0, 0.85, 0);
    table.rotation.x = -0.2;
    root.add(table);

    // Central CRT tactical radar screen housing
    const crtMonitor = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.45, 0.4),
        matNeosteelHull
    );
    crtMonitor.position.set(0, 1.15, 0.0);
    root.add(crtMonitor);

    // Glowing Emerald Green 3D CRT Screen facing operator (-Z)
    const crtScreenF = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.38, 0.08),
        matRadarGreen
    );
    crtScreenF.position.set(0, 1.15, -0.22);
    root.add(crtScreenF);

    // Glowing Emerald Green 3D CRT Screen facing back (+Z)
    const crtScreenB = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.38, 0.08),
        matRadarGreen
    );
    crtScreenB.position.set(0, 1.15, 0.22);
    root.add(crtScreenB);

    // Stereoscopic periscope dual eyepieces descending from above
    const periscopeShaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.7, 12),
        matChrome
    );
    periscopeShaft.position.set(0, 1.85, 0);
    root.add(periscopeShaft);

    const periscopeHead = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.15, 0.2),
        matNeosteelOchre
    );
    periscopeHead.position.set(0, 1.5, 0);
    root.add(periscopeHead);

    // Dual rubber eyecups on -Z side
    [-0.08, 0.08].forEach((ex) => {
        const eyecup = new THREE.Mesh(
            new THREE.CylinderGeometry(0.045, 0.05, 0.08, 12),
            matRubberGrip
        );
        eyecup.rotation.x = -Math.PI / 2;
        eyecup.position.set(ex, 1.5, -0.12);
        root.add(eyecup);
    });

    // Dual rubber eyecups on +Z side
    [-0.08, 0.08].forEach((ex) => {
        const eyecup = new THREE.Mesh(
            new THREE.CylinderGeometry(0.045, 0.05, 0.08, 12),
            matRubberGrip
        );
        eyecup.rotation.x = Math.PI / 2;
        eyecup.position.set(ex, 1.5, 0.12);
        root.add(eyecup);
    });

    // Dual steering/rotation grips for periscope
    [-0.26, 0.26].forEach((gx) => {
        const grip = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8),
            matRubberGrip
        );
        grip.position.set(gx, 1.45, 0);
        root.add(grip);
    });

    // Physical toggle switches on console table
    for (let s = 0; s < 4; s++) {
        const toggle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.015, 0.015, 0.06, 6),
            matChrome
        );
        toggle.position.set(-0.35 + s * 0.12, 0.95, -0.2);
        root.add(toggle);
    }

    // Emergency red alert strobe on top
    const alertLight = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.07, 0.14, 8),
        matStimRed
    );
    alertLight.position.set(0.42, 1.42, 0);
    root.add(alertLight);

    return root;
}

// =========================================================================
// 6. terran-bunker-stim-station.glb (ID 149)
// Combat stimulant injection station & trauma first-aid locker
// =========================================================================
function buildBunkerStimStation() {
    const root = new THREE.Group();

    // Armored wall-mounted cabinet (thickness along X=0.35, height along Y=1.4, length along Z=0.95)
    const cabinet = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 1.4, 0.95),
        matNeosteelHull
    );
    cabinet.position.set(0, 0.7, 0);
    root.add(cabinet);

    // Cabinet ochre border trim
    const border = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.12, 1.02),
        matNeosteelOchre
    );
    border.position.set(0, 1.36, 0);
    root.add(border);

    // Front details placed facing +X (into the bunker room)
    const frontX = 0.20;
    const vialZ = [-0.3, -0.1, 0.1, 0.3];
    vialZ.forEach((vz, idx) => {
        const isRed = idx < 2;
        const vial = new THREE.Mesh(
            new THREE.CylinderGeometry(0.045, 0.045, 0.45, 12),
            isRed ? matStimRed : matStimAmber
        );
        vial.position.set(frontX + 0.02, 0.95, vz);
        root.add(vial);

        const capTop = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8),
            matChrome
        );
        capTop.position.set(frontX + 0.02, 1.2, vz);
        root.add(capTop);

        const capBottom = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8),
            matChrome
        );
        capBottom.position.set(frontX + 0.02, 0.7, vz);
        root.add(capBottom);
    });

    // Pressure gauge
    const gauge = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.05, 16),
        matNeosteelTrim
    );
    gauge.rotation.z = Math.PI / 2;
    gauge.position.set(frontX, 0.55, 0);
    root.add(gauge);

    const gaugeDial = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.12, 0.12),
        matRadarGreen
    );
    gaugeDial.position.set(frontX + 0.03, 0.55, 0);
    root.add(gaugeDial);

    // Auto-applicator gun
    const gun = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.22, 0.08),
        matNeosteelOchre
    );
    gun.position.set(frontX, 0.25, -0.25);
    root.add(gun);

    const needle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.015, 0.1, 8),
        matChrome
    );
    needle.position.set(frontX, 0.10, -0.25);
    root.add(needle);

    // Medical red cross badge
    const crossH = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.06, 0.2),
        matStimRed
    );
    crossH.position.set(frontX + 0.01, 0.28, 0.25);
    root.add(crossH);

    const crossV = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.2, 0.06),
        matStimRed
    );
    crossV.position.set(frontX + 0.01, 0.28, 0.25);
    root.add(crossV);

    return root;
}

// =========================================================================
// 7. terran-bunker-escape-hatch.glb (ID 150)
// Subterranean emergency egress & resupply hatch with locking wheel
// =========================================================================
function buildBunkerEscapeHatch() {
    const root = new THREE.Group();

    // Outer square deck rim plate
    const rimPlate = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.14, 1.8),
        matNeosteelHull
    );
    rimPlate.position.set(0, 0.07, 0);
    root.add(rimPlate);

    // Hazard warning ring around circular hatch
    createHazardRing(root, 0.75, 0.2, 0.145);

    // Recessed circular hatch ring
    const hatchRing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.65, 0.68, 0.16, 24),
        matNeosteelTrim
    );
    hatchRing.position.set(0, 0.15, 0);
    root.add(hatchRing);

    // Circular center blast door
    const hatchDoor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 0.12, 24),
        matNeosteelOchre
    );
    hatchDoor.position.set(0, 0.18, 0);
    root.add(hatchDoor);

    // Heavy cast-iron 3-spoke locking wheel
    const wheelRim = new THREE.Mesh(
        new THREE.TorusGeometry(0.24, 0.035, 8, 20),
        matChrome
    );
    wheelRim.rotation.x = Math.PI / 2;
    wheelRim.position.set(0, 0.32, 0);
    root.add(wheelRim);

    for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2;
        const spoke = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 0.24, 8),
            matChrome
        );
        spoke.rotation.z = Math.PI / 2;
        spoke.rotation.y = angle;
        spoke.position.set(Math.cos(angle) * 0.12, 0.32, Math.sin(angle) * 0.12);
        root.add(spoke);
    }

    // Heavy hinge brackets on west side with flashing amber status beacon
    const hinge = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.16, 0.25),
        matNeosteelHull
    );
    hinge.position.set(-0.62, 0.18, 0);
    root.add(hinge);

    const hatchBeacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.08, 12),
        matStimAmber
    );
    hatchBeacon.position.set(-0.62, 0.28, 0);
    root.add(hatchBeacon);

    return root;
}

// =========================================================================
// 8. terran-bunker-smoke-scrubber.glb (ID 151)
// Cordite gun smoke extraction & CBRN filtration scrubber column
// =========================================================================
function buildBunkerSmokeScrubber() {
    const root = new THREE.Group();

    // Heavy bolted octagonal base
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.52, 0.3, 8),
        matNeosteelHull
    );
    base.position.set(0, 0.15, 0);
    root.add(base);

    // Lower centrifugal intake fan drum
    const fanHousing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 0.55, 16),
        matNeosteelOchre
    );
    fanHousing.position.set(0, 0.55, 0);
    root.add(fanHousing);

    // Wire mesh intake grilles around drum
    for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        const grille = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 0.35, 0.05),
            matNeosteelTrim
        );
        grille.position.set(Math.cos(angle) * 0.4, 0.55, Math.sin(angle) * 0.4);
        grille.rotation.y = angle;
        root.add(grille);
    }

    // Central transparent electrostatic ionization chamber
    const ionTube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 1.2, 20),
        new THREE.MeshStandardMaterial({
            color: 0x88ddff,
            roughness: 0.1,
            metalness: 0.1,
            transparent: true,
            opacity: 0.4,
        })
    );
    ionTube.position.set(0, 1.45, 0);
    root.add(ionTube);

    // Glowing cyan ionization core inside
    const ionCore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 1.1, 16),
        matPlasmaCyan
    );
    ionCore.position.set(0, 1.45, 0);
    root.add(ionCore);

    // 4 Vertical copper electrostatic filter rails
    for (let r = 0; r < 4; r++) {
        const rAngle = (r / 4) * Math.PI * 2 + Math.PI / 4;
        const rail = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 1.3, 8),
            matNeosteelTrim
        );
        rail.position.set(Math.cos(rAngle) * 0.36, 1.45, Math.sin(rAngle) * 0.36);
        root.add(rail);
    }

    // Top exhaust manifold & discharge duct
    const topManifold = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.32, 0.4, 8),
        matNeosteelHull
    );
    topManifold.position.set(0, 2.25, 0);
    root.add(topManifold);

    // Lateral exhaust duct tube
    const duct = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.45, 12),
        matNeosteelTrim
    );
    duct.rotation.z = Math.PI / 2;
    duct.position.set(0.35, 2.25, 0);
    root.add(duct);

    // Differential pressure gauge on front
    const gauge = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12),
        matChrome
    );
    gauge.rotation.x = Math.PI / 2;
    gauge.position.set(0, 1.9, 0.34);
    root.add(gauge);

    const gaugeFace = new THREE.Mesh(
        new THREE.CircleGeometry(0.048, 12),
        matRadarGreen
    );
    gaugeFace.position.set(0, 1.9, 0.365);
    root.add(gaugeFace);

    return root;
}

// =========================================================================
// Main Export Routine
// =========================================================================
async function main() {
    console.log('Generating 8 StarCraft 1 Terran Bunker 3D PBR GLB Assets...');

    await exportGLB(buildBunkerRoofDome(), 'terran-bunker-roof-dome.glb');
    await exportGLB(buildBunkerAmmoTower(), 'terran-bunker-ammo-tower.glb');
    await exportGLB(buildBunkerGunStation(), 'terran-bunker-gun-station.glb');
    await exportGLB(buildBunkerFiringSlit(), 'terran-bunker-firing-slit.glb');
    await exportGLB(buildBunkerPeriscopeConsole(), 'terran-bunker-periscope-console.glb');
    await exportGLB(buildBunkerStimStation(), 'terran-bunker-stim-station.glb');
    await exportGLB(buildBunkerEscapeHatch(), 'terran-bunker-escape-hatch.glb');
    await exportGLB(buildBunkerSmokeScrubber(), 'terran-bunker-smoke-scrubber.glb');

    console.log('All 8 Terran Bunker Assets Successfully Generated!');
}

main().catch((err) => {
    console.error('Bunker Asset Generation Error:', err);
    process.exit(1);
});
