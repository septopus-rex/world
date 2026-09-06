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
                console.log(`[OK] Saved SC1 GLB: ${filename} (${fs.statSync(outPath).size} bytes)`);
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
// StarCraft 1 (1998 / Remastered) Canonical Terran Color Palette
// =========================================================================
const matSC1OchreArmor = new THREE.MeshStandardMaterial({
    color: 0xb87333, // Weathered ochre/bronze secondary armor
    roughness: 0.45,
    metalness: 0.70,
});

const matSC1GoldCupola = new THREE.MeshStandardMaterial({
    color: 0xd49b28, // SC1 Command bridge golden-yellow armor
    roughness: 0.38,
    metalness: 0.65,
});

const matSC1DarkHull = new THREE.MeshStandardMaterial({
    color: 0x272e38, // Dark slate battleship hull steel
    roughness: 0.52,
    metalness: 0.80,
});

const matSC1SilverEngine = new THREE.MeshStandardMaterial({
    color: 0x8fa0b0, // Silvery mechanical housing, lips & cylinders
    roughness: 0.32,
    metalness: 0.85,
});

const matSC1ChromeRadome = new THREE.MeshStandardMaterial({
    color: 0xdde5ed, // Polished chrome radar dome & piston rods
    roughness: 0.12,
    metalness: 0.95,
});

const matSC1NeonBlue = new THREE.MeshStandardMaterial({
    color: 0x00e5ff, // SC1 electric cyan observation slits & plasma
    emissive: 0x0099cc,
    emissiveIntensity: 1.6,
    roughness: 0.18,
    metalness: 0.10,
});

const matSC1TeamRed = new THREE.MeshStandardMaterial({
    color: 0xd32f2f, // SC1 Team Red marking plates
    roughness: 0.40,
    metalness: 0.30,
});

const matSC1HazardYellow = new THREE.MeshStandardMaterial({
    color: 0xdda700, // Warning chevron yellow
    roughness: 0.40,
    metalness: 0.20,
});

const matSC1HazardBlack = new THREE.MeshStandardMaterial({
    color: 0x1a1e24, // Warning chevron black
    roughness: 0.60,
    metalness: 0.40,
});

const matSC1Vespene = new THREE.MeshStandardMaterial({
    color: 0x22c55e, // Glowing pressurized Vespene gas
    emissive: 0x15803d,
    emissiveIntensity: 1.2,
    roughness: 0.20,
    metalness: 0.10,
});

const matSC1Mineral = new THREE.MeshStandardMaterial({
    color: 0x0ea5e9, // Glowing blue raw mineral crystal
    emissive: 0x0369a1,
    emissiveIntensity: 1.0,
    roughness: 0.15,
    metalness: 0.20,
});

