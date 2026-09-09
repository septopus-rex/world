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
// StarCraft 1 Terran Bunker Material Palette (100% Authentic SC1 Colors)
// =========================================================================
const matNeosteelHull = new THREE.MeshStandardMaterial({
    color: 0x242c38, // Deep slate bunker armor
    roughness: 0.55,
    metalness: 0.30,
});

const matBrushedSteel = new THREE.MeshStandardMaterial({
    color: 0xa6b6c8, // Authentic SC1 radiant silver-white titanium dome
    roughness: 0.30,
    metalness: 0.58,
    side: THREE.DoubleSide,
});

const matBrushedSteelHighlight = new THREE.MeshStandardMaterial({
    color: 0xc4d4e6, // Brighter highlight trim on embrasures and panel rims
    roughness: 0.24,
    metalness: 0.65,
    side: THREE.DoubleSide,
});

const matDarkGunmetal = new THREE.MeshStandardMaterial({
    color: 0x1f252f, // Deep military slate-gunmetal armor plates
    roughness: 0.55,
    metalness: 0.40,
});

const matCorrugatedArmor = new THREE.MeshStandardMaterial({
    color: 0x5a6e88, // Authentic SC1 metallic slate-blue corrugated blast ramp plates
    roughness: 0.36,
    metalness: 0.40,
    side: THREE.DoubleSide,
});

const matTerranRedGlow = new THREE.MeshStandardMaterial({
    color: 0xff1628, // Iconic SC1 player red glowing accents
    emissive: 0xff1e28,
    emissiveIntensity: 3.8,
    roughness: 0.15,
    metalness: 0.10,
    side: THREE.DoubleSide,
});

const matTerranRedPaint = new THREE.MeshStandardMaterial({
    color: 0xc81824, // Heavy painted red hydraulic steel
    roughness: 0.36,
    metalness: 0.45,
});

const matBeaconGreen = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x10b981,
    emissiveIntensity: 3.0,
    roughness: 0.20,
    metalness: 0.20,
});

const matDomeEmbrasureDark = new THREE.MeshStandardMaterial({
    color: 0x07090e, // Pitch black recessed firing slit void
    roughness: 0.95,
    metalness: 0.05,
});

const matNeosteelOchre = new THREE.MeshStandardMaterial({
    color: 0x303744, // Refined gunmetal frame & cornice
    roughness: 0.45,
    metalness: 0.35,
});

const matNeosteelTrim = new THREE.MeshStandardMaterial({
    color: 0x687c98, // Lighter steel-blue corrugation rib highlights
    roughness: 0.38,
    metalness: 0.35,
});

