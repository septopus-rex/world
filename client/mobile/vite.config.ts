import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Septopus MOBILE shell — a standalone app over the SAME shared core
// (client/core: loader/useEngine/components + the pure-data world) and the same
// engine source alias the desktop uses (specs/mobile-client.md). Port 7778.
const pkgVersion = (() => {
  try { return JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version as string }
  catch { return '0.0.0' }
})()

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
    __APP_COMMIT__: JSON.stringify('mobile'),
  },
  resolve: {
    alias: {
      '@engine': resolve(__dirname, '../../engine/src'),
      '@core': resolve(__dirname, '../core/src'),
      // Out-of-root shared source (core/engine) must resolve bare deps from THIS
      // app's node_modules at build time (rolldown resolves relative to importer).
      'react': resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom'),
      'three': resolve(__dirname, 'node_modules/three'),
    },
  },
  // Demo fixtures (models/textures/audio) are SHARED content — serve the same
  // public dir the desktop app uses (DEMO_ASSETS paths resolve identically).
  publicDir: resolve(__dirname, '../desktop/public'),
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',   // IPv4 explicit (vite8 'localhost' may bind ::1 only —
    port: 7778,          // playwright probes 127.0.0.1); `--host 0.0.0.0` (lan) overrides
    strictPort: true,
    fs: { allow: [resolve(__dirname, '../..')] }, // engine + core live outside the app root
  },
})