// =========================================================================
// 1. SC1 Command Tower Cupola & Central Armored Saucer Hub (ID 120: terran-holo-table.glb)
//    Features the authentic octagonal saucer dome base, the golden cupola with
//    wrap-around blue observation louvers, silver radome bubble, and antenna.
//    Base rests at Y = 0.
// =========================================================================
function buildSC1CommandTower() {
    const group = new THREE.Group();

    // 1. Octagonal Armored Saucer Base (Sloped hull deck transitioning from roof)
    const saucerBaseGeom = new THREE.CylinderGeometry(2.8, 3.8, 0.45, 8);
    const saucerBase = new THREE.Mesh(saucerBaseGeom, matSC1DarkHull);
    saucerBase.position.y = 0.22;
    group.add(saucerBase);

    // Weathered bronze/ochre perimeter armor plates on the saucer base
    for (let i = 0; i < 8; i++) {
        const angle = (i * 2 * Math.PI) / 8;
        const plateGeom = new THREE.BoxGeometry(1.8, 0.35, 0.12);
        plateGeom.rotateX(0.25);
        const plate = new THREE.Mesh(plateGeom, matSC1OchreArmor);
        plate.position.set(Math.cos(angle) * 3.1, 0.28, Math.sin(angle) * 3.1);
        plate.rotation.y = -angle + Math.PI / 2;
        group.add(plate);

        // Team Red Accent Decals on 4 cardinal plates
        if (i % 2 === 0) {
            const redDecal = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.16, 0.14), matSC1TeamRed);
            redDecal.rotateX(0.25);
            redDecal.position.set(Math.cos(angle) * 3.12, 0.28, Math.sin(angle) * 3.12);
            redDecal.rotation.y = -angle + Math.PI / 2;
            group.add(redDecal);
        }
    }

    // 2. Beveled Lower Golden Cupola Skirt
    const goldSkirtGeom = new THREE.CylinderGeometry(2.1, 2.6, 0.45, 8);
    const goldSkirt = new THREE.Mesh(goldSkirtGeom, matSC1GoldCupola);
    goldSkirt.position.y = 0.65;
    group.add(goldSkirt);

    // 3. Main Golden Octagonal Command Bridge Superstructure
    const bridgeGeom = new THREE.CylinderGeometry(2.0, 2.1, 0.65, 8);
    const bridge = new THREE.Mesh(bridgeGeom, matSC1GoldCupola);
    bridge.position.y = 1.18;
    group.add(bridge);

    // 4. Cantilevered Observation Gallery Overhang
    const galleryGeom = new THREE.CylinderGeometry(2.25, 2.0, 0.35, 8);
    const gallery = new THREE.Mesh(galleryGeom, matSC1GoldCupola);
    gallery.position.y = 1.62;
    group.add(gallery);

    // 5. Wrap-around Horizontal Observation Window Band (Glowing Cyan Blue)
    const slitBandGeom = new THREE.CylinderGeometry(2.26, 2.26, 0.28, 16);
    const slitBand = new THREE.Mesh(slitBandGeom, matSC1NeonBlue);
    slitBand.position.y = 1.76;
    group.add(slitBand);

    // 16 Vertical Mullion Louver Grates on the observation band
    for (let i = 0; i < 16; i++) {
        const angle = (i * 2 * Math.PI) / 16;
        const louverGeom = new THREE.BoxGeometry(0.09, 0.34, 0.12);
        const louver = new THREE.Mesh(louverGeom, matSC1DarkHull);
        louver.position.set(Math.cos(angle) * 2.27, 1.76, Math.sin(angle) * 2.27);
        louver.rotation.y = -angle;
        group.add(louver);
    }

    // 6. Upper Cupola Roof Lip & Eave
    const roofLipGeom = new THREE.CylinderGeometry(1.95, 2.28, 0.22, 8);
    const roofLip = new THREE.Mesh(roofLipGeom, matSC1GoldCupola);
    roofLip.position.y = 2.02;
    group.add(roofLip);

    // 7. Polished Chrome Hemispherical Radar Dome (Radome Bubble)
    const domeGeom = new THREE.SphereGeometry(0.85, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeom, matSC1ChromeRadome);
    dome.position.y = 2.12;
    group.add(dome);

    // Radar dome base silver collar ring
    const domeRingGeom = new THREE.TorusGeometry(0.85, 0.08, 8, 24);
    domeRingGeom.rotateX(Math.PI / 2);
    const domeRing = new THREE.Mesh(domeRingGeom, matSC1SilverEngine);
    domeRing.position.y = 2.12;
    group.add(domeRing);

    // 8. Communication & Sensor Antenna Mast beside the dome
    const mastGeom = new THREE.CylinderGeometry(0.06, 0.08, 0.95, 8);
    const mast = new THREE.Mesh(mastGeom, matSC1SilverEngine);
    mast.position.set(1.0, 2.55, -0.3);
    group.add(mast);

    const mastTipGeom = new THREE.SphereGeometry(0.1, 8, 8);
    const mastTip = new THREE.Mesh(mastTipGeom, matSC1NeonBlue);
    mastTip.position.set(1.0, 3.05, -0.3);
    group.add(mastTip);

    return group;
}