const matChrome = new THREE.MeshStandardMaterial({
    color: 0xdedede,
    roughness: 0.20,
    metalness: 0.70,
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
// High-profile curved spherical titanium saucer dome with 8 recessed dark
// embrasures, 4 heavy red hydraulic locking clamps, and top circular 8-radial
// glowing crimson red energy radiator crown. 100% faithful to SC1 sprite!
// =========================================================================
function buildBunkerRoofDome() {
    const root = new THREE.Group();

    // 1. Base Octagonal Collar Ring (Dark Gunmetal)
    const baseCollarGeo = new THREE.CylinderGeometry(3.32, 3.42, 0.14, 8);
    baseCollarGeo.rotateY(Math.PI / 8);
    const baseCollar = new THREE.Mesh(baseCollarGeo, matDarkGunmetal);
    baseCollar.position.set(0, 0.07, 0);
    root.add(baseCollar);

    // 2. Brushed Titanium Armored Saucer Dome (Smooth Lathe Profile, 64 segments)
    // Ordered strictly from bottom to top so surface normals point outward!
    const points = [
        new THREE.Vector2(3.38, 0.06), // Base outer rim
        new THREE.Vector2(3.28, 0.28), // Lower curve
        new THREE.Vector2(3.08, 0.65), // Embrasure/clamp mid level
        new THREE.Vector2(2.72, 1.05), // Upper mid curve
        new THREE.Vector2(2.25, 1.40), // Shoulder curve
        new THREE.Vector2(1.78, 1.62), // Crown curve
        new THREE.Vector2(1.45, 1.74), // Top rim under energy hub
    ];
    const domeGeo = new THREE.LatheGeometry(points, 64);
    domeGeo.computeVertexNormals();
    const domeMesh = new THREE.Mesh(domeGeo, matBrushedSteel);
    root.add(domeMesh);

    // 3. 4 Large Firing Embrasures at the 4 Cardinal Sides (above the blast ramps)
    // Angles: 0 (South), Math.PI/2 (East), Math.PI (North), -Math.PI/2 (West)
    const cardinalAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    cardinalAngles.forEach((angle) => {
        const embrasureRoot = new THREE.Group();
        embrasureRoot.rotation.y = angle;

        // Recessed trapezoidal housing (dark gunmetal interior)
        const housing = new THREE.Mesh(
            new THREE.BoxGeometry(1.12, 0.56, 0.28),
            matDarkGunmetal
        );
        housing.rotation.x = -0.42;
        housing.position.set(0, 0.76, 2.86);
        embrasureRoot.add(housing);

        // Dark slit aperture (deep void)
        const slit = new THREE.Mesh(
            new THREE.BoxGeometry(0.92, 0.24, 0.16),
            matDomeEmbrasureDark
        );
        slit.rotation.x = -0.42;
        slit.position.set(0, 0.76, 2.94);
        embrasureRoot.add(slit);

        // Center weapon mount bracket
        const mount = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.28, 0.18),
            matDarkGunmetal
        );
        mount.rotation.x = -0.42;
        mount.position.set(0, 0.76, 2.95);
        embrasureRoot.add(mount);

        // Prominent titanium brow hood / visor above slit (with specular highlight)
        const hood = new THREE.Mesh(
            new THREE.BoxGeometry(1.20, 0.10, 0.24),
            matBrushedSteelHighlight
        );
        hood.rotation.x = -0.42;
        hood.position.set(0, 0.98, 2.74);
        embrasureRoot.add(hood);

        // Titanium sill below slit
        const sill = new THREE.Mesh(
            new THREE.BoxGeometry(1.16, 0.08, 0.22),
            matBrushedSteelHighlight
        );
        sill.rotation.x = -0.42;
        sill.position.set(0, 0.54, 2.94);
        embrasureRoot.add(sill);

        // Left & right titanium side frame jambs
        [-0.54, 0.54].forEach((dx) => {
            const jamb = new THREE.Mesh(
                new THREE.BoxGeometry(0.10, 0.46, 0.22),
                matBrushedSteelHighlight
            );
            jamb.rotation.x = -0.42;
            jamb.position.set(dx, 0.76, 2.86);
            embrasureRoot.add(jamb);
        });

        root.add(embrasureRoot);
    });

    // 4. 4 Corner Clamp Recesses & Bold Red Hydraulic Locking Clamps
    // Angles: 45°, 135°, 225°, 315° (above the 4 corner bastions)
    for (let i = 0; i < 4; i++) {
        const angle = i * (Math.PI / 2) + Math.PI / 4;
        const clampRoot = new THREE.Group();
        clampRoot.rotation.y = angle;

        // Shallow vertical alcove cut into the dome armor
        const alcove = new THREE.Mesh(
            new THREE.BoxGeometry(0.70, 0.80, 0.16),
            matDarkGunmetal
        );
        alcove.rotation.x = -0.40;
        alcove.position.set(0, 0.62, 3.02);
        clampRoot.add(alcove);

        // Titanium side cheek frames of the alcove
        [-0.34, 0.34].forEach((dx) => {
            const cheek = new THREE.Mesh(
                new THREE.BoxGeometry(0.08, 0.74, 0.18),
                matBrushedSteelHighlight
            );
            cheek.rotation.x = -0.40;
            cheek.position.set(dx, 0.62, 3.02);
            clampRoot.add(cheek);
        });

        // Alcove top arch header
        const header = new THREE.Mesh(
            new THREE.BoxGeometry(0.76, 0.08, 0.20),
            matBrushedSteelHighlight
        );
        header.rotation.x = -0.40;
        header.position.set(0, 0.96, 2.86);
        clampRoot.add(header);

        // Bold red clamp base bracket block
        const bracket = new THREE.Mesh(
            new THREE.BoxGeometry(0.44, 0.40, 0.44),
            matTerranRedPaint
        );
        bracket.position.set(0, 0.20, 3.32);
        clampRoot.add(bracket);

        // Chrome hinge pin through bracket
        const pin = new THREE.Mesh(
            new THREE.CylinderGeometry(0.055, 0.055, 0.48, 12),
            matChrome
        );
        pin.rotation.z = Math.PI / 2;
        pin.position.set(0, 0.24, 3.32);
        clampRoot.add(pin);

        // Chrome hex bolts on bracket top
        [-0.14, 0.14].forEach((bx) => {
            const bolt = new THREE.Mesh(
                new THREE.CylinderGeometry(0.04, 0.04, 0.06, 6),
                matChrome
            );
            bolt.position.set(bx, 0.41, 3.32);
            clampRoot.add(bolt);
        });

        // Bold red hydraulic lever arm rising into the alcove
        const arm = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 0.62, 0.24),
            matTerranRedPaint
        );
        arm.rotation.x = -0.42;
        arm.position.set(0, 0.56, 3.08);
        clampRoot.add(arm);

        // Chrome hydraulic piston cylinder
        const piston = new THREE.Mesh(
            new THREE.CylinderGeometry(0.048, 0.048, 0.42, 12),
            matChrome
        );
        piston.rotation.x = -0.42;
        piston.position.set(0, 0.56, 3.09);
        clampRoot.add(piston);

        // Bold red claw head gripping into the dome armor notch
        const claw = new THREE.Mesh(
            new THREE.BoxGeometry(0.38, 0.22, 0.26),
            matTerranRedPaint
        );
        claw.rotation.x = -0.40;
        claw.position.set(0, 0.84, 2.90);
        clampRoot.add(claw);

        root.add(clampRoot);
    }

    // 6. Top Circular Sunken Energy Radiator Hub & 8 Radial Glowing Crimson Red Cells
    // Bottom seal
    const hubBottom = new THREE.Mesh(
        new THREE.CylinderGeometry(1.50, 1.50, 0.12, 32),
        matDarkGunmetal
    );
    hubBottom.position.set(0, 1.70, 0);
    root.add(hubBottom);

    // Sunken recess plate (Dark Gunmetal)
    const hubRecess = new THREE.Mesh(
        new THREE.CylinderGeometry(1.46, 1.48, 0.08, 32),
        matDarkGunmetal
    );
    hubRecess.position.set(0, 1.74, 0);
    root.add(hubRecess);

    // Outer beveled titanium hub rim
    const hubRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.44, 0.05, 12, 48),
        matBrushedSteelHighlight
    );
    hubRing.rotation.x = Math.PI / 2;
    hubRing.position.set(0, 1.76, 0);
    root.add(hubRing);

    // 24 Chrome perimeter rivets around the hub rim
    for (let i = 0; i < 24; i++) {
        const rivetAngle = i * (Math.PI * 2 / 24);
        const rivet = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 0.03, 6),
            matChrome
        );
        rivet.position.set(Math.sin(rivetAngle) * 1.36, 1.76, Math.cos(rivetAngle) * 1.36);
        root.add(rivet);
    }

    // 8 Radial Glowing Crimson Red Energy Fuel Cells
    for (let i = 0; i < 8; i++) {
        const angle = i * (Math.PI / 4);

        // Dark beveled bezel frame
        const bezel = new THREE.Mesh(
            new THREE.BoxGeometry(0.24, 0.04, 0.48),
            matDarkGunmetal
        );
        bezel.position.set(Math.sin(angle) * 0.95, 1.76, Math.cos(angle) * 0.95);
        bezel.rotation.y = angle;
        root.add(bezel);

        // Glowing red cell
        const cell = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.06, 0.42),
            matTerranRedGlow
        );
        cell.position.set(Math.sin(angle) * 0.95, 1.78, Math.cos(angle) * 0.95);
        cell.rotation.y = angle;
        root.add(cell);
    }

    // Central titanium core disc
    const hubCore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.50, 0.54, 0.08, 24),
        matBrushedSteel
    );
    hubCore.position.set(0, 1.77, 0);
    root.add(hubCore);

    // Concentric inner groove on core disc
    const coreGroove = new THREE.Mesh(
        new THREE.TorusGeometry(0.36, 0.02, 8, 24),
        matDarkGunmetal
    );
    coreGroove.rotation.x = Math.PI / 2;
    coreGroove.position.set(0, 1.79, 0);
    root.add(coreGroove);

    // Central chrome hub cap
    const hubCenter = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.10, 16),
        matChrome
    );
    hubCenter.position.set(0, 1.80, 0);
    root.add(hubCenter);

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
        new THREE.CylinderGeometry(0.70, 0.80, 0.16, 16),
        matNeosteelHull
    );
    base.position.set(0, 0.08, 0);
    root.add(base);

    // Main ammunition rotary magazine drum
    const drum = new THREE.Mesh(
        new THREE.CylinderGeometry(0.60, 0.60, 0.65, 24),
        matNeosteelOchre
    );
    drum.position.set(0, 0.48, 0);
    root.add(drum);

    // Drum armor reinforcement rings
    [0.22, 0.48, 0.74].forEach((ry) => {
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.61, 0.03, 8, 24),
            matNeosteelTrim
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, ry, 0);
        root.add(ring);
    });

    // Vertical inspection glass slit showing golden brass rounds
    const glassSlit = new THREE.Mesh(
        new THREE.PlaneGeometry(0.10, 0.50),
        new THREE.MeshStandardMaterial({
            color: 0x88ffff,
            roughness: 0.1,
            metalness: 0.1,
            transparent: true,
            opacity: 0.5,
        })
    );
    glassSlit.position.set(0, 0.48, 0.61);
    root.add(glassSlit);

    for (let c = 0; c < 5; c++) {
        const bullet = new THREE.Mesh(
            new THREE.CylinderGeometry(0.018, 0.022, 0.07, 8),
            matBrassAmmo
        );
        bullet.rotation.z = Math.PI / 2;
        bullet.position.set(0, 0.28 + c * 0.10, 0.58);
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
            new THREE.BoxGeometry(0.14, 0.06, 0.75),
            matNeosteelTrim
        );
        chute.position.set(dx * 0.68, 0.76, dz * 0.68);
        chute.rotation.y = angle;
        chute.rotation.x = 0.2;
        root.add(chute);

        // Feed motor housing
        const motor = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.07, 0.16, 12),
            matNeosteelHull
        );
        motor.position.set(dx * 0.52, 0.78, dz * 0.52);
        root.add(motor);
    });

    // Top digital ammo counter ring & beacon
    const topCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.44, 0.50, 0.18, 16),
        matNeosteelHull
    );
    topCap.position.set(0, 0.90, 0);
    root.add(topCap);

    // Green digital ammo readout display
    const readout = new THREE.Mesh(
        new THREE.CylinderGeometry(0.46, 0.46, 0.08, 16),
        matRadarGreen
    );
    readout.position.set(0, 0.96, 0);
    root.add(readout);

    // Strobe beacon on top
    const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.06, 0.08, 12),
        matStimAmber
    );
    beacon.position.set(0, 1.06, 0);
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
        new THREE.CylinderGeometry(0.40, 0.46, 0.16, 8),
        matNeosteelHull
    );
    base.position.set(0, 0.08, 0);
    root.add(base);

    // Lower centrifugal intake fan drum
    const fanHousing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, 0.30, 16),
        matNeosteelOchre
    );
    fanHousing.position.set(0, 0.31, 0);
    root.add(fanHousing);

    // Wire mesh intake grilles around drum
    for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        const grille = new THREE.Mesh(
            new THREE.BoxGeometry(0.20, 0.20, 0.04),
            matNeosteelTrim
        );
        grille.position.set(Math.cos(angle) * 0.35, 0.31, Math.sin(angle) * 0.35);
        grille.rotation.y = angle;
        root.add(grille);
    }

    // Central transparent electrostatic ionization chamber
    const ionTube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.26, 0.45, 20),
        new THREE.MeshStandardMaterial({
            color: 0x88ddff,
            roughness: 0.1,
            metalness: 0.1,
            transparent: true,
            opacity: 0.4,
        })
    );
    ionTube.position.set(0, 0.68, 0);
    root.add(ionTube);

    // Glowing cyan ionization core inside
    const ionCore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.14, 0.40, 16),
        matPlasmaCyan
    );
    ionCore.position.set(0, 0.68, 0);
    root.add(ionCore);

    // 4 Vertical copper electrostatic filter rails
    for (let r = 0; r < 4; r++) {
        const rAngle = (r / 4) * Math.PI * 2 + Math.PI / 4;
        const rail = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.025, 0.48, 8),
            matNeosteelTrim
        );
        rail.position.set(Math.cos(rAngle) * 0.30, 0.68, Math.sin(rAngle) * 0.30);
        root.add(rail);
    }

    // Top exhaust manifold & discharge duct
    const topManifold = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.28, 0.18, 8),
        matNeosteelHull
    );
    topManifold.position.set(0, 0.98, 0);
    root.add(topManifold);

    // Lateral exhaust duct tube
    const duct = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 0.35, 12),
        matNeosteelTrim
    );
    duct.rotation.z = Math.PI / 2;
    duct.position.set(0.28, 0.98, 0);
    root.add(duct);

    // Differential pressure gauge on front
    const gauge = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12),
        matChrome
    );
    gauge.rotation.x = Math.PI / 2;
    gauge.position.set(0, 0.85, 0.28);
    root.add(gauge);

    const gaugeFace = new THREE.Mesh(
        new THREE.CircleGeometry(0.04, 12),
        matRadarGreen
    );
    gaugeFace.position.set(0, 0.85, 0.30);
    root.add(gaugeFace);

    return root;
}

