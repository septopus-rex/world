import { defineConfig } from 'vitest/config';

// Engine test runner. Pure-logic tests run in the Node environment (no DOM/GPU);
// the engine core has zero `three` imports, so unit/system/integration logic is
// fully headless. Anything needing WebGL lives in client/desktop/e2e (Playwright).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
  },
});
