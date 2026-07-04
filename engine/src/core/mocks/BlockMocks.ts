import { AdjunctType } from '../types/AdjunctType';
import { normalizeBlockRaw } from '../protocol/BlockRaw';
/**
 * BlockMocks.ts
 *
 * Provides mock block data in the CANONICAL Septopus block raw format
 * (5-slot: [elevation, status, adjuncts, animations, game]; see
 * core/protocol/BlockRaw.ts). The `{x,y,raw}` wrapper is a legacy addressing
 * shape unwrapped at the single seam (DesktopLoader.sceneBlock → `.raw`); the
 * SceneProvider contract itself is the bare canonical raw.
 */

export function MockBlockData(x: number, y: number): any {
    // 0. Animation Library (Shared for the block)
    const animations = [
        {               // Animation Index 1
            name: "BatonSpin",
            duration: 2000,
            loops: 0,
            timeline: [
                {
                    time: [0, 2000],
                    type: "rotate",
                    axis: "Y",
                    mode: "add",
                    value: Math.PI * 2
                }
            ]
        },
        {               // Animation Index 2: Floating/Hovering
            name: "HoverFlow",
            duration: 3000,
            loops: 0,
            timeline: [
                {
                    time: [0, 3000],
                    type: "move",
                    axis: "Z", // Septopus Alt
                    mode: "set",
                    value: [4, 4.5, 4]
                }
            ]
        },
        {               // Animation Index 3: Flashing Alert
            name: "AlertFlash",
            duration: 1000,
            loops: 0,
            timeline: [
                {
                    time: [0, 1000],
                    type: "color",
                    mode: "set",
                    value: [0xff0000, 0xffffff, 0xff0000]
                }
            ]
        }
    ];

    const adjunctsRaw: any[] = [];

    // 1. Pillars & Baton — animation showcase, ONE copy only (spawn block).
    //    Repeating this trio on every block just cluttered the world.
    //    The spinning baton pillar MUST NOT overlap the [8,8] spawn: it is a
    //    solid whose collider tracks the animation per frame, so a player
    //    spawning inside its sweep gets shoved/wedged (the old "spawn pad on
    //    the pillar top" choreography died with the sub-step AABB collider —
    //    it cannot stand a 1×1 player on a spinning 0.4×0.4 cap). It now
    //    spins on clear ground SE of spawn, between the hut and the items.
    if (x === 2048 && y === 2048) {
        const pillars: any[] = [
            // [size, pos, rot, resId, repeat, animation_index, stop]
            [
                [0.4, 0.4, 6],   // Size
                [11.5, 6.5, 3],  // Position — SE showcase spot, clear of spawn
                [0, 0, 0],       // Rotation
                1,              // ResId
                [1, 1],         // Repeat
                1,              // Animation Index (references animations[0])
                1               // Stop (solid, animated — collider tracks the spin)
            ],
            // Floating Box
            [
                [1, 1, 1],      // Size
                [10, 8, 4],     // Position
                [0, 0, 0],       // Rotation
                2,
                [1, 1],
                2,              // HoverFlow
                0
            ],
            // Flashing Box
            [
                [0.5, 0.5, 0.5],// Size
                [6, 8, 4],      // Position
                [0, 0, 0],
                3,
                [1, 1],
                3,              // AlertFlash
                0
            ]
        ];
        adjunctsRaw.push([AdjunctType.Box, pillars]);
    }

    // 2. Light sources — only on 2 blocks near spawn (2048,2048)
    if ((x === 2048 && y === 2048) || (x === 2049 && y === 2048)) {
        const lights: any[] = [
            // Warm point light above the pillar
            [0, [8, 8, 8], [0, 0, 0], 0xffaa44, 2, 20, 0, 0],
        ];
        if (x === 2049) {
            // Cool spot light on the adjacent block
            lights[0] = [1, [8, 8, 10], [0, 0, 0], 0x4488ff, 3, 25, Math.PI / 4, 0];
        }
        adjunctsRaw.push([AdjunctType.Light, lights]);
    }

    // 3. Solid Ground Block
    // Form a single 16x16 plane instead of tiles for a cleaner "ground" look
    const ground: any[] = [];
    ground.push([
        [16, 16, 0.2],        // Size (Full 16x16 block)
        [8, 8, -0.1],         // Position (Centered)
        [0, 0, 0],            // Rotation
        10,                   // ResId (Green)
        [4, 4],               // Repeat (Texture repeat for tiling look)
        0,                    // Animation
        0,                    // Stop
        1                     // Texture id (world block baseline) — resolved via IPFS
    ]);
    adjunctsRaw.push([AdjunctType.Box, ground]);

    return {
        x,
        y,
        // Canonical 5-slot (game=0: these mock blocks are not playable zones).
        // normalizeBlockRaw pads the game slot and sorts adjunct groups by typeId.
        raw: normalizeBlockRaw([
            0, // elevation
            1, // status
            adjunctsRaw,
            animations
        ])
    };
}

export async function fetchMockBlock(x: number, y: number): Promise<any> {
    return MockBlockData(x, y);
}
