/**
 * BlockMocks.ts
 * 
 * Provides mock block data in the native Septopus raw format.
 * Format: [elevation, status, adjuncts_list, animations_library]
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
                    axis: "Z", // SPP Alt
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

    // 1. Pillars & Baton
    const pillars: any[] = [
        // [size, pos, rot, resId, repeat, animation_index, stop]
        [
            [0.4, 0.4, 6],   // Size
            [8, 8, 3],       // Position
            [0, 0, 0],       // Rotation
            1,              // ResId
            [1, 1],         // Repeat
            1,              // Animation Index (references animations[0])
            0               // Stop
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
    adjunctsRaw.push([0x00a2, pillars]);

    // 2. Solid Ground Block
    // Form a single 16x16 plane instead of tiles for a cleaner "ground" look
    const ground: any[] = [];
    ground.push([
        [16, 16, 0.2],        // Size (Full 16x16 block)
        [8, 8, -0.1],         // Position (Centered)
        [0, 0, 0],            // Rotation
        10,                   // ResId (Green)
        [4, 4],               // Repeat (Texture repeat for tiling look)
        0,                    // Animation
        0                     // Stop
    ]);
    adjunctsRaw.push([0x00a2, ground]);

    return {
        x,
        y,
        raw: [
            0, // elevation
            1, // status
            adjunctsRaw,
            animations
        ]
    };
}

export async function fetchMockBlock(x: number, y: number): Promise<any> {
    return MockBlockData(x, y);
}