// =========================================================================
// 2. SC1 Twin Rocket Exhaust Engine Silos (ID 121: terran-radar-dish.glb)
//    Massive vertical cylinders, silver turbine lips, radiator block, steam pipes.
//    Base rests at Y = 0.
// =========================================================================
function buildSC1EngineSilos() {
    const group = new THREE.Group();

    // Central Silver Mechanical Power Block Box
    const boxGeom = new THREE.BoxGeometry(2.4, 1.5, 1.8);
    const box = new THREE.Mesh(boxGeom, matSC1SilverEngine);
    box.position.set(0, 0.75, 0);
    group.add(box);

    // Top Ribbed Radiator / Heat Cooling Fins
    for (let x = -1.0; x <= 1.0; x += 0.25) {
        const finGeom = new THREE.BoxGeometry(0.06, 0.4, 1.6);
        const fin = new THREE.Mesh(finGeom, matSC1DarkHull);
        fin.position.set(x, 1.7, 0);
        group.add(fin);
    }

    // Cylindrical Coolant Sub-Tanks on Power Block Flanks
    for (let x of [-1.35, 1.35]) {
        const subTankGeom = new THREE.CylinderGeometry(0.32, 0.32, 1.4, 12);
        const subTank = new THREE.Mesh(subTankGeom, matSC1DarkHull);
        subTank.position.set(x, 0.7, 0);
        group.add(subTank);

        const subCapGeom = new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const subCap = new THREE.Mesh(subCapGeom, matSC1SilverEngine);
        subCap.position.set(x, 1.4, 0);
        group.add(subCap);
    }

    // Twin Massive Vertical Rocket Exhaust Cylinders (Left & Right)
    for (let x of [-1.85, 1.85]) {
        // Flared conical rocket base
        const siloBaseGeom = new THREE.CylinderGeometry(0.95, 1.25, 1.0, 16);
        const siloBase = new THREE.Mesh(siloBaseGeom, matSC1DarkHull);
        siloBase.position.set(x, 0.5, -0.45);
        group.add(siloBase);

        // Main cylindrical exhaust barrel
        const barrelGeom = new THREE.CylinderGeometry(0.9, 0.95, 1.5, 16);
        const barrel = new THREE.Mesh(barrelGeom, matSC1DarkHull);
        barrel.position.set(x, 1.75, -0.45);
        group.add(barrel);

        // Top Exhaust Nozzle Lip Ring (Polished silver steel)
        const lipGeom = new THREE.TorusGeometry(0.9, 0.14, 10, 24);
        lipGeom.rotateX(Math.PI / 2);
        const lip = new THREE.Mesh(lipGeom, matSC1SilverEngine);
        lip.position.set(x, 2.5, -0.45);
        group.add(lip);

        // Inner glowing thermal plasma combustion core
        const coreGeom = new THREE.CylinderGeometry(0.72, 0.72, 0.12, 16);
        const core = new THREE.Mesh(coreGeom, matSC1NeonBlue);
        core.position.set(x, 2.15, -0.45);
        group.add(core);

        // Connecting Heavy Steam/Exhaust Pipes to Central Block
        const pipeGeom = new THREE.CylinderGeometry(0.16, 0.16, 1.1, 8);
        pipeGeom.rotateZ(x > 0 ? 0.65 : -0.65);
        const pipe = new THREE.Mesh(pipeGeom, matSC1SilverEngine);
        pipe.position.set(x > 0 ? 1.15 : -1.15, 1.4, -0.2);
        group.add(pipe);

        // Red Team Marking Bands on barrels
        const bandGeom = new THREE.CylinderGeometry(0.92, 0.92, 0.3, 16);
        const band = new THREE.Mesh(bandGeom, matSC1TeamRed);
        band.position.set(x, 1.25, -0.45);
        group.add(band);
    }

    return group;
}

