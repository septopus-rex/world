import { defineConfig, devices } from '@playwright/test';

// Editor-app e2e: same SwiftShader discipline as the world suites, on this app's
// own dev server (port 7779). The editor previews through a lean Engine harness
// (StylePackPreviewLoader), so it needs real WebGL just like the world specs —
// but none of their world services (no IPFS gateway, no AI gateway).
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:7779',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://127.0.0.1:7779',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
