import { defineConfig, devices } from '@playwright/test';

/**
 * L4 browser/visual tests for the desktop 3D client.
 * Runs the real Vite dev server in headless Chromium with software WebGL
 * (SwiftShader) so the 3D canvas renders without a GPU.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:7777',
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
  ],
});
