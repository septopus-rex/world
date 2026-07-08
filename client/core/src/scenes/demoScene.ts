
/**
 * demoScene — the demo ASSET MANIFEST + ids. The showcase CONTENT (model
 * instances, textured boxes, the trigger court, items, the SPP hut, A/V, book)
 * is FROZEN DATA at src/blocks/demo.block.json — block-relative trigger targets
 * make it position-independent, so the spawn block, the stamp dev-tool and the
 * world-hub embed all serve clones of that one file (full-data-migration.md
 * P2-③; the old injectDemoAssets/buildDemoScene TS builders are retired).
 *
 * Demo fixtures live in client/desktop/public/assets, wired through the
 * model/texture pipeline so `npm run dev` shows real network-loaded models +
 * textures. Each model file is loaded ONCE and instanced per placement; textures
 * are shared.
 */

export const DEMO_BLOCK: [number, number] = [2048, 2048];
export const DEMO_TEXTURE_ID = 7;  // checker texture
export const DEMO_AVATAR_ID = 30;  // legacy single-clip avatar (旅者; selectable)
export const DEFAULT_AVATAR_ID = 33; // boot default — soldier (Idle/Run/Walk)

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
/** Deploy-base-aware asset path: vite injects BASE_URL ('/' locally, '/world/'
 *  on GitHub Pages — deploy/RELEASE.md §6). Bare absolute '/assets/…' would 404
 *  the whole demo catalog under a sub-path deploy. */
const asset = (p: string) => import.meta.env.BASE_URL.replace(/\/$/, '') + p;

export const DEMO_ASSETS: DemoAsset[] = [
    // World block-ground baselines (WorldConfigs block.texture): 1 = forest (Normal),
    // 5 = moon (GhostMoon). Tiled across the 16 m ground via the record repeat.
    { id: 1, type: 'texture', format: 'png', src: asset('/assets/ground-forest.png'), repeat: [8, 8] },
    { id: 5, type: 'texture', format: 'png', src: asset('/assets/ground-moon.png'), repeat: [8, 8] },
    { id: DEMO_TEXTURE_ID, type: 'texture', format: 'png', src: asset('/assets/checker.png'), repeat: [1, 1] },
    { id: 27, type: 'module', format: 'gltf', src: asset('/assets/pyramid.gltf') },
    { id: 28, type: 'module', format: 'glb', src: asset('/assets/helmet.glb') },
    { id: 29, type: 'module', format: 'glb', src: asset('/assets/fox.glb') },
    { id: DEMO_AVATAR_ID, type: 'avatar', format: 'glb', src: asset('/assets/avatar.glb') },
    // Selectable avatars (frontend picker). Sources: three.js example models —
    // soldier (Mixamo rig; clips Idle/Run/Walk = the NORMATIVE name-equality
    // contract) and RobotExpressive by Tomás Laulhé, CC0 (clips Idle/Walking/
    // Running/Jump = the LEGACY substring heuristics + air mapping).
    { id: 33, type: 'avatar', format: 'glb', src: asset('/assets/soldier.glb') },
    { id: 34, type: 'avatar', format: 'glb', src: asset('/assets/robot.glb') },
    { id: 31, type: 'audio', format: 'wav', src: asset('/assets/ding.wav') },
    // Video screen source (e3). Local + same-origin → no CORS issue for the
    // VideoTexture. Not shipped (no binary in the repo): drop ANY .mp4 here to
    // see it play; without the file the panel just renders dark (graceful).
    // Or swap src for a CORS-enabled URL / a CID. NOT YouTube (spec §9).
    { id: 32, type: 'video', format: 'mp4', src: asset('/assets/sample.mp4') },
];
