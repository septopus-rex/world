import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LEVEL_PATH = path.resolve(__dirname, '../../core/src/levels/terran_bunker_quad.level.json');

// 1. SPP Cells for 4-Linked Bunker (8x2 cells = 16 cells)
// Origin: [12.0, 8.0, 0.0]
// Spans X: 12..44m, Y: 8..16m
// Bay 1: (0..1, 0..1) -> center [16, 12]
// Bay 2: (2..3, 0..1) -> center [24, 12]
// Bay 3: (4..5, 0..1) -> center [32, 12]
// Bay 4: (6..7, 0..1) -> center [40, 12]

const cells = [];
for (let y = 0; y <= 1; y++) {
  for (let x = 0; x <= 7; x++) {
    const faces = [
      [0, "empty"],      // Top (0)
      [1, "deck_floor"], // Bottom (1): Continuous diamond steel floor
      [0, "empty"],      // South (2)
      [0, "empty"],      // North (3)
      [0, "empty"],      // West (4)
      [0, "empty"]       // East (5)
    ];

    // Front (South, Y=0): Continuous firing line
    if (y === 0) {
      if (x % 2 === 0) {
        faces[2] = [1, "firing_slit_wall"];
      } else {
        faces[2] = [1, "bunker_link_firing"]; // 横连射击狭缝
      }
    }

    // Rear (North, Y=1): Entrances and armor walls
    if (y === 1) {
      if (x === 1 || x === 5) {
        faces[3] = [0, "blast_portal"]; // Personnel blast entrances
      } else if (x === 2 || x === 6) {
        faces[3] = [1, "bunker_link_wall"]; // 横连加固外壁
      } else {
        faces[3] = [1, "armor_solid"];
      }
    }

    // West end (X=0)
    if (x === 0) {
      if (y === 0) faces[4] = [1, "firing_slit_wall"];
      if (y === 1) faces[4] = [1, "armor_solid"];
    }

    // East end (X=7)
    if (x === 7) {
      if (y === 0) faces[5] = [1, "firing_slit_wall"];
      if (y === 1) faces[5] = [1, "armor_solid"];
    }

    // Internal dividing faces between bays (横向互通大拱与防爆隔断)
    // Between Bay 1 and Bay 2: X=1 East
    if (x === 1 && y === 0) faces[5] = [0, "bunker_link_arch"];   // 横连大开间互通拱
    if (x === 1 && y === 1) faces[5] = [0, "bunker_link_portal"]; // 横连防爆隔断门
    
    // Between Bay 2 and Bay 3: X=3 East
    if (x === 3 && y === 0) faces[5] = [0, "bunker_link_arch"];
    if (x === 3 && y === 1) faces[5] = [0, "bunker_link_portal"];

    // Between Bay 3 and Bay 4: X=5 East
    if (x === 5 && y === 0) faces[5] = [0, "bunker_link_arch"];
    if (x === 5 && y === 1) faces[5] = [0, "bunker_link_portal"];

    // Internal division between front and rear row (Y=0 North)
    if (y === 0) {
      faces[3] = [0, "bunker_arch"];
    }

    cells.push({
      position: [x, y, 0],
      level: 0,
      faces
    });
  }
}

// 2. Roof SPP Cells (Origin: [12.0, 8.0, 3.6])
// Roof plates on Bay 1, 2, 4 + roof_dome_link across joints
// Bay 3 is left open/lifted for cutaway interior walkthrough view!
const roofCells = [];
for (let y = 0; y <= 1; y++) {
  for (let x = 0; x <= 7; x++) {
    // Leave Bay 3 (x=4, 5) open for interior cutaway
    if (x === 4 || x === 5) continue;

    let roofVariant = "roof_dome_plate";
    if (x === 1 || x === 3 || x === 6) {
      roofVariant = "roof_dome_link"; // 横连顶盖跨板
    }

    roofCells.push({
      position: [x, y, 0],
      level: 0,
      faces: [
        [1, roofVariant],
        [0, "empty"],
        [0, "empty"],
        [0, "empty"],
        [0, "empty"],
        [0, "empty"]
      ]
    });
  }
}

// 3. Modules (Interior Equipment & Lifted Roof for Bay 3)
const modules = [];

// Bay 3 lifted roof dome at [32.0, 12.0, 6.0]
modules.push([
  [6.76, 6.76, 1.86],
  [32.0, 12.0, 6.0],
  [0, 0, 0],
  144
]);

