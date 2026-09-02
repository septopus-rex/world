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

function exportToGlb(object, filename) {
    const exporter = new GLTFExporter();
    exporter.parse(
        object,
        (gltf) => {
            const outPath = path.resolve(ASSETS_DIR, filename);
            fs.writeFileSync(outPath, Buffer.from(gltf));
            console.log(`Saved ${filename} (${fs.statSync(outPath).size} bytes) -> ${outPath}`);
        },
        (err) => {
            console.error(`Export error for ${filename}:`, err);
        },
        { binary: true }
    );
}

// 1. Cyber Hydraulic Pillar (ID 82: /assets/cyber-pillar.glb)
function buildCyberPillar() {
    const group = new THREE.Group();
    group.name = 'CyberHydraulicPillar';

    const matDarkSteel = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.35, metalness: 0.85 });
    const matChromeRod = new THREE.MeshStandardMaterial({ color: 0xe8ecf0, roughness: 0.12, metalness: 0.98 });
    const matGunmetal = new THREE.MeshStandardMaterial({ color: 0x363d45, roughness: 0.4, metalness: 0.75 });
    const matHazardBand = new THREE.MeshStandardMaterial({ color: 0xf5a623, roughness: 0.5, metalness: 0.2 });
    const matEmissiveCyan = new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00c4e6,
        emissiveIntensity: 1.5,
        roughness: 0.2,
        metalness: 0.1,
    });
    const matConduit = new THREE.MeshStandardMaterial({ color: 0x181a1d, roughness: 0.6, metalness: 0.5 });

    // Base (y: 0 -> 0.35)
    const baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.35, 8), matDarkSteel);
    baseMesh.position.y = 0.175;
    group.add(baseMesh);

    const collarMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.10, 8), matGunmetal);
    collarMesh.position.y = 0.40;
    group.add(collarMesh);

    for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4 + Math.PI / 8;
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 6), matChromeRod);
        bolt.position.set(Math.cos(angle) * 0.38, 0.36, Math.sin(angle) * 0.38);
        group.add(bolt);
    }

    // Chrome rod & sleeves (y: 0.45 -> 2.35)
    const rodMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 2.0, 16), matChromeRod);
    rodMesh.position.y = 1.40;
    group.add(rodMesh);

    const sleeveLowerMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.80, 12), matGunmetal);
    sleeveLowerMesh.position.y = 0.85;
    group.add(sleeveLowerMesh);

    const sleeveUpperMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.80, 12), matGunmetal);
    sleeveUpperMesh.position.y = 1.95;
    group.add(sleeveUpperMesh);

    const centerRingMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.14, 16), matHazardBand);
    centerRingMesh.position.y = 1.40;
    group.add(centerRingMesh);

    // Conduits
    for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        const cx = Math.cos(angle) * 0.27;
        const cz = Math.sin(angle) * 0.27;

        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.95, 8), matConduit);
        pipe.position.set(cx, 1.40, cz);
        group.add(pipe);

        const indLower = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.25, 0.02), matEmissiveCyan);
        indLower.position.set(cx * 1.15, 0.85, cz * 1.15);
        group.add(indLower);

        const indUpper = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.25, 0.02), matEmissiveCyan);
        indUpper.position.set(cx * 1.15, 1.95, cz * 1.15);
        group.add(indUpper);
    }

    // Clamps
    for (const py of [0.60, 1.10, 1.70, 2.20]) {
        const clampMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.06, 16), matDarkSteel);
        clampMesh.position.y = py;
        group.add(clampMesh);
    }

    // Top cap (y: 2.35 -> 2.80)
    const topCollarMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.10, 8), matGunmetal);
    topCollarMesh.position.y = 2.40;
    group.add(topCollarMesh);

    const topCapMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.42, 0.35, 8), matDarkSteel);
    topCapMesh.position.y = 2.625;
    group.add(topCapMesh);

    for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4 + Math.PI / 8;
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 6), matChromeRod);
        bolt.position.set(Math.cos(angle) * 0.38, 2.44, Math.sin(angle) * 0.38);
        group.add(bolt);
    }

    return group;
}

// 2. Dungeon Bastion Pillar (ID 83: /assets/dungeon-bastion.glb)
function buildDungeonBastion() {
    const group = new THREE.Group();
    group.name = 'DungeonBastionPillar';

    const matDarkStone = new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.88, metalness: 0.12 });
    const matWeatheredStone = new THREE.MeshStandardMaterial({ color: 0x62666d, roughness: 0.82, metalness: 0.15 });
    const matIronBand = new THREE.MeshStandardMaterial({ color: 0x2b2927, roughness: 0.55, metalness: 0.70 });
    const matIronSpike = new THREE.MeshStandardMaterial({ color: 0x1f1e1d, roughness: 0.40, metalness: 0.80 });

    // Stepped plinth (y: 0 -> 0.40)
    const baseBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.48, 0.20, 8), matDarkStone);
    baseBottom.position.y = 0.10;
    group.add(baseBottom);

    const baseStep = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.44, 0.20, 8), matWeatheredStone);
    baseStep.position.y = 0.30;
    group.add(baseStep);

    // Rusticated courses (y: 0.40 -> 2.30)
    const courseCount = 6;
    const courseHeight = 1.90 / courseCount;
    for (let i = 0; i < courseCount; i++) {
        const yCenter = 0.40 + (i + 0.5) * courseHeight;
        const r = (i % 2 === 0) ? 0.35 : 0.33;
        const courseMesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, courseHeight * 0.94, 12), (i % 2 === 0) ? matWeatheredStone : matDarkStone);
        courseMesh.position.y = yCenter;
        group.add(courseMesh);
    }

    // Iron bands & rivets
    for (const py of [0.75, 1.35, 1.95]) {
        const ringMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.365, 0.365, 0.08, 16), matIronBand);
        ringMesh.position.y = py;
        group.add(ringMesh);

        for (let j = 0; j < 8; j++) {
            const angle = (j * Math.PI) / 4;
            const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), matIronSpike);
            rivet.position.set(Math.cos(angle) * 0.375, py, Math.sin(angle) * 0.375);
            group.add(rivet);
        }
    }

    // Vertical stone pilaster ribs
    for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        const ribMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.80, 0.08), matDarkStone);
        ribMesh.position.set(Math.cos(angle) * 0.33, 1.35, Math.sin(angle) * 0.33);
        ribMesh.rotation.y = angle;
        group.add(ribMesh);
    }

    // Corbel capital (y: 2.30 -> 2.80)
    const corbelMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.36, 0.20, 8), matWeatheredStone);
    corbelMesh.position.y = 2.40;
    group.add(corbelMesh);

    const abacusMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.44, 0.30, 8), matDarkStone);
    abacusMesh.position.y = 2.65;
    group.add(abacusMesh);

    return group;
}

exportToGlb(buildCyberPillar(), 'cyber-pillar.glb');
exportToGlb(buildDungeonBastion(), 'dungeon-bastion.glb');
