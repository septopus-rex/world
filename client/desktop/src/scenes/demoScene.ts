import { MockBlockData } from '@engine/core/mocks/BlockMocks';
import { AdjunctType } from '@engine/core/types/AdjunctType';

/**
 * demoScene — the showcase world content (spawn block): model instances, textured
 * boxes, the interactive trigger court, pickable items, and an SPP hut. Extracted
 * out of DesktopLoader so the loader stays a thin IDataSource + bridge; adding or
 * changing world content happens here, not in the loader.
 *
 * Demo fixtures live in client/desktop/public/assets, wired through the
 * model/texture pipeline so `npm run dev` shows real network-loaded models +
 * textures. Each model file is loaded ONCE and instanced per placement; textures
 * are shared.
 */

export const DEMO_BLOCK: [number, number] = [2048, 2048];
export const DEMO_TEXTURE_ID = 7;  // checker texture
export const DEMO_AVATAR_ID = 30;  // rigged human avatar

/**
 * Demo content's source assets — the SEED for the IPFS content store (the mock
 * "ipfs add ./file"). At boot these `src` files are ingested into the CAS and
 * thereafter addressed by CID; module()/texture() serve those CIDs, never paths.
 * So this is the content MANIFEST, not a resolution path baked into the
 * datasource. Real Khronos samples (helmet = complex PBR; fox = rigged/animated).
 */
export interface DemoAsset {
    id: number;
    type: 'module' | 'avatar' | 'audio' | 'texture' | 'video';
    format: string;
    src: string;                  // seed path under public/assets (CAS ingest source)
    repeat?: [number, number];    // texture-only
}
export const DEMO_ASSETS: DemoAsset[] = [
    // World block-ground baselines (WorldConfigs block.texture): 1 = forest (Normal),
    // 5 = moon (GhostMoon). Tiled across the 16 m ground via the record repeat.
    { id: 1, type: 'texture', format: 'png', src: '/assets/ground-forest.png', repeat: [8, 8] },
    { id: 5, type: 'texture', format: 'png', src: '/assets/ground-moon.png', repeat: [8, 8] },
    { id: DEMO_TEXTURE_ID, type: 'texture', format: 'png', src: '/assets/checker.png', repeat: [1, 1] },
    { id: 27, type: 'module', format: 'gltf', src: '/assets/pyramid.gltf' },
    { id: 28, type: 'module', format: 'glb', src: '/assets/helmet.glb' },
    { id: 29, type: 'module', format: 'glb', src: '/assets/fox.glb' },
    { id: DEMO_AVATAR_ID, type: 'avatar', format: 'glb', src: '/assets/avatar.glb' },
    { id: 31, type: 'audio', format: 'wav', src: '/assets/ding.wav' },
    // Video screen source (e3). Local + same-origin → no CORS issue for the
    // VideoTexture. Not shipped (no binary in the repo): drop ANY .mp4 here to
    // see it play; without the file the panel just renders dark (graceful).
    // Or swap src for a CORS-enabled URL / a CID. NOT YouTube (spec §9).
    { id: 32, type: 'video', format: 'mp4', src: '/assets/sample.mp4' },
];

/**
 * Splice a few model instances + textured boxes + the trigger court into a block.
 * The 3 pyramids share ONE model file (load-once, instance-many); the wall + floor
 * slab share ONE texture (shared by reference, tiled by size-derived UVs).
 * Mutates `data` (a MockBlockData result) in place.
 */
