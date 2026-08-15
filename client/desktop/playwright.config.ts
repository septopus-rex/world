import { defineConfig, devices } from '@playwright/test';

/**
 * L4 browser/visual tests for the desktop 3D client.
 * Runs the real Vite dev server in headless Chromium with software WebGL
 * (SwiftShader) so the 3D canvas renders without a GPU.
 */
export default defineConfig({
  testDir: './e2e',
  // 180s per test. This suite is the HEAVIEST of the three (mobile and editor sit
  // at 120s) because every test boots the whole world — a real block stream plus
  // SwiftShader's PBR shader compile burst — before it asserts anything.
  //
  // At the old 90s the margin had gone negative on a COLD run: the three
  // editor-platform tests take ~45–50 s once Vite's dep cache is warm, but
  // 1.5–1.8 min on the first run after a cold start, and there all three failed
  // on time alone — including two that had nothing wrong with them (2026-08-14).
  // COLD is the case to size against: CI and the nightly cron are always cold, so
  // a limit tuned on a warm local re-run is a limit that only ever fires on the
  // machine you cannot watch. A timeout that fires on healthy tests is worse than
  // a loose one — it trains you to re-run rather than to read the failure.
  //
  // It is still a HANG detector, not a budget: nothing here should legitimately
  // approach 3 minutes. A test creeping toward it is telling you it now waits on
  // something it did not before — find that, don't raise this again.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:7777',
    // Cheap render tier for the whole suite (WorldContent.withRenderTier): no sun
    // shadow map, no sky IBL. NOT a quality opinion — both add shader
    // PERMUTATIONS, and SwiftShader compiles each PBR program in seconds, which
    // is already the suite's dominant cost (see waitForWorldReady's note on the
    // ~30 s compile burst). Set here rather than per-spec because 18 specs open
    // their own URLs. The DEFAULT (full) tier is asserted by render-tier.spec.ts.
    storageState: {
      cookies: [],
      origins: [{ origin: 'http://127.0.0.1:7777', localStorage: [{ name: 'septopus_fx', value: 'low' }] }],
    },
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Software WebGL so the engine's WebGLRenderer works in headless.
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
  ],
  webServer: [
    {
      // Dev IPFS gateway (services/ipfs): the content network tier. Booted for
      // every run so the router's tier-2 path is deterministic in e2e.
      command: 'npm start --prefix ../../services/ipfs',
      url: 'http://127.0.0.1:7789/v0/health',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm run dev',
      url: 'http://127.0.0.1:7777',
      reuseExistingServer: true,
      timeout: 90_000,
    },
    {
      // AI authoring gateway (spec ai-authoring.md). PROVIDER defaults to mock
      // (deterministic, no API key, CI-safe); export PROVIDER=qwen +
      // DASHSCOPE_API_KEY before a run for the live provider — the webServer
      // inherits this process's env.
      command: 'npm start --prefix ../../services/ai-gateway',
      url: 'http://127.0.0.1:7788/v0/health',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      // World Labs (Marble) gateway — the gallery ㉑ AI-generated-world demo.
      // WORLDLABS_PROVIDER defaults to mock (instant, offline, CI-safe); export
      // WORLDLABS_PROVIDER=real + WORLDLABS_API_KEY for the live ~5-minute API
      // (never do this in CI — costs real Marble credits).
      command: 'npm start --prefix ../../services/worldlabs',
      url: 'http://127.0.0.1:7790/v0/health',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