// =========================================================================
// 3. SC1 Hydraulic Outrigger Landing Foot (ID 122: terran-thruster-pod.glb)
//    Flared conical thruster bell, chrome hydraulic piston, 8 clawed footpad.
//    Base rests at Y = 0.
// =========================================================================
function buildSC1LandingFoot() {
    const group = new THREE.Group();

    // Cantilevered Outrigger Arm connecting to hull corner
    const armGeom = new THREE.BoxGeometry(0.9, 0.5, 1.5);
    armGeom.rotateX(-0.35);
    const arm = new THREE.Mesh(armGeom, matSC1DarkHull);
    arm.position.set(0, 1.95, 0.35);
    group.add(arm);

    // Outrigger Armor Cap
    const capGeom = new THREE.BoxGeometry(0.94, 0.14, 1.3);
    capGeom.rotateX(-0.35);
    const cap = new THREE.Mesh(capGeom, matSC1OchreArmor);
    cap.position.set(0, 2.22, 0.35);
    group.add(cap);

    // Main Hydraulic Housing Cylinder
    const cylGeom = new THREE.CylinderGeometry(0.26, 0.28, 1.4, 12);
    const cyl = new THREE.Mesh(cylGeom, matSC1DarkHull);
    cyl.position.set(0, 1.45, 0.85);
    group.add(cyl);

    // Gleaming Chrome Hydraulic Piston Rod
    const rodGeom = new THREE.CylinderGeometry(0.16, 0.16, 1.1, 12);
    const rod = new THREE.Mesh(rodGeom, matSC1ChromeRadome);
    rod.position.set(0, 0.82, 0.85);
    group.add(rod);

    // Articulated Ball Joint Socket
    const jointGeom = new THREE.SphereGeometry(0.28, 12, 12);
    const joint = new THREE.Mesh(jointGeom, matSC1SilverEngine);
    joint.position.set(0, 0.48, 0.85);
    group.add(joint);

    // SC1 Iconic Conical Thruster Bell
    const bellGeom = new THREE.CylinderGeometry(0.38, 1.05, 0.42, 16);
    const bell = new THREE.Mesh(bellGeom, matSC1DarkHull);
    bell.position.set(0, 0.26, 0.85);
    group.add(bell);

    // Bronze Bell Collar Ring
    const bellRingGeom = new THREE.TorusGeometry(1.05, 0.08, 8, 20);
    bellRingGeom.rotateX(Math.PI / 2);
    const bellRing = new THREE.Mesh(bellRingGeom, matSC1OchreArmor);
    bellRing.position.set(0, 0.08, 0.85);
    group.add(bellRing);

    // Flared Circular Footpad Base (Ground contact at Y = 0)
    const padGeom = new THREE.CylinderGeometry(1.05, 1.15, 0.08, 16);
    const pad = new THREE.Mesh(padGeom, matSC1DarkHull);
    pad.position.set(0, 0.04, 0.85);
    group.add(pad);

    // 8 Radial Claws / Traction Teeth gripping the terrain
    for (let i = 0; i < 8; i++) {
        const angle = (i * 2 * Math.PI) / 8;
        const clawGeom = new THREE.BoxGeometry(0.18, 0.15, 0.38);
        const claw = new THREE.Mesh(clawGeom, matSC1SilverEngine);
        claw.position.set(Math.cos(angle) * 1.1, 0.08, 0.85 + Math.sin(angle) * 1.1);
        claw.rotation.y = -angle;
        group.add(claw);
    }

    return group;
}

// =========================================================================
// 4. SC1 Front Entry Conveyor Deployment Ramp (ID 123: terran-vespene-tank.glb)
//    Gateway portal, wide corrugated metal ramp sloping to ground, hazard rails.
//    Base rests at Y = 0.
// =========================================================================
function buildSC1EntryRamp() {
    const group = new THREE.Group();

    // Portal Gateway Frame
    const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.7, 0.6), matSC1DarkHull);
    frameL.position.set(-1.6, 1.35, 0);
    group.add(frameL);

    const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.7, 0.6), matSC1DarkHull);
    frameR.position.set(1.6, 1.35, 0);
    group.add(frameR);

    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 0.65), matSC1GoldCupola);
    frameTop.position.set(0, 2.55, 0);
    group.add(frameTop);

    // Team Red Header Plate with Warning Beacon
    const headerDecal = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.68), matSC1TeamRed);
    headerDecal.position.set(0, 2.55, 0.02);
    group.add(headerDecal);

    // Dual Vertical Ribbed Blast Doors (Recessed)
    const doorL = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.3, 0.15), matSC1OchreArmor);
    doorL.position.set(-0.7, 1.2, -0.05);
    group.add(doorL);

    const doorR = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.3, 0.15), matSC1OchreArmor);
    doorR.position.set(0.7, 1.2, -0.05);
    group.add(doorR);

    // Sloped Metal Deployment Ramp (Angles down from doorway Y=0.5m to ground Y=0.0m)
    const rampLen = 3.8;
    const rampAngle = 0.28; // ~16 degree gentle slope
    const rampGeom = new THREE.BoxGeometry(2.8, 0.2, rampLen);
    rampGeom.rotateX(rampAngle);
    const ramp = new THREE.Mesh(rampGeom, matSC1DarkHull);
    ramp.position.set(0, 0.48, 1.8);
    group.add(ramp);

    // Corrugated Grating Treads on Ramp
    for (let z = 0.3; z <= 3.5; z += 0.28) {
        const treadY = 0.48 - (z - 1.8) * Math.sin(rampAngle);
        const treadGeom = new THREE.BoxGeometry(2.6, 0.05, 0.10);
        treadGeom.rotateX(rampAngle);
        const tread = new THREE.Mesh(treadGeom, matSC1SilverEngine);
        tread.position.set(0, treadY + 0.11, z);
        group.add(tread);
    }

    // Yellow & Black Hazard Side Guardrails
    for (let side of [-1.48, 1.48]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.5, rampLen), matSC1HazardYellow);
        rail.rotateX(rampAngle);
        rail.position.set(side, 0.75, 1.8);
        group.add(rail);

        // Hazard chevron stripes on top of rail
        for (let cz = 0.5; cz <= 3.3; cz += 0.55) {
            const chy = 0.75 - (cz - 1.8) * Math.sin(rampAngle);
            const chev = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.51, 0.22), matSC1HazardBlack);
            chev.rotateX(rampAngle);
            chev.position.set(side, chy, cz);
            group.add(chev);
        }
    }

    return group;
}