export function injectDemoAssets(data: any): void {
    // [size, offset, rot, RESOURCE_ID, animate, stop]. oz lifts the base just
    // above ground (avoids coplanar z-fighting). Box size is matched to each
    // model's natural aspect so the per-axis scale-to-fit stays ~uniform (no
    // stretching) — pyramids are symmetric; helmet ≈ cubic; fox is elongated.
    // rot = [pitch(x), YAW(y, around vertical), roll(z)] — distinct yaw per
    // instance so you can see rotation correctly applied to loaded models and
    // view each from a different side. Applied AFTER scale-to-fit, so an
    // aspect-matched (≈uniform) model rotates cleanly with no shear.
    const Y = Math.PI;
    // Adjunct action targets are block-absolute stable ids
    // (adj_{x}_{y}_{typeIdDec}_{idx}). Derive them from THIS block so the
    // scene's triggers/doors work wherever it is stamped — not just the spawn
    // block. (Stamping the demo elsewhere is the "import test scene" tool.)
    const bx = data.x, by = data.y;
    const aid = (typeDec: number, idx: number) => `adj_${bx}_${by}_${typeDec}_${idx}`;
    const modules = [
        // 3 pyramids share one .gltf (load-once, instance-many) — south row,
        // keeping the north half of the block clear for the trigger court.
        [[2, 2, 3], [3, 1.2, 1.55], [0, 0.4, 0], 27, 0, 0],
        [[2, 2, 3], [8, 1.2, 1.55], [0, Y / 4, 0], 27, 0, 0],
        [[2, 2, 3], [13, 1.2, 1.55], [0, -0.6, 0], 27, 0, 0],
        // 2 damaged helmets (complex PBR) share one .glb — aspect ≈ cubic
        [[3.15, 3.33, 3.0], [6, 3, 1.55], [0, 0.6, 0], 28, 0, 0],
        [[3.15, 3.33, 3.0], [10, 3, 1.55], [0, -Y / 3, 0], 28, 0, 0],
        // 2 foxes (rigged) share one .glb — aspect ~1 : 6 : 3 (W:N:Alt)
        [[0.64, 3.92, 2.0], [2, 6, 1.05], [0, Y / 2, 0], 29, 0, 0],
        [[0.64, 3.92, 2.0], [14, 8, 1.05], [0, Y, 0], 29, 0, 0],
    ];
    const texturedBoxes = [
        // [size, pos, rot, colorIdx, repeat, animate, stop, TEXTURE_ID]
        [[6, 0.3, 4], [12, 5, 2], [0, 0, 0], 0, [1, 1], 0, 0, DEMO_TEXTURE_ID],     // wall
        [[6, 6, 0.3], [3, 4, 0.15], [0, 0, 0], 0, [1, 1], 0, 0, DEMO_TEXTURE_ID],   // floor slab
    ];
    // Stop adjuncts (colliders). Format: [size, offset, rot, mode, animate]
    // SPP coords: X=East Y=North Z=Alt. This wall sits at N=5, E=1..15,
    // south of the spawn pillar — the southern showcase stays fenced off.
    const stops = [
        [[14, 0.4, 2.5], [8, 5, 1.25], [0, 0, 0], 1, 0],
    ];
    data.raw[2].push([AdjunctType.Module, modules]);
    data.raw[2].push([AdjunctType.Box, texturedBoxes]);
    data.raw[2].push([AdjunctType.Stop, stops]);

    // ── A/V media adjuncts (spec: av-media-adjuncts.md) ──────────────────
    // e3 video screen: a 16:9 panel on the south wall facing the court, source
    //   32 → /assets/sample.mp4 (autoplay+loop+muted; renders dark until a file
    //   is dropped). e2 audio emitter: a small marker looping the ding sound
    //   (source 31) — audible once the AudioContext unlocks on first click.
    // audio raw: [size, pos, rot, source, autoplay, loop, volume, refDistance]
    // video raw: [size, pos, rot, source, autoplay, loop, muted, volume]
    const audioEmitters = [
        [[0.4, 0.4, 0.4], [11, 2, 1], [0, 0, 0], 31, 1, 1, 0.7, 10],
    ];
    const videoScreens = [
        [[3.6, 0.1, 2.0], [8, 1.5, 2.6], [0, 0, 0], 32, 1, 1, 1, 1],
    ];
    data.raw[2].push([AdjunctType.Audio, audioEmitters]);
    data.raw[2].push([AdjunctType.Video, videoScreens]);

    // ── Trigger court (north half of the spawn block) ────────────────────
    // Interactive trigger test scene; everything gives VISIBLE feedback via
    // adjunct actions and writes a flag the e2e suite can assert.
    // gameOnly=0 everywhere so it runs in Normal (browse) mode.
    //
    // adjunct action targets use the stable id adj_{x}_{y}_{typeIdDec}_{idx}:
    // a1 wall=161, a6 cone=166, a7 ball=167.

    // Reactors (visible objects the triggers manipulate):
    const walls = [
        // #0 auto door (adj_2048_2048_161_0): slides up when the player stands
        //    on the blue pad, slides back when they leave (airlock feel).
        [[4, 0.4, 3], [8, 13, 1.5], [0, 0, 0], 0, [1, 1], 0, 1],
        // #1 conditional door (adj_2048_2048_161_1): only opens if the cone
        //    button was touched first (flags.demo_touch) — opens once.
        [[3, 0.4, 3], [14, 14, 1.5], [0, 0, 0], 0, [1, 1], 0, 1],
        // #2 key door (adj_2048_2048_161_2): opens once when the player walks
        //    up CARRYING the key item (inventory.tpl_2 — pick it up first).
        [[3, 0.4, 3], [2, 14, 1.5], [0, 0, 0], 0, [1, 1], 0, 1],
    ];
    // Pickable items (b5): [pos, templateId, seed, count, rot]. Click to pick
    // up (Normal/Game mode); the bag panel lists them; drop puts them back.
    const items = [
        [[5, 8, 0.6], 1, 9347, 1, [0, 0, 0]],     // gem (unique, seed-derived rarity)
        [[6.5, 8, 0.6], 1, 777, 1, [0, 0, 0]],    // another gem, different roll
        [[12, 8, 0.5], 2, 0, 1, [0, 0, 0]],       // the KEY for door #2
        [[13.5, 8, 0.5], 3, 41, 2, [0, 0, 0]],    // 2 potions (stackable)
    ];
    const cones = [
        // touch button (adj_2048_2048_166_0): each click spins it visibly.
        [[1.2, 1.2, 1.6], [12, 10.5, 0.8], [0, 0, 0], 0, [1, 1], 0, 0],
    ];
    const balls = [
        // hold-lift ball (adj_2048_2048_167_0): rises while you camp the pad.
        // stop=1: standable — jump on and ride it up (moving-platform carry).
        [[1, 1, 1], [3, 12, 3], [0, 0, 0], 0, [1, 1], 0, 1],
    ];
    // Floor pads marking each invisible volume (colors from basic_box palette:
    // 1 dark-gray, 2 blue, 3 red).
    const markers = [
        [[4, 4.5, 0.05], [8, 11.25, 0.1], [0, 0, 0], 2, [1, 1], 0, 0],   // blue: auto door
        [[3, 3, 0.05], [3, 10.5, 0.1], [0, 0, 0], 3, [1, 1], 0, 0],      // red: hold lift
        [[2.2, 2, 0.05], [14.2, 12, 0.1], [0, 0, 0], 1, [1, 1], 0, 0],   // gray: conditional door
    ];
    data.raw[2].push([AdjunctType.Wall, walls]);
    data.raw[2].push([AdjunctType.Item, items]);

    // String-particle hut (b6): two 4m cells expanded by the engine into
    // standard walls + a cell trigger. Faces are [state, variant] in
    // ParticleFace order [Top, Bottom, Front(S), Back(N), Left(W), Right(E)];
    // state 1=Closed 0=Open; closed variants: 0 solid · 1 doorway · 2 window.
    // Cell A: window south, sealed elsewhere, open passage east to B.
    // Cell B: doorway north (player side), interior trigger sets spp_hut.
    const particles = [
        [[1, 2.5, 0], [
            {
                position: [0, 0, 0], level: 0,
                faces: [[1, 0], [0, 0], [1, 2], [1, 0], [1, 0], [0, 0]],
            },
            {
                position: [1, 0, 0], level: 0,
                faces: [[1, 0], [0, 0], [1, 0], [1, 1], [0, 0], [1, 0]],
                trigger: [
                    { type: 'in', actions: [{ type: 'flag', method: '', target: 'spp_hut', params: [true] }] },
                ],
            },
        ], 'basic'],
    ];
    data.raw[2].push([AdjunctType.Particle, particles]);
    data.raw[2].push([AdjunctType.Cone, cones]);
    data.raw[2].push([AdjunctType.Ball, balls]);
    data.raw[2].push([AdjunctType.Box, markers]);

    // Trigger volumes (b8). Row format: [size, offset, rot, shape, gameOnly, events].
    const triggers = [
        // ① auto door pad (blue): in→open+demo_gate, out→close, hold 800ms→demo_hold.
        //    Tall (alt 0..6): the player descends from the 6m spawn pillar while
        //    walking north, so the volume must catch a falling crossing too.
        //    Deep (N 9..13.5): reaches past the door line so it stays open
        //    while you walk through.
        [[4, 4.5, 6], [8, 11.25, 3], [0, 0, 0], 1, 0, [
            {
                type: 'in', actions: [
                    { type: 'adjunct', target: aid(161, 0), method: 'moveZ', params: [3.2] },
                    { type: 'flag', method: '', target: 'demo_gate', params: [true] },
                ]
            },
            {
                type: 'out', actions: [
                    { type: 'adjunct', target: aid(161, 0), method: 'moveZ', params: [-3.2] },
                    { type: 'flag', method: '', target: 'demo_gate', params: [false] },
                ]
            },
            {
                type: 'hold', holdDuration: 800, actions: [
                    { type: 'flag', method: '', target: 'demo_hold', params: [true] },
                ]
            },
        ]],
        // ② touch button: clicking the (invisible) volume around the cone spins
        //    it and sets demo_touch — which also arms the conditional door.
        //    Top at alt 3.2: the first-person eye ray sits at ~2.6 (player
        //    0.9 + 1.7), so the volume must reach above it to catch a level
        //    center-screen click.
        [[2, 2, 3.2], [12, 10.5, 1.6], [0, 0, 0], 1, 0, [
            {
                type: 'touch', actions: [
                    { type: 'adjunct', target: aid(166, 0), method: 'rotateY', params: [0.8] },
                    { type: 'flag', method: '', target: 'demo_touch', params: [true] },
                    { type: 'sound', target: 31, method: 'play', params: [0.8] },
                ]
            },
        ]],
        // ③ hold-lift pad (red): camp 1.5s and the ball rises one notch;
        //    leave + re-enter to lift again (hold re-arms per stay).
        [[3, 3, 4], [3, 10.5, 2], [0, 0, 0], 1, 0, [
            {
                type: 'hold', holdDuration: 1500, actions: [
                    { type: 'adjunct', target: aid(167, 0), method: 'moveZ', params: [0.8] },
                    { type: 'flag', method: '', target: 'demo_lift', params: [true] },
                ]
            },
        ]],
        // ④ conditional door pad (gray): JSONLogic gate on demo_touch; opens the
        //    far door ONCE (oneTime) — fallback just logs until the button is hit.
        [[2.2, 2, 4], [14.2, 12, 2], [0, 0, 0], 1, 0, [
            {
                type: 'in', oneTime: true,
                conditions: { '==': [{ var: 'flags.demo_touch' }, true] },
                actions: [
                    { type: 'adjunct', target: aid(161, 1), method: 'moveZ', params: [3.2] },
                    { type: 'flag', method: '', target: 'demo_chain', params: [true] },
                ],
                fallbackActions: [
                    { type: 'system', method: 'log', target: '', params: ['conditional door: touch the cone button first (demo_touch)'] },
                ]
            },
        ]],
        // ⑤ key door pad: opens door #2 ONCE if the player carries the key
        //    item (inventory.tpl_2 ≥ 1 — pick it up at [12, 8] first).
        [[3, 2.5, 4], [2, 12.5, 2], [0, 0, 0], 1, 0, [
            {
                type: 'in', oneTime: true,
                conditions: { '>=': [{ var: 'inventory.tpl_2' }, 1] },
                actions: [
                    { type: 'adjunct', target: aid(161, 2), method: 'moveZ', params: [3.2] },
                    { type: 'flag', method: '', target: 'demo_key_door', params: [true] },
                ],
                fallbackActions: [
                    { type: 'system', method: 'log', target: '', params: ['key door: pick up the key first (inventory.tpl_2)'] },
                ]
            },
        ]],
    ];
    data.raw[2].push([AdjunctType.Trigger, triggers]);
}

/** Full standalone block raw for the demo showcase, authored for ANY block
 *  (adjunct ids rebased to bx,by). Shared by the spawn block and the
 *  "import test scene" stamp. */
export function buildDemoScene(bx: number, by: number): any[] {
    const data = MockBlockData(bx, by);
    injectDemoAssets(data);
    return data.raw;
}