function createRampWedgeGeometry(width, zStart, zEnd, yBottom, yTop) {
    const hw = width / 2;
    const positions = new Float32Array([
        // Left triangle face (facing -X)
        -hw, yBottom, zStart,
        -hw, yTop, zStart,
        -hw, yBottom, zEnd,

        // Right triangle face (facing +X)
        hw, yBottom, zStart,
        hw, yBottom, zEnd,
        hw, yTop, zStart,

        // Sloped top face (sloping down from zStart to zEnd)
        -hw, yTop, zStart,
        hw, yTop, zStart,
        -hw, yBottom, zEnd,

        hw, yTop, zStart,
        hw, yBottom, zEnd,
        -hw, yBottom, zEnd,

        // Vertical back face (facing -Z)
        -hw, yBottom, zStart,
        hw, yBottom, zStart,
        -hw, yTop, zStart,

        hw, yBottom, zStart,
        hw, yTop, zStart,
        -hw, yTop, zStart,

        // Horizontal bottom face (facing -Y)
        -hw, yBottom, zStart,
        -hw, yBottom, zEnd,
        hw, yBottom, zStart,

        hw, yBottom, zStart,
        -hw, yBottom, zEnd,
        hw, yBottom, zEnd,
    ]);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
}

// =========================================================================
// 9. terran-bunker-corner-wall.glb (ID 152) & 10. terran-bunker-entrance-wall.glb (ID 153)
// Monolithic, 100% Gap-Free Terran Bunker Fortress Hull
// 4 Heavy Trapezoidal Corner Bastions with Brushed Titanium Front Plates & Dual
// Vertical Glowing Crimson Red Neon Strips, 4 Wide Sloped Corrugated Glacis Blast Ramps
// with 7 Heavy Horizontal Ribs, and Interior Solid Neosteel Deck.
// Centered at (0, 0, 0), Bounds [-4.40, 0, -4.40] to [4.40, 1.36, 4.40].
// =========================================================================
function buildBunkerHull(isEntrance = false) {
    const root = new THREE.Group();

    // 1. Interior Solid Neosteel Deck Floor
    const deckGeo = new THREE.CylinderGeometry(3.55, 3.70, 0.14, 8);
    deckGeo.rotateY(Math.PI / 8);
    const deck = new THREE.Mesh(deckGeo, matDarkGunmetal);
    deck.position.set(0, 0.07, 0);
    root.add(deck);

    // Floor Diamond Tread Inset
    const floorPlateGeo = new THREE.CylinderGeometry(3.35, 3.35, 0.02, 8);
    floorPlateGeo.rotateY(Math.PI / 8);
    const floorPlate = new THREE.Mesh(floorPlateGeo, matCorrugatedArmor);
    floorPlate.position.set(0, 0.15, 0);
    root.add(floorPlate);

    // Perimeter Yellow Hazard Border on Interior Floor
    const cautionRing = new THREE.Mesh(
        new THREE.RingGeometry(3.10, 3.30, 8),
        matHazardYellow
    );
    cautionRing.rotation.x = -Math.PI / 2;
    cautionRing.rotation.z = Math.PI / 8;
    cautionRing.position.set(0, 0.165, 0);
    root.add(cautionRing);

    // 2. 4 Heavy Trapezoidal Corner Bastions (at SE, NE, NW, SW)
    const cornerAngles = [
        Math.PI / 4,          // SE (+X, +Z)
        3 * Math.PI / 4,      // NE (+X, -Z)
        -3 * Math.PI / 4,     // NW (-X, -Z)
        -Math.PI / 4          // SW (-X, +Z)
    ];

    cornerAngles.forEach((angle) => {
        const bastion = new THREE.Group();
        bastion.rotation.y = angle;
        bastion.position.set(Math.sin(angle) * 3.42, 0, Math.cos(angle) * 3.42);

        // Interior ballistic backing (ground up to top shelf at Y = 1.25m)
        const backing = new THREE.Mesh(
            new THREE.BoxGeometry(1.85, 1.25, 0.65),
            matDarkGunmetal
        );
        backing.position.set(0, 0.625, 0.15);
        bastion.add(backing);

        // Front Brushed Titanium Armor Plate (tilted backward ~14°)
        const titaniumFace = new THREE.Mesh(
            new THREE.BoxGeometry(1.78, 1.15, 0.12),
            matBrushedSteelHighlight
        );
        titaniumFace.rotation.x = -0.24;
        titaniumFace.position.set(0, 0.62, 0.44);
        bastion.add(titaniumFace);

        // Vertical central structural column
        const column = new THREE.Mesh(
            new THREE.BoxGeometry(0.38, 1.25, 0.20),
            matDarkGunmetal
        );
        column.position.set(0, 0.625, 0.46);
        bastion.add(column);

        // Column cooling louvers
        [-0.30, 0.0, 0.30].forEach((dy) => {
            const slot = new THREE.Mesh(
                new THREE.BoxGeometry(0.28, 0.05, 0.06),
                matNeosteelTrim
            );
            slot.position.set(0, 0.625 + dy, 0.54);
            bastion.add(slot);
        });

        // Top flat shelf & cap (at Y = 1.25m)
        const cap = new THREE.Mesh(
            new THREE.BoxGeometry(1.88, 0.14, 0.70),
            matDarkGunmetal
        );
        cap.position.set(0, 1.25, 0.15);
        bastion.add(cap);

        // Top receiver latch for dome clamp
        const latch = new THREE.Mesh(
            new THREE.BoxGeometry(0.40, 0.18, 0.35),
            matTerranRedPaint
        );
        latch.position.set(0, 1.26, 0.28);
        bastion.add(latch);

        // Chrome hex bolts on top cap
        [-0.65, 0.65].forEach((bx) => {
            const bolt = new THREE.Mesh(
                new THREE.CylinderGeometry(0.045, 0.045, 0.08, 6),
                matChrome
            );
            bolt.position.set(bx, 1.32, 0.22);
            bastion.add(bolt);
        });

        // Heavy base ground plinth flange (seamlessly connects to adjacent blast ramps)
        const flange = new THREE.Mesh(
            new THREE.BoxGeometry(2.35, 0.16, 0.95),
            matDarkGunmetal
        );
        flange.position.set(0, 0.08, 0.25);
        bastion.add(flange);

        // === DUAL VERTICAL GLOWING CRIMSON RED NEON BARS ON BOTH FLANKS ===
        // Left flank neon bars (facing adjacent ramp)
        [-0.56, -0.76].forEach((dx) => {
            const bezel = new THREE.Mesh(
                new THREE.BoxGeometry(0.12, 0.82, 0.05),
                matDarkGunmetal
            );
            bezel.rotation.x = -0.24;
            bezel.position.set(dx, 0.62, 0.44);
            bastion.add(bezel);

            const redBar = new THREE.Mesh(
                new THREE.BoxGeometry(0.075, 0.78, 0.08),
                matTerranRedGlow
            );
            redBar.rotation.x = -0.24;
            redBar.position.set(dx, 0.62, 0.47);
            bastion.add(redBar);
        });

        // Right flank neon bars (facing adjacent ramp)
        [0.56, 0.76].forEach((dx) => {
            const bezel = new THREE.Mesh(
                new THREE.BoxGeometry(0.12, 0.82, 0.05),
                matDarkGunmetal
            );
            bezel.rotation.x = -0.24;
            bezel.position.set(dx, 0.62, 0.44);
            bastion.add(bezel);

            const redBar = new THREE.Mesh(
                new THREE.BoxGeometry(0.075, 0.78, 0.08),
                matTerranRedGlow
            );
            redBar.rotation.x = -0.24;
            redBar.position.set(dx, 0.62, 0.47);
            bastion.add(redBar);
        });

        root.add(bastion);
    });

    // 3. 4 Solid Sloped Corrugated Glacis Blast Ramps (South, East, North, West)
    const rampAngles = [
        { angle: 0, isSouth: true },                // South (+Z)
        { angle: Math.PI / 2, isSouth: false },     // East (+X)
        { angle: Math.PI, isSouth: false },         // North (-Z)
        { angle: -Math.PI / 2, isSouth: false },    // West (-X)
    ];

    rampAngles.forEach(({ angle, isSouth }) => {
        const rampRoot = new THREE.Group();
        rampRoot.rotation.y = angle;

        // Interior vertical backing wall (spanning between corner bastions)
        const backWall = new THREE.Mesh(
            new THREE.BoxGeometry(3.15, 1.25, 0.25),
            matDarkGunmetal
        );
        backWall.position.set(0, 0.625, 2.75);
        rampRoot.add(backWall);

        // Top upper cornice beam (at Y = 1.25m, Z = 2.80m)
        const topBeam = new THREE.Mesh(
            new THREE.BoxGeometry(3.15, 0.14, 0.35),
            matDarkGunmetal
        );
        topBeam.position.set(0, 1.25, 2.80);
        rampRoot.add(topBeam);

        // Base ground toe flange (at Y = 0.07m, Z = 4.30m)
        const groundFlange = new THREE.Mesh(
            new THREE.BoxGeometry(3.15, 0.14, 0.40),
            matDarkGunmetal
        );
        groundFlange.position.set(0, 0.07, 4.30);
        rampRoot.add(groundFlange);

        if (isSouth && isEntrance) {
            // Entrance Wall Variant: Solid Flanking Ramps with Sliding Blast Door
            [-1.15, 1.15].forEach((rx) => {
                const skirtWedge = new THREE.Mesh(
                    createRampWedgeGeometry(0.85, 2.80, 4.30, 0.08, 1.25),
                    matCorrugatedArmor
                );
                skirtWedge.position.x = rx;
                rampRoot.add(skirtWedge);

                // 7 Corrugation Ribs
                for (let i = 0; i < 7; i++) {
                    const t = (i + 0.5) / 7;
                    const ry = 0.08 + t * 1.17 + 0.015;
                    const rz = 4.30 - t * 1.50;
                    const rib = new THREE.Mesh(
                        new THREE.BoxGeometry(0.85, 0.05, 0.07),
                        matNeosteelTrim
                    );
                    rib.rotation.x = 0.663;
                    rib.position.set(rx, ry, rz);
                    rampRoot.add(rib);
                }
            });

            // Center Entrance Portal Framing & Sliding Blast Door
            const portalFrameL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.25, 0.45), matNeosteelTrim);
            portalFrameL.position.set(-0.70, 0.625, 3.32);
            rampRoot.add(portalFrameL);

            const portalFrameR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.25, 0.45), matNeosteelTrim);
            portalFrameR.position.set(0.70, 0.625, 3.32);
            rampRoot.add(portalFrameR);

            const door = new THREE.Mesh(new THREE.BoxGeometry(1.24, 1.20, 0.18), matDarkGunmetal);
            door.position.set(0, 0.60, 3.32);
            rampRoot.add(door);

            const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.18, 0.45), matDarkGunmetal);
            lintel.position.set(0, 1.25, 3.32);
            rampRoot.add(lintel);

            const lintelHazard = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.10, 0.06), matHazardYellow);
            lintelHazard.position.set(0, 1.25, 3.56);
            rampRoot.add(lintelHazard);

            const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12), matBeaconGreen);
            beacon.rotation.x = Math.PI / 2;
            beacon.position.set(0, 1.35, 3.56);
            rampRoot.add(beacon);

        } else {
            // 100% Solid Water-Tight Armored Glacis Wedge (Gap-Free & Overhang-Free)
            const fullWedge = new THREE.Mesh(
                createRampWedgeGeometry(3.15, 2.80, 4.30, 0.08, 1.25),
                matCorrugatedArmor
            );
            rampRoot.add(fullWedge);

            // 7 Heavy Horizontal Corrugation Ribs along the top sloped face
            for (let i = 0; i < 7; i++) {
                const t = (i + 0.5) / 7;
                const ry = 0.08 + t * 1.17 + 0.015;
                const rz = 4.30 - t * 1.50;
                const rib = new THREE.Mesh(
                    new THREE.BoxGeometry(3.15, 0.05, 0.07),
                    matNeosteelTrim
                );
                rib.rotation.x = 0.663;
                rib.position.set(0, ry, rz);
                rampRoot.add(rib);
            }
        }

        root.add(rampRoot);
    });

    // Invisible Bounding Box Anchors to lock exact symmetry [-4.40, 0, -4.40] to [4.40, 1.36, 4.40]
    const anchorMin = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001));
    anchorMin.position.set(-4.40, 0.00, -4.40);
    anchorMin.visible = false;
    root.add(anchorMin);

    const anchorMax = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001));
    anchorMax.position.set(4.40, 1.36, 4.40);
    anchorMax.visible = false;
    root.add(anchorMax);

    return root;
}

