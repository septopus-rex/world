
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
const asset = (p: string) => {
    // Chain boot (boot-chain.md §3): the ROOT loader injects the content
    // gateway origin — assets then resolve via the gateway's /assets/<file>
    // route (name index → CAS blobs). Dev/PWA keeps the vite BASE_URL path.
    const chainBase = (globalThis as any).__SEPTOPUS_ASSET_BASE__;
    const base = typeof chainBase === 'string' ? chainBase : import.meta.env.BASE_URL;
    return base.replace(/\/$/, '') + p;
};

// The manifest is DATA (src/assets/demo.manifest.json — resource.md §6's dev
// registry, base-data-audit D4): id/type/format/path(+repeat). Only the
// deploy-base resolution stays code (path → src via asset(), which is
// environment, not content). Notes that used to live inline:
//   · texture 1 = forest / 5 = moon (block-ground baselines, WorldConfigs)
//   · avatars: soldier 33 = normative clip-name contract, robot 34 = legacy
//     heuristics (protocol avatar-animation.md); video 32 = drop any .mp4.
import demoManifestJson from '../assets/demo.manifest.json';
export const DEMO_ASSETS: DemoAsset[] = (demoManifestJson as any[]).map((a) => ({
    id: a.id, type: a.type, format: a.format, src: asset(a.path),
    ...(a.repeat ? { repeat: a.repeat as [number, number] } : {}),
}));
