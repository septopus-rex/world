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

// Procedural Traditional Chinese Lattice Window (中国古代园林镂花木格窗)
// Centered at [0, 0, 0] so it maps 1:1 into the SPP opening [u, v, su, sv]
function buildChineseLatticeWindow() {
    const group = new THREE.Group();
    group.name = 'OrientalLatticeWindow';

    const matHardwood = new THREE.MeshStandardMaterial({
        color: 0x4a180e, // Rich dark vermilion rosewood (老红木/栗壳色漆)
        roughness: 0.38,
        metalness: 0.12,
    });

    const matInnerMolding = new THREE.MeshStandardMaterial({
        color: 0x36110a, // Darker recessed wood molding
        roughness: 0.45,
        metalness: 0.10,
    });

    const matLatticeRib = new THREE.MeshStandardMaterial({
        color: 0x561e12, // Warm wood lattice ribs
        roughness: 0.35,
        metalness: 0.15,
    });

    const matPaperScreen = new THREE.MeshStandardMaterial({
        color: 0xfdf7ec, // Translucent warm rice paper / silk screen (暖白绢纱宣纸)
        roughness: 0.88,
        metalness: 0.02,
    });

    const matAntiqueBrass = new THREE.MeshStandardMaterial({
        color: 0xc89e44, // Antique cast brass (仿古錾铜)
        roughness: 0.28,
        metalness: 0.82,
    });

    const W = 2.88;
    const H = 2.64;
    const D = 0.12;
    const frameT = 0.10; // Outer frame thickness

    // --- 1. Macro Outer Frame (Centered at 0, 0, 0) ---
    // Left & Right Stiles (边挺)
    const stileGeom = new THREE.BoxGeometry(frameT, H, D);
    const leftStile = new THREE.Mesh(stileGeom, matHardwood);
    leftStile.position.set(-W / 2 + frameT / 2, 0, 0);
    group.add(leftStile);

    const rightStile = new THREE.Mesh(stileGeom, matHardwood);
    rightStile.position.set(W / 2 - frameT / 2, 0, 0);
    group.add(rightStile);

    // Top & Bottom Rails (抹头/横槛)
    const railW = W - 2 * frameT;
    const railGeom = new THREE.BoxGeometry(railW, frameT, D);
    const topRail = new THREE.Mesh(railGeom, matHardwood);
    topRail.position.set(0, H / 2 - frameT / 2, 0);
    group.add(topRail);

    const bottomRail = new THREE.Mesh(railGeom, matHardwood);
    bottomRail.position.set(0, -H / 2 + frameT / 2, 0);
    group.add(bottomRail);

    // Inward Stepped Moldings (压边叠级线脚)
    const moldT = 0.025;
    const moldD = D * 0.85;
    const innerW = W - 2 * frameT;
    const innerH = H - 2 * frameT;

    const moldHorizGeom = new THREE.BoxGeometry(innerW, moldT, moldD);
    const moldTop = new THREE.Mesh(moldHorizGeom, matInnerMolding);
    moldTop.position.set(0, H / 2 - frameT - moldT / 2, 0);
    group.add(moldTop);

    const moldBottom = new THREE.Mesh(moldHorizGeom, matInnerMolding);
    moldBottom.position.set(0, -H / 2 + frameT + moldT / 2, 0);
    group.add(moldBottom);

    const moldVertGeom = new THREE.BoxGeometry(moldT, innerH - 2 * moldT, moldD);
    const moldLeft = new THREE.Mesh(moldVertGeom, matInnerMolding);
    moldLeft.position.set(-innerW / 2 + moldT / 2, 0, 0);
    group.add(moldLeft);

    const moldRight = new THREE.Mesh(moldVertGeom, matInnerMolding);
    moldRight.position.set(innerW / 2 - moldT / 2, 0, 0);
    group.add(moldRight);

    // --- 2. Translucent Screen Backing (透光宣纸/绢纱层) ---
    const paperGeom = new THREE.BoxGeometry(innerW - 2 * moldT, innerH - 2 * moldT, 0.01);
    const paperMesh = new THREE.Mesh(paperGeom, matPaperScreen);
    paperMesh.position.set(0, 0, -0.015);
    group.add(paperMesh);

    // --- 3. Four Pierced Cloud Corner Spandrels (如意角花) ---
    const cornerOffsets = [
        [-innerW / 2 + moldT, H / 2 - frameT - moldT, 1, -1],  // Top-Left
        [innerW / 2 - moldT, H / 2 - frameT - moldT, -1, -1],  // Top-Right
        [-innerW / 2 + moldT, -H / 2 + frameT + moldT, 1, 1],  // Bottom-Left
        [innerW / 2 - moldT, -H / 2 + frameT + moldT, -1, 1],  // Bottom-Right
    ];

    for (const [cx, cy, sx, sy] of cornerOffsets) {
        const spandrelSteps = [
            { w: 0.24, h: 0.035, ox: 0.12, oy: 0.0175 },
            { w: 0.18, h: 0.035, ox: 0.09, oy: 0.0525 },
            { w: 0.12, h: 0.035, ox: 0.06, oy: 0.0875 },
            { w: 0.06, h: 0.035, ox: 0.03, oy: 0.1225 },
        ];
        for (const step of spandrelSteps) {
            const stepGeom = new THREE.BoxGeometry(step.w, step.h, 0.04);
            const stepMesh = new THREE.Mesh(stepGeom, matHardwood);
            stepMesh.position.set(cx + sx * step.ox, cy + sy * step.oy, 0.01);
            group.add(stepMesh);
        }

        const strutGeom = new THREE.BoxGeometry(0.04, 0.24, 0.045);
        const strutMesh = new THREE.Mesh(strutGeom, matInnerMolding);
        strutMesh.position.set(cx + sx * 0.09, cy + sy * 0.09, 0.012);
        strutMesh.rotation.z = (sx * sy > 0 ? 1 : -1) * Math.PI / 4;
        group.add(strutMesh);
    }

    // --- 4. Central Octagonal Medallion (核心八角景心套环) ---
    const octRadius = 0.80;
    const octRibT = 0.04;
    const octRibD = 0.05;

    for (let i = 0; i < 8; i++) {
        const a1 = (i * Math.PI) / 4;
        const a2 = ((i + 1) * Math.PI) / 4;
        const x1 = Math.cos(a1) * octRadius;
        const y1 = Math.sin(a1) * octRadius;
        const x2 = Math.cos(a2) * octRadius;
        const y2 = Math.sin(a2) * octRadius;

        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const len = Math.hypot(x2 - x1, y2 - y1);
        const angle = Math.atan2(y2 - y1, x2 - x1);

        const segGeom = new THREE.BoxGeometry(len, octRibT, octRibD);
        const segMesh = new THREE.Mesh(segGeom, matHardwood);
        segMesh.position.set(mx, my, 0.015);
        segMesh.rotation.z = angle;
        group.add(segMesh);

        // Radial corner struts
        if (Math.abs(Math.cos(a1)) > 0.3 && Math.abs(Math.sin(a1)) > 0.3) {
            const outerTargetX = Math.sign(Math.cos(a1)) * (innerW / 2 - moldT);
            const outerTargetY = Math.sign(Math.sin(a1)) * (innerH / 2 - moldT);
            const rx = (x1 + outerTargetX) / 2;
            const ry = (y1 + outerTargetY) / 2;
            const rlen = Math.hypot(outerTargetX - x1, outerTargetY - y1);
            const rangle = Math.atan2(outerTargetY - y1, outerTargetX - x1);

            const rGeom = new THREE.BoxGeometry(rlen, 0.03, 0.04);
            const rMesh = new THREE.Mesh(rGeom, matLatticeRib);
            rMesh.position.set(rx, ry, 0.012);
            rMesh.rotation.z = rangle;
            group.add(rMesh);
        }
    }

    // Inner Concentric Octagonal Ring (双套圈细棂)
    const octInnerR = 0.60;
    for (let i = 0; i < 8; i++) {
        const a1 = (i * Math.PI) / 4;
        const a2 = ((i + 1) * Math.PI) / 4;
        const x1 = Math.cos(a1) * octInnerR;
        const y1 = Math.sin(a1) * octInnerR;
        const x2 = Math.cos(a2) * octInnerR;
        const y2 = Math.sin(a2) * octInnerR;

        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const len = Math.hypot(x2 - x1, y2 - y1);
        const angle = Math.atan2(y2 - y1, x2 - x1);

        const segGeom = new THREE.BoxGeometry(len, 0.024, 0.035);
        const segMesh = new THREE.Mesh(segGeom, matLatticeRib);
        segMesh.position.set(mx, my, 0.015);
        segMesh.rotation.z = angle;
        group.add(segMesh);
    }

    // --- 5. Classical Step-Lattice Inside Octagon (步步锦与回字纹细棂) ---
    const hRibSpans = [
        { y: -0.40, len: 0.76 },
        { y: -0.20, len: 1.10 },
        { y: 0.00, len: 1.18 },
        { y: 0.20, len: 1.10 },
        { y: 0.40, len: 0.76 },
    ];
    for (const hr of hRibSpans) {
        const ribGeom = new THREE.BoxGeometry(hr.len, 0.024, 0.035);
        const ribMesh = new THREE.Mesh(ribGeom, matLatticeRib);
        ribMesh.position.set(0, hr.y, 0.015);
        group.add(ribMesh);
    }

    const vRibSpans = [
        { x: -0.40, len: 0.76 },
        { x: -0.20, len: 1.10 },
        { x: 0.00, len: 1.18 },
        { x: 0.20, len: 1.10 },
        { x: 0.40, len: 0.76 },
    ];
    for (const vr of vRibSpans) {
        const ribGeom = new THREE.BoxGeometry(0.024, vr.len, 0.038);
        const ribMesh = new THREE.Mesh(ribGeom, matLatticeRib);
        ribMesh.position.set(vr.x, 0, 0.016);
        group.add(ribMesh);
    }

    // Interlocking Auspicious Meander Bosses (回字步步锦榫卯结节)
    const meanderOffsets = [
        [-0.10, -0.10], [0.10, -0.10], [-0.10, 0.10], [0.10, 0.10],
        [-0.30, -0.30], [0.30, -0.30], [-0.30, 0.30], [0.30, 0.30],
        [0.00, -0.20], [0.00, 0.20], [-0.20, 0.00], [0.20, 0.00],
    ];
    for (const [mx, my] of meanderOffsets) {
        const crossGeom = new THREE.BoxGeometry(0.055, 0.055, 0.042);
        const crossMesh = new THREE.Mesh(crossGeom, matHardwood);
        crossMesh.position.set(mx, my, 0.018);
        group.add(crossMesh);
    }

    // --- 6. Antique Cast Brass Corner Mounts (仿古云头包角铜件) ---
    const brassCornerPos = [
        [-W / 2 + 0.07, H / 2 - 0.07],
        [W / 2 - 0.07, H / 2 - 0.07],
        [-W / 2 + 0.07, -H / 2 + 0.07],
        [W / 2 - 0.07, -H / 2 + 0.07],
    ];
    for (const [bx, by] of brassCornerPos) {
        const cornerPlateGeom = new THREE.BoxGeometry(0.12, 0.12, 0.015);
        const cornerPlate = new THREE.Mesh(cornerPlateGeom, matAntiqueBrass);
        cornerPlate.position.set(bx, by, D / 2 + 0.005);
        group.add(cornerPlate);

        for (const [dx, dy] of [[-0.035, -0.035], [0.035, -0.035], [-0.035, 0.035], [0.035, 0.035]]) {
            const rivetGeom = new THREE.SphereGeometry(0.012, 8, 8);
            const rivet = new THREE.Mesh(rivetGeom, matAntiqueBrass);
            rivet.position.set(bx + dx, by + dy, D / 2 + 0.015);
            group.add(rivet);
        }
    }

    // Central Antique Brass Medallion & Twin Pull Rings (中轴仿古双环铺首)
    const centralPlateGeom = new THREE.CylinderGeometry(0.09, 0.09, 0.02, 8);
    const centralPlate = new THREE.Mesh(centralPlateGeom, matAntiqueBrass);
    centralPlate.rotation.x = Math.PI / 2;
    centralPlate.position.set(0, 0, 0.038);
    group.add(centralPlate);

    const ringGeom = new THREE.TorusGeometry(0.045, 0.008, 8, 16);
    const leftRing = new THREE.Mesh(ringGeom, matAntiqueBrass);
    leftRing.position.set(-0.035, -0.04, 0.048);
    group.add(leftRing);

    const rightRing = new THREE.Mesh(ringGeom, matAntiqueBrass);
    rightRing.position.set(0.035, -0.04, 0.048);
    group.add(rightRing);

    return group;
}

const windowModel = buildChineseLatticeWindow();

const bbox = new THREE.Box3().setFromObject(windowModel);
const bsize = new THREE.Vector3();
bbox.getSize(bsize);
const bcenter = new THREE.Vector3();
bbox.getCenter(bcenter);

console.log('--- Oriental Lattice Window Specs (Centered) ---');
console.log('BBox Min:', bbox.min);
console.log('BBox Max:', bbox.max);
console.log('BBox Size:', bsize);
console.log('BBox Center:', bcenter);

const exporter = new GLTFExporter();
exporter.parse(
    windowModel,
    (gltf) => {
        const outPath = path.resolve(ASSETS_DIR, 'oriental-lattice-window.glb');
        fs.writeFileSync(outPath, Buffer.from(gltf));
        console.log(`Saved GLB to: ${outPath} (${fs.statSync(outPath).size} bytes)`);
    },
    (err) => {
        console.error('Export error:', err);
    },
    { binary: true }
);
