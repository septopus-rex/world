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
// Materials Palette for Ancient Chinese Grey Clay Tile Roof (中式青瓦大屋顶)
// =========================================================================
const matSlateTile = new THREE.MeshStandardMaterial({
    color: 0x3d414a,      // Authentic Chinese slate grey tile (青灰色小青瓦)
    roughness: 0.65,
    metalness: 0.08,
});

const matDarkSlate = new THREE.MeshStandardMaterial({
    color: 0x24262b,      // Tile valleys and dark shadow recesses (瓦沟底瓦基层)
    roughness: 0.85,
    metalness: 0.04,
    side: THREE.DoubleSide,
});

const matTileRelief = new THREE.MeshStandardMaterial({
    color: 0x4f5460,      // Raised tile ridge caps & Wadang faces
    roughness: 0.52,
    metalness: 0.12,
});

const matEaveGold = new THREE.MeshStandardMaterial({
    color: 0xc49748,      // Brass/gilded Chiwen beast & eave ornament accents (鎏金鸱吻)
    roughness: 0.32,
    metalness: 0.78,
});

const matDarkRosewood = new THREE.MeshStandardMaterial({
    color: 0x42190e,      // Purlins, rafters, ridge beam, bargeboards (紫檀额枋与椽木)
    roughness: 0.45,
    metalness: 0.08,
});

const matCeilingWood = new THREE.MeshStandardMaterial({
    color: 0x5a2312,      // Interior ceiling wood planks (室内木天花望板)
    roughness: 0.40,
    metalness: 0.05,
    side: THREE.DoubleSide,
});

// Anchor material for bounding box pinning (invisible in render)
const matInvisibleAnchor = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
});

// Dimensions of a 4m bay roof section (in Three.js Engine Frame)
// X: East-West span = 4.0m  ([-2.0, +2.0])
// Y: Altitude/Height = 1.50m ([-0.75, +0.75])
// Z: Depth/North-South = 4.8m ([-2.4, +2.4])
const W = 4.0;
const H = 1.50;
const D = 4.8;
const NUM_TILES = 16;
const TILE_PITCH = W / NUM_TILES; // 0.25m per tile cylinder

// Add two invisible corner meshes to pin the bounding box to exactly [-W/2, -H/2, -D/2]..[+W/2, +H/2, +D/2]
function addBoundingAnchors(group) {
    const anchorGeom = new THREE.BoxGeometry(0.002, 0.002, 0.002);
    const a1 = new THREE.Mesh(anchorGeom, matInvisibleAnchor);
    a1.position.set(-W / 2, -H / 2, -D / 2);
    group.add(a1);

    const a2 = new THREE.Mesh(anchorGeom, matInvisibleAnchor);
    a2.position.set(W / 2, H / 2, D / 2);
    group.add(a2);
}

// -------------------------------------------------------------------------
// Front Roof Slope (Corridor):
// Eave is at South (Z = +D/2 = +2.4m, Y = -0.55m)
// Ridge is at North (Z = -D/2 = -2.4m, Y = +0.40m)
// -------------------------------------------------------------------------
function getFrontY(z, x = 0, isCornerUpturn = false) {
    const t = (D / 2 - z) / D; // 0 at eave (z=+2.4), 1 at ridge (z=-2.4)
    const clampedT = Math.max(0, Math.min(1, t));
    let y = -0.55 + Math.pow(clampedT, 1.32) * 0.95;
    if (isCornerUpturn && z > D / 2 - 0.9) {
        const ct = (z - (D / 2 - 0.9)) / 0.9;
        y += ct * ct * 0.16;
    }
    return y;
}