// =========================================================================
// 5. SC1 Addon Docking Scaffold (ID 124: terran-mineral-crate.glb)
//    Right-flank pivot collar, cantilevered brass docking truss & guide rails.
//    Base rests at Y = 0.
// =========================================================================
function buildSC1AddonScaffold() {
    const group = new THREE.Group();

    // Heavy Mounting Pivot Collar attached to starboard hull
    const collarGeom = new THREE.CylinderGeometry(0.5, 0.5, 1.5, 8);
    collarGeom.rotateZ(Math.PI / 2);
    const collar = new THREE.Mesh(collarGeom, matSC1DarkHull);
    collar.position.set(0.4, 0.85, 0);
    group.add(collar);

    // Cantilevered Gold/Brass Truss Frame Extending Outward
    const trussBeam1 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.28, 0.35), matSC1OchreArmor);
    trussBeam1.position.set(2.0, 0.4, -1.0);
    group.add(trussBeam1);

    const trussBeam2 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.28, 0.35), matSC1OchreArmor);
    trussBeam2.position.set(2.0, 0.4, 1.0);
    group.add(trussBeam2);

    // Cross Braces (Ladder Truss Pattern)
    for (let x = 0.8; x <= 3.4; x += 0.55) {
        const cross = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 2.3), matSC1SilverEngine);
        cross.position.set(x, 0.4, 0);
        group.add(cross);
    }

    // Outer Docking Guide Rails (where ComSat / Silo attaches)
    const railGeom = new THREE.BoxGeometry(0.18, 0.4, 2.6);
    const railOuter = new THREE.Mesh(railGeom, matSC1HazardYellow);
    railOuter.position.set(3.6, 0.5, 0);
    group.add(railOuter);

    // Hydraulic Clamping Dogs
    for (let z of [-0.8, 0.8]) {
        const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.3), matSC1DarkHull);
        clamp.position.set(3.6, 0.8, z);
        group.add(clamp);
    }

    return group;
}

