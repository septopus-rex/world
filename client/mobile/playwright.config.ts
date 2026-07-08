import { defineConfig, devices } from '@playwright/test';

// Mobile-shell e2e: same SwiftShader + deterministic step(dt) discipline as the
// desktop suite, on this app's own dev server (port 7778).
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:7778',
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
      url: 'http://127.0.0.1:7778',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