// 4 Bays interior equipment:
const bayCenters = [16.0, 24.0, 32.0, 40.0];
bayCenters.forEach((cx, idx) => {
  // Central Ammo Rotary Tower in each bay
  modules.push([
    [1.2, 1.2, 1.13],
    [cx, 12.0, 0.0],
    [0, 0, 0],
    145
  ]);

  // C-14 Heavy Gun Stations facing front firing slits (South)
  modules.push([
    [1.1, 0.9, 1.10],
    [cx - 1.2, 9.2, 0.0],
    [0, 0, 0],
    146
  ]);
  modules.push([
    [1.1, 0.9, 1.10],
    [cx + 1.2, 9.2, 0.0],
    [0, 0, 0],
    146
  ]);

  // Functional tactical gear per bay
  if (idx === 0) {
    // Bay 1: Stimpack station & escape hatch
    modules.push([[0.8, 0.5, 1.05], [cx - 2.2, 14.2, 0.0], [0, 0, 0], 149]);
    modules.push([[1.2, 1.2, 0.20], [cx - 2.2, 12.0, 0.0], [0, 0, 0], 150]);
  } else if (idx === 1) {
    // Bay 2: Periscope console & logistics console
    modules.push([[0.9, 0.7, 1.10], [cx + 2.2, 14.2, 0.0], [0, 3.14159, 0], 148]);
    modules.push([[1.2, 0.8, 0.75], [cx - 2.2, 14.2, 0.0], [0, 0, 0], 138]);
  } else if (idx === 2) {
    // Bay 3 (Cutaway): Armory rack & power core
    modules.push([[1.3, 0.6, 1.20], [cx - 2.2, 14.2, 0.0], [0, 0, 0], 125]);
    modules.push([[0.85, 0.65, 1.10], [cx + 2.2, 14.2, 0.0], [0, 0, 0], 151]);
  } else if (idx === 3) {
    // Bay 4: Med station & escape hatch
    modules.push([[0.8, 0.5, 1.05], [cx + 2.2, 14.2, 0.0], [0, 0, 0], 149]);
    modules.push([[1.2, 1.2, 0.20], [cx + 2.2, 12.0, 0.0], [0, 0, 0], 150]);
  }
});

// Front defensive obstacles & supply crates outside the 4-linked fortress
modules.push([[1.2, 0.8, 0.75], [20.0, 6.0, 0.0], [0, 0.4, 0], 138]);
modules.push([[1.2, 0.8, 0.75], [36.0, 6.0, 0.0], [0, -0.4, 0], 138]);
modules.push([[1.6, 1.6, 1.80], [28.0, 4.0, 0.0], [0, 0, 0], 121]); // Radar Dish outpost

const levelData = {
  format: "septopus.world.level",
  version: 1,
  name: "terran_bunker_quad",
  start: {
    block: [2048, 2048],
    position: [28.0, 2.0, 1.5],
    rotation: [0, 0, 0]
  },
  blocks: [
    {
      x: 2048,
      y: 2048,
      raw: [
        0,
        1,
        [
          // 1. Broad Foundation Plate (56m x 36m, center [28, 14])
          [
            162,
            [
              [
                [56, 36, 0.2],
                [28, 14, -0.1],
                [0, 0, 0],
                0,
                [14, 9],
                0,
                1,
                96
              ]
            ]
          ],
          // 2. 4-Linked Bunker SPP (8x2 cells = 16 cells, origin [12, 8, 0])
          [
            182,
            [
              [
                [12, 8, 0],
                cells,
                "terran_bunker"
              ]
            ]
          ],
          // 3. Continuous Roof SPP (origin [12, 8, 3.6])
          [
            182,
            [
              [
                [12, 8, 3.6],
                roofCells,
                "terran_bunker_roof"
              ]
            ]
          ],
          // 4. Modules: 4 Bays Equipment + Radar Outpost + Crates
          [
            164,
            modules
          ]
        ]
      ]
    }
  ]
};

fs.writeFileSync(LEVEL_PATH, JSON.stringify(levelData, null, 2), 'utf8');
console.log(`Generated ${LEVEL_PATH} with ${cells.length} SPP cells, ${roofCells.length} roof cells, and ${modules.length} modules.`);