function buildBunkerCornerWall(isEntrance = false) {
    return buildBunkerHull(false);
}

function buildBunkerEntranceWall() {
    return buildBunkerHull(true);
}

// =========================================================================
// Main Export Routine
// =========================================================================
async function main() {
    console.log('Generating 10 StarCraft 1 Terran Bunker 3D PBR GLB Assets...');

    await exportGLB(buildBunkerRoofDome(), 'terran-bunker-roof-dome.glb');
    await exportGLB(buildBunkerAmmoTower(), 'terran-bunker-ammo-tower.glb');
    await exportGLB(buildBunkerGunStation(), 'terran-bunker-gun-station.glb');
    await exportGLB(buildBunkerFiringSlit(), 'terran-bunker-firing-slit.glb');
    await exportGLB(buildBunkerPeriscopeConsole(), 'terran-bunker-periscope-console.glb');
    await exportGLB(buildBunkerStimStation(), 'terran-bunker-stim-station.glb');
    await exportGLB(buildBunkerEscapeHatch(), 'terran-bunker-escape-hatch.glb');
    await exportGLB(buildBunkerSmokeScrubber(), 'terran-bunker-smoke-scrubber.glb');
    await exportGLB(buildBunkerCornerWall(false), 'terran-bunker-corner-wall.glb');
    await exportGLB(buildBunkerEntranceWall(), 'terran-bunker-entrance-wall.glb');

    console.log('All 10 Terran Bunker Assets Successfully Generated!');
}

main().catch((err) => {
    console.error('Bunker Asset Generation Error:', err);
    process.exit(1);
});