// -------------------------------------------------------------------------
// Back Roof Slope (Guestrooms):
// Ridge is at South (Z = +D/2 = +2.4m, Y = +0.40m)
// Eave is at North (Z = -D/2 = -2.4m, Y = -0.55m)
// -------------------------------------------------------------------------
function getBackY(z, x = 0, isCornerUpturn = false) {
    const t = (z + D / 2) / D; // 0 at eave (z=-2.4), 1 at ridge (z=+2.4)
    const clampedT = Math.max(0, Math.min(1, t));
    let y = -0.55 + Math.pow(clampedT, 1.32) * 0.95;
    if (isCornerUpturn && z < -D / 2 + 0.9) {
        const ct = (-D / 2 + 0.9 - z) / 0.9;
        y += ct * ct * 0.16;
    }
    return y;
}

// =========================================================================
// Build Front Slope Roof Section (Corridor)
// =========================================================================
function buildFrontRoof(options = { gable: 'none' }) {
    const group = new THREE.Group();
    group.name = 'Pal1RoofFront';

    const hasWestGable = options.gable === 'west';
    const hasEastGable = options.gable === 'east';

    // 1. Watertight Solid Roof Deck (瓦面底瓦与望板连续曲面)
    const NX = 16;
    const NZ = 24;
    const deckPositions = [];
    const deckNormals = [];
    const deckIndices = [];

    for (let iz = 0; iz <= NZ; iz++) {
        const z = D / 2 - (iz / NZ) * D; // +2.4 down to -2.4
        for (let ix = 0; ix <= NX; ix++) {
            const x = -W / 2 + (ix / NX) * W;
            const isCorner = (hasWestGable && ix === 0) || (hasEastGable && ix === NX);
            const y = getFrontY(z, x, isCorner);
            deckPositions.push(x, y, z);
        }
    }

    for (let iz = 0; iz < NZ; iz++) {
        for (let ix = 0; ix < NX; ix++) {
            const a = iz * (NX + 1) + ix;
            const b = iz * (NX + 1) + (ix + 1);
            const c = (iz + 1) * (NX + 1) + (ix + 1);
            const d = (iz + 1) * (NX + 1) + ix;
            // Two triangles per quad
            deckIndices.push(a, b, d);
            deckIndices.push(b, c, d);
        }
    }

    const deckGeom = new THREE.BufferGeometry();
    deckGeom.setAttribute('position', new THREE.Float32BufferAttribute(deckPositions, 3));
    deckGeom.setIndex(deckIndices);
    deckGeom.computeVertexNormals();

    const deckMesh = new THREE.Mesh(deckGeom, matDarkSlate);
    group.add(deckMesh);

    // 2. 16 Cylindrical Semi-Circular Tile Ridges (筒瓦垄) along X
    const zSegs = 20;
    for (let i = 0; i < NUM_TILES; i++) {
        const tx = -W / 2 + (i + 0.5) * TILE_PITCH;
        const isCorner = (hasWestGable && i === 0) || (hasEastGable && i === NUM_TILES - 1);

        for (let s = 0; s < zSegs; s++) {
            // Eave to Ridge: z0 to z1
            const z0 = D / 2 - (s / zSegs) * D;
            const z1 = D / 2 - ((s + 1) / zSegs) * D;
            const zm = (z0 + z1) / 2;
            const y0 = getFrontY(z0, tx, isCorner);
            const y1 = getFrontY(z1, tx, isCorner);
            const ym = (y0 + y1) / 2;

            const segLen = Math.hypot(z1 - z0, y1 - y0);
            const pitchAngle = Math.atan2(y1 - y0, z0 - z1); // slope angle

            const tileGeom = new THREE.CylinderGeometry(0.046, 0.046, segLen, 8, 1, false, 0, Math.PI);
            const tile = new THREE.Mesh(tileGeom, matSlateTile);
            tile.position.set(tx, ym + 0.038, zm);
            tile.rotation.x = -pitchAngle;
            tile.rotation.z = Math.PI / 2;
            group.add(tile);
        }

        // 3. Eave Drip Head Tile (瓦当) at the South eave end (Z = +D/2)
        const eaveY = getFrontY(D / 2, tx, isCorner);
        const wadangGeom = new THREE.CylinderGeometry(0.060, 0.060, 0.025, 12);
        const wadang = new THREE.Mesh(wadangGeom, matTileRelief);
        wadang.position.set(tx, eaveY + 0.025, D / 2 + 0.015);
        wadang.rotation.x = Math.PI / 2 + 0.22;
        group.add(wadang);

        // Center medallion disc on Wadang
        const discGeom = new THREE.CylinderGeometry(0.040, 0.040, 0.030, 8);
        const disc = new THREE.Mesh(discGeom, matDarkRosewood);
        disc.position.set(tx, eaveY + 0.025, D / 2 + 0.020);
        disc.rotation.x = Math.PI / 2 + 0.22;
        group.add(disc);

        // 4. Inverted Triangular Drip Tile (滴水) between ridges
        if (i < NUM_TILES - 1) {
            const dripX = tx + TILE_PITCH / 2;
            const dripGeom = new THREE.ConeGeometry(0.038, 0.065, 3);
            const drip = new THREE.Mesh(dripGeom, matDarkSlate);
            drip.position.set(dripX, eaveY - 0.028, D / 2 + 0.005);
            drip.rotation.x = Math.PI;
            group.add(drip);
        }
    }

    // 5. Under-eave Supporting Rafters (飞椽与檐椽)
    const numRafters = 24;
    for (let r = 0; r <= numRafters; r++) {
        const rx = -W / 2 + r * (W / numRafters);
        const rafterGeom = new THREE.BoxGeometry(0.045, 0.050, 0.85);
        const rafter = new THREE.Mesh(rafterGeom, matDarkRosewood);
        const rz = D / 2 - 0.42;
        const ry = getFrontY(rz) - 0.048;
        rafter.position.set(rx, ry, rz);
        rafter.rotation.x = 0.22;
        group.add(rafter);
    }

    // 6. Eave Purlin Beam (挑檐枋) & Fascia Board (檐口封檐板)
    const purlinGeom = new THREE.BoxGeometry(W, 0.08, 0.08);
    const purlin = new THREE.Mesh(purlinGeom, matDarkRosewood);
    purlin.position.set(0, getFrontY(D / 2 - 0.7) - 0.07, D / 2 - 0.7);
    group.add(purlin);

    const fasciaGeom = new THREE.BoxGeometry(W, 0.08, 0.04);
    const fascia = new THREE.Mesh(fasciaGeom, matDarkRosewood);
    fascia.position.set(0, getFrontY(D / 2) - 0.035, D / 2 - 0.02);
    group.add(fascia);

    // 7. Indoor Wooden Ceiling (室内平顶天花板) at bottom Y = -0.72m
    // Corridor covers Z from -2.4 (north wall) to +1.6 (front colonnade)
    const ceilingGeom = new THREE.BoxGeometry(W, 0.04, 4.0);
    const ceiling = new THREE.Mesh(ceilingGeom, matCeilingWood);
    ceiling.position.set(0, -H / 2 + 0.03, -0.4);
    group.add(ceiling);

    // 8. Gable Bargeboard (博风板) & Triangular Wall if West/East end
    if (hasWestGable || hasEastGable) {
        const gx = hasWestGable ? -W / 2 + 0.035 : W / 2 - 0.035;
        const bargeLen = Math.hypot(D, 0.95);
        const bargeAngle = Math.atan2(0.95, D);

        const bargeGeom = new THREE.BoxGeometry(0.07, 0.16, bargeLen + 0.15);
        const barge = new THREE.Mesh(bargeGeom, matDarkRosewood);
        barge.position.set(gx, -0.07, 0);
        barge.rotation.x = bargeAngle;
        group.add(barge);

        // Triangular Gable Wall Panel (山尖板壁) closing the vertical side down to ceiling
        const gableWallGeom = new THREE.BufferGeometry();
        const v = new Float32Array([
            gx, -H / 2 + 0.04, D / 2,
            gx, 0.40, -D / 2,
            gx, -H / 2 + 0.04, -D / 2,
            gx, -H / 2 + 0.04, D / 2,
            gx, getFrontY(D / 2), D / 2,
            gx, 0.40, -D / 2
        ]);
        gableWallGeom.setAttribute('position', new THREE.BufferAttribute(v, 3));
        gableWallGeom.computeVertexNormals();
        const gableWall = new THREE.Mesh(gableWallGeom, matDarkRosewood);
        group.add(gableWall);

        // Upturned Corner Accent (飞檐翘角兽头) at eave
        const cornerAccent = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.22), matEaveGold);
        cornerAccent.position.set(gx, getFrontY(D / 2, 0, true) + 0.05, D / 2 + 0.04);
        cornerAccent.rotation.x = -0.35;
        group.add(cornerAccent);
    }

    // Pin exact bounding box
    addBoundingAnchors(group);

    return group;
}