// =========================================================================
// 6. SC1 Marine Armory Gauss Rifle Rack (ID 125: terran-armory-rack.glb)
//    Magnetic wall rack holding 4 C-14 Impaler Gauss Rifles, ammo lockers.
//    Base rests at Y = 0.
// =========================================================================
function buildSC1ArmoryRack() {
    const group = new THREE.Group();

    // Steel Backing Wall Plate
    const backPlate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.0, 0.08), matSC1DarkHull);
    backPlate.position.set(0, 1.2, 0);
    group.add(backPlate);

    // Top Stencil Header Plate
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, 0.12), matSC1TeamRed);
    topBar.position.set(0, 2.1, 0.02);
    group.add(topBar);

    // Magnetic Weapon Locking Rail
    const magRail = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.14, 0.18), matSC1SilverEngine);
    magRail.position.set(0, 1.45, 0.1);
    group.add(magRail);

    // 4 C-14 Impaler Gauss Rifles
    [-0.75, -0.25, 0.25, 0.75].forEach((x) => {
        const rifle = new THREE.Group();

        // Main Receiver Body
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.14), matSC1DarkHull);
        receiver.position.set(0, 0.35, 0);
        rifle.add(receiver);

        // Heavy Barrel Shroud
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.75, 8), matSC1SilverEngine);
        barrel.position.set(0, 0.82, 0);
        rifle.add(barrel);

        // Muzzle Brake / Flash Hider
        const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.12, 8), matSC1DarkHull);
        muzzle.position.set(0, 1.24, 0);
        rifle.add(muzzle);

        // Tactical Carrying Handle (Red SC1 Style)
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.08), matSC1TeamRed);
        handle.position.set(0, 0.65, 0.08);
        rifle.add(handle);

        // Dual Drum Magazine
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 12), matSC1DarkHull);
        drum.rotateZ(Math.PI / 2);
        drum.position.set(0, 0.28, -0.06);
        rifle.add(drum);

        rifle.position.set(x, 0.9, 0.18);
        group.add(rifle);
    });

    // Ammunition Crates Stacked at Base (Y = 0 to 0.45)
    for (let x of [-0.65, 0.65]) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.45, 0.55), matSC1OchreArmor);
        crate.position.set(x, 0.23, 0.3);
        group.add(crate);

        // Yellow warning stripe on crate
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.08, 0.56), matSC1HazardYellow);
        stripe.position.set(x, 0.23, 0.3);
        group.add(stripe);
    }

    return group;
}

// =========================================================================
// 7. SC1 CRT Command Terminal & Operator Station (ID 126: terran-computer-console.glb)
//    Angled console desk, dual CRT monitors (green/amber phosphor), swivel bucket seat.
//    Base rests at Y = 0.
// =========================================================================
function buildSC1HoloConsole() {
    const group = new THREE.Group();

    // Heavy Industrial Console Desk
    const deskBase = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.85, 1.0), matSC1DarkHull);
    deskBase.position.set(0, 0.42, 0);
    group.add(deskBase);

    // Angled Keyboard / Switchboard Deck
    const deckGeom = new THREE.BoxGeometry(2.4, 0.1, 0.65);
    deckGeom.rotateX(-0.25);
    const deck = new THREE.Mesh(deckGeom, matSC1SilverEngine);
    deck.position.set(0, 0.88, 0.2);
    group.add(deck);

    // Dual CRT Monitor Housings (Left & Right)
    for (let x of [-0.65, 0.65]) {
        const crtCase = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.75, 0.6), matSC1DarkHull);
        crtCase.position.set(x, 1.35, -0.1);
        crtCase.rotation.y = x > 0 ? -0.15 : 0.15;
        group.add(crtCase);

        // Beveled Monitor Bezel
        const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.62, 0.05), matSC1OchreArmor);
        bezel.position.set(x, 1.35, 0.21);
        bezel.rotation.y = x > 0 ? -0.15 : 0.15;
        group.add(bezel);

        // Glowing Phosphor Screen (Green Tactical Radar sweep / Amber Telemetry)
        const screenMat = new THREE.MeshStandardMaterial({
            color: x < 0 ? 0x22c55e : 0xf59e0b,
            emissive: x < 0 ? 0x16a34a : 0xd97706,
            emissiveIntensity: 1.4,
            roughness: 0.15,
            metalness: 0.10,
        });
        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.52, 0.02), screenMat);
        screen.position.set(x, 1.35, 0.24);
        screen.rotation.y = x > 0 ? -0.15 : 0.15;
        group.add(screen);
    }

    // Ergonomic Swivel Operator Bucket Seat
    const chairBase = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.45, 8), matSC1SilverEngine);
    chairBase.position.set(0, 0.22, 0.85);
    group.add(chairBase);

    const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.55), matSC1DarkHull);
    chairSeat.position.set(0, 0.48, 0.85);
    group.add(chairSeat);

    const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.65, 0.12), matSC1DarkHull);
    chairBack.position.set(0, 0.82, 1.10);
    group.add(chairBack);

    // Blue Headrest Trim
    const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.14), matSC1NeonBlue);
    headrest.position.set(0, 1.18, 1.10);
    group.add(headrest);

    return group;
}

// =========================================================================
// 8. SC1 Vespene Canisters & Raw Mineral Supply Crates (ID 127: terran-exhaust-turbine.glb)
//    Twin pressurized green canisters, cargo crate with raw blue crystals.
//    Base rests at Y = 0.
// =========================================================================
function buildSC1VespeneCanisters() {
    const group = new THREE.Group();

    // Heavy Steel Pallet Skid
    const skid = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 1.6), matSC1DarkHull);
    skid.position.y = 0.07;
    group.add(skid);

    // Twin Cylindrical Green Glowing Vespene Gas Tanks
    for (let x of [-0.42, 0.42]) {
        // Main Tank Body
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.3, 16), matSC1DarkHull);
        tank.position.set(x, 0.78, -0.3);
        group.add(tank);

        // Domed Tank Top
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), matSC1SilverEngine);
        dome.position.set(x, 1.43, -0.3);
        group.add(dome);

        // Glowing Green Vespene Indicator Band
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.45, 16), matSC1Vespene);
        band.position.set(x, 0.78, -0.3);
        group.add(band);

        // Pressure Relief Valve & Gauge on top
        const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 8), matSC1OchreArmor);
        valve.position.set(x, 1.82, -0.3);
        group.add(valve);
    }

    // Open Mineral Crate at Front of Pallet
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 0.75), matSC1OchreArmor);
    crate.position.set(0, 0.35, 0.45);
    group.add(crate);

    // Hazard Border on Crate
    const crateBorder = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.08, 0.77), matSC1HazardYellow);
    crateBorder.position.set(0, 0.55, 0.45);
    group.add(crateBorder);

    // 5 Raw Glowing Blue Mineral Crystal Shards (StarCraft Minerals!)
    [-0.45, -0.22, 0.0, 0.22, 0.45].forEach((cx, idx) => {
        const crystalGeom = new THREE.OctahedronGeometry(0.22 + (idx % 2) * 0.06, 0);
        const crystal = new THREE.Mesh(crystalGeom, matSC1Mineral);
        crystal.position.set(cx, 0.65, 0.45);
        crystal.rotation.set(0.35 * idx, 0.4 * idx, -0.25 + 0.1 * idx);
        group.add(crystal);
    });

    return group;
}

// =========================================================================
// Main Export Routine
// =========================================================================
async function main() {
    console.log('=== Generating StarCraft 1 Classic Terran GLB Assets ===');

    const assets = [
        { fn: 'terran-holo-table.glb', builder: buildSC1CommandTower },     // ID 120: SC1 Golden Command Tower Cupola
        { fn: 'terran-radar-dish.glb', builder: buildSC1EngineSilos },      // ID 121: SC1 Twin Massive Rocket Silos
        { fn: 'terran-thruster-pod.glb', builder: buildSC1LandingFoot },    // ID 122: SC1 Flared Hydraulic Landing Foot
        { fn: 'terran-vespene-tank.glb', builder: buildSC1EntryRamp },      // ID 123: SC1 Front Entry Conveyor Deployment Ramp
        { fn: 'terran-mineral-crate.glb', builder: buildSC1AddonScaffold }, // ID 124: SC1 Right Addon Docking Scaffold
        { fn: 'terran-armory-rack.glb', builder: buildSC1ArmoryRack },      // ID 125: SC1 Marine Armory Gauss Rifle Rack
        { fn: 'terran-computer-console.glb', builder: buildSC1HoloConsole },// ID 126: SC1 CRT Command Terminal
        { fn: 'terran-exhaust-turbine.glb', builder: buildSC1VespeneCanisters }, // ID 127: SC1 Vespene & Mineral Supply
    ];

    for (const item of assets) {
        const scene = new THREE.Scene();
        const meshGroup = item.builder();
        scene.add(meshGroup);
        await exportGLB(scene, item.fn);
    }

    console.log('=== All 8 StarCraft 1 Classic Terran GLBs successfully generated! ===');
}

main().catch((err) => {
    console.error('Fatal error generating SC1 Terran assets:', err);
    process.exit(1);
});