// =========================================================================
// Build Back Slope Roof Section (Guestrooms) with Main Ridge & Chiwen
// =========================================================================
function buildBackRoof(options = { gable: 'none' }) {
    const group = new THREE.Group();
    group.name = 'Pal1RoofBack';

    const hasWestGable = options.gable === 'west';
    const hasEastGable = options.gable === 'east';

    // 1. Watertight Solid Roof Deck (瓦面底瓦与望板连续曲面)
    const NX = 16;
    const NZ = 24;
    const deckPositions = [];
    const deckIndices = [];

    for (let iz = 0; iz <= NZ; iz++) {
        const z = -D / 2 + (iz / NZ) * D; // -2.4 up to +2.4
        for (let ix = 0; ix <= NX; ix++) {
            const x = -W / 2 + (ix / NX) * W;
            const isCorner = (hasWestGable && ix === 0) || (hasEastGable && ix === NX);
            const y = getBackY(z, x, isCorner);
            deckPositions.push(x, y, z);
        }
    }

    for (let iz = 0; iz < NZ; iz++) {
        for (let ix = 0; ix < NX; ix++) {
            const a = iz * (NX + 1) + ix;
            const b = iz * (NX + 1) + (ix + 1);
            const c = (iz + 1) * (NX + 1) + (ix + 1);
            const d = (iz + 1) * (NX + 1) + ix;
            deckIndices.push(a, b, d);
            deckIndices.push(b, c, d);
        }
    }

    const deckGeom = new THREE.BufferGeometry();
    deckGeom.setAttribute('position', new THREE.Float32BufferAttribute(deckPositions, 3));
    deckGeom.setIndex(deckIndices);
    deckGeom.computeVertexNormals();

    const deckMesh = new THREE.Mesh(deckGeom, matDarkSlate);
    group.add(deckMesh);

    // 2. 16 Cylindrical Semi-Circular Tile Ridges (筒瓦垄) along X
    const zSegs = 20;
    for (let i = 0; i < NUM_TILES; i++) {
        const tx = -W / 2 + (i + 0.5) * TILE_PITCH;
        const isCorner = (hasWestGable && i === 0) || (hasEastGable && i === NUM_TILES - 1);

        for (let s = 0; s < zSegs; s++) {
            // Eave to Ridge: z0 to z1
            const z0 = -D / 2 + (s / zSegs) * D;
            const z1 = -D / 2 + ((s + 1) / zSegs) * D;
            const zm = (z0 + z1) / 2;
            const y0 = getBackY(z0, tx, isCorner);
            const y1 = getBackY(z1, tx, isCorner);
            const ym = (y0 + y1) / 2;

            const segLen = Math.hypot(z1 - z0, y1 - y0);
            const pitchAngle = Math.atan2(y1 - y0, z1 - z0);

            const tileGeom = new THREE.CylinderGeometry(0.046, 0.046, segLen, 8, 1, false, 0, Math.PI);
            const tile = new THREE.Mesh(tileGeom, matSlateTile);
            tile.position.set(tx, ym + 0.038, zm);
            tile.rotation.x = pitchAngle;
            tile.rotation.z = Math.PI / 2;
            group.add(tile);
        }

        // 3. Rear Eave Drip Head Tile (瓦当) at the North eave end (Z = -D/2)
        const eaveY = getBackY(-D / 2, tx, isCorner);
        const wadangGeom = new THREE.CylinderGeometry(0.060, 0.060, 0.025, 12);
        const wadang = new THREE.Mesh(wadangGeom, matTileRelief);
        wadang.position.set(tx, eaveY + 0.025, -D / 2 - 0.015);
        wadang.rotation.x = Math.PI / 2 - 0.22;
        group.add(wadang);

        const discGeom = new THREE.CylinderGeometry(0.040, 0.040, 0.030, 8);
        const disc = new THREE.Mesh(discGeom, matDarkRosewood);
        disc.position.set(tx, eaveY + 0.025, -D / 2 - 0.020);
        disc.rotation.x = Math.PI / 2 - 0.22;
        group.add(disc);

        // 4. Inverted Triangular Drip Tile (滴水)
        if (i < NUM_TILES - 1) {
            const dripX = tx + TILE_PITCH / 2;
            const dripGeom = new THREE.ConeGeometry(0.038, 0.065, 3);
            const drip = new THREE.Mesh(dripGeom, matDarkSlate);
            drip.position.set(dripX, eaveY - 0.028, -D / 2 - 0.005);
            drip.rotation.x = Math.PI;
            group.add(drip);
        }
    }

    // 5. Under-eave Supporting Rafters for rear eave
    const numRafters = 24;
    for (let r = 0; r <= numRafters; r++) {
        const rx = -W / 2 + r * (W / numRafters);
        const rafterGeom = new THREE.BoxGeometry(0.045, 0.050, 0.85);
        const rafter = new THREE.Mesh(rafterGeom, matDarkRosewood);
        const rz = -D / 2 + 0.42;
        const ry = getBackY(rz) - 0.048;
        rafter.position.set(rx, ry, rz);
        rafter.rotation.x = -0.22;
        group.add(rafter);
    }

    // 6. Eave Purlin Beam & Fascia Board
    const purlinGeom = new THREE.BoxGeometry(W, 0.08, 0.08);
    const purlin = new THREE.Mesh(purlinGeom, matDarkRosewood);
    purlin.position.set(0, getBackY(-D / 2 + 0.7) - 0.07, -D / 2 + 0.7);
    group.add(purlin);

    const fasciaGeom = new THREE.BoxGeometry(W, 0.08, 0.04);
    const fascia = new THREE.Mesh(fasciaGeom, matDarkRosewood);
    fascia.position.set(0, getBackY(-D / 2) - 0.035, -D / 2 + 0.02);
    group.add(fascia);

    // 7. Main Ridge Beam & Ridge Cap Tiles (正脊桁与正脊宝顶滚筒瓦) at Z = +D/2 = +2.4m
    const ridgeBeamGeom = new THREE.BoxGeometry(W, 0.12, 0.22);
    const ridgeBeam = new THREE.Mesh(ridgeBeamGeom, matDarkRosewood);
    ridgeBeam.position.set(0, 0.44, D / 2);
    group.add(ridgeBeam);

    // Cylindrical Ridge Roll (正脊滚筒瓦)
    const rollGeom = new THREE.CylinderGeometry(0.075, 0.075, W, 12);
    const rollMesh = new THREE.Mesh(rollGeom, matTileRelief);
    rollMesh.rotation.z = Math.PI / 2;
    rollMesh.position.set(0, 0.52, D / 2);
    group.add(rollMesh);

    // 8. Indoor Wooden Ceiling at Y = -0.72m
    const ceilingGeom = new THREE.BoxGeometry(W, 0.04, 4.0);
    const ceiling = new THREE.Mesh(ceilingGeom, matCeilingWood);
    ceiling.position.set(0, -H / 2 + 0.03, 0.4);
    group.add(ceiling);

    // 9. Gable Bargeboard, Triangular Wall, and Golden Chiwen Beast if West/East end
    if (hasWestGable || hasEastGable) {
        const gx = hasWestGable ? -W / 2 + 0.035 : W / 2 - 0.035;
        const bargeLen = Math.hypot(D, 0.95);
        const bargeAngle = Math.atan2(0.95, D);

        const bargeGeom = new THREE.BoxGeometry(0.07, 0.16, bargeLen + 0.15);
        const barge = new THREE.Mesh(bargeGeom, matDarkRosewood);
        barge.position.set(gx, -0.07, 0);
        barge.rotation.x = -bargeAngle;
        group.add(barge);

        // Triangular Gable Wall Panel closing down to ceiling
        const gableWallGeom = new THREE.BufferGeometry();
        const v = new Float32Array([
            gx, -H / 2 + 0.04, -D / 2,
            gx, 0.40, D / 2,
            gx, -H / 2 + 0.04, D / 2,
            gx, -H / 2 + 0.04, -D / 2,
            gx, getBackY(-D / 2), -D / 2,
            gx, 0.40, D / 2
        ]);
        gableWallGeom.setAttribute('position', new THREE.BufferAttribute(v, 3));
        gableWallGeom.computeVertexNormals();
        const gableWall = new THREE.Mesh(gableWallGeom, matDarkRosewood);
        group.add(gableWall);

        // Rear eave upturned finial
        const cornerAccent = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.22), matEaveGold);
        cornerAccent.position.set(gx, getBackY(-D / 2, 0, true) + 0.05, -D / 2 - 0.04);
        cornerAccent.rotation.x = 0.35;
        group.add(cornerAccent);

        // Golden Chiwen Mythical Beast (正脊金铜鸱吻) atop the ridge apex at Z = +D/2
        const chiwenGroup = new THREE.Group();
        const bodyGeom = new THREE.BoxGeometry(0.12, 0.16, 0.24);
        const chiwenBody = new THREE.Mesh(bodyGeom, matEaveGold);
        chiwenGroup.add(chiwenBody);

        const hornGeom = new THREE.ConeGeometry(0.045, 0.16, 6);
        const chiwenHorn = new THREE.Mesh(hornGeom, matEaveGold);
        chiwenHorn.position.set(0, 0.12, -0.04);
        chiwenHorn.rotation.x = 0.35;
        chiwenGroup.add(chiwenHorn);

        chiwenGroup.position.set(gx, 0.58, D / 2);
        group.add(chiwenGroup);
    }

    // Pin exact bounding box
    addBoundingAnchors(group);

    return group;
}

// =========================================================================
// Main Export Routine
// =========================================================================
async function main() {
    console.log('Generating Chinese Classical Inn Roof 3D Models...');

    // 1. Front Roofs (Corridor)
    await exportGLB(buildFrontRoof({ gable: 'none' }), 'pal1-inn-roof-front.glb');
    await exportGLB(buildFrontRoof({ gable: 'west' }), 'pal1-inn-roof-front-west.glb');
    await exportGLB(buildFrontRoof({ gable: 'east' }), 'pal1-inn-roof-front-east.glb');

    // 2. Back Roofs (Guestrooms)
    await exportGLB(buildBackRoof({ gable: 'none' }), 'pal1-inn-roof-back.glb');
    await exportGLB(buildBackRoof({ gable: 'west' }), 'pal1-inn-roof-back-west.glb');
    await exportGLB(buildBackRoof({ gable: 'east' }), 'pal1-inn-roof-back-east.glb');

    console.log('All 6 roof modules generated successfully with pinned bounding boxes!');
}

main().catch((err) => {
    console.error('Failed to generate roof assets:', err);
    process.exit(1);
});
