import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Build-time version info ───────────────────────────────────────────────────
// Version comes from package.json (the repo-wide release version, see
// deploy/RELEASE.md). Injected into index.html as <meta>, emitted as
// /version.json for deploy inspection, and exposed to the UI via define
// (__APP_VERSION__/__APP_COMMIT__ — shown in the HUD brand corner).
const gitCommit = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() }
  catch { return 'dev' }
})()
const gitDirty = (() => {
  try { return execSync('git status --porcelain').toString().trim().length > 0 }
  catch { return false }
})()
const pkgVersion = (() => {
  try { return JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version as string }
  catch { return '0.0.0' }
})()
const versionInfo = {
  version: pkgVersion,
  commit: gitCommit + (gitDirty ? '-dirty' : ''),
  buildTime: new Date().toISOString(),
}
const versionPlugin = () => ({
  name: 'app-version-meta',
  transformIndexHtml(html: string) {
    const tag = `<meta name="app-version" content="${versionInfo.version}" />\n    <meta name="app-commit" content="${versionInfo.commit}" />\n    <meta name="app-build-time" content="${versionInfo.buildTime}" />`
    return html.replace('<meta name="theme-color"', `${tag}\n    <meta name="theme-color"`)
  },
  closeBundle() {
    try { writeFileSync(resolve(__dirname, 'dist/version.json'), JSON.stringify(versionInfo, null, 2)) } catch { /* dist not built yet */ }
  },
})

// https://vite.dev/config/
export default defineConfig({
  // Deploy base: '/' for root-domain hosting (dev / world.septopus.xyz),
  // '/world/' when served from GitHub Pages project path (deploy/RELEASE.md §6).
  base: process.env.VITE_BASE ?? '/',
  define: {
    __APP_VERSION__: JSON.stringify(versionInfo.version),
    __APP_COMMIT__: JSON.stringify(versionInfo.commit),
  },
  resolve: {
    alias: {
      // Pure 3D engine source (TypeScript). The client depends ONLY on the
      // engine — no chain, no wallet, no @solana/*.
      '@engine': resolve(__dirname, '../../engine/src'),
      // Shared client core (loader/useEngine/components/content data) — the
      // desktop and mobile shells both consume it by source alias (specs/mobile-client.md).
      '@core': resolve(__dirname, '../core/src'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    versionPlugin(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['septopus.svg'],
      manifest: {
        name: 'Septopus World — Desktop',
        short_name: 'Septopus',
        description: 'Septopus World 3D 引擎桌面客户端（纯本地，离线优先）',
        theme_color: '#06b6d4',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // New SW activates immediately; a single reload (via UpdateNotifier's
        // updateServiceWorker(true)) is enough to pick up a new version.
        skipWaiting: true,
        clientsClaim: true,
        // 3D assets (gltf/textures) can be large — raise precache limit.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globPatterns: ['**/*.{css,html,ico,png,svg,woff2}', 'assets/index-*.js', 'assets/react-vendor-*.js'],
        runtimeCaching: [
          {
            // Lazy JS chunks (three add-ons, secondary views): download once, then offline.
            urlPattern: /\/assets\/.*-[A-Za-z0-9]+\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'lazy-chunks',
              expiration: { maxEntries: 40, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
          {
            // Textures / models / images — local-first.
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|glb|gltf|fbx)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'assets-cache',
              expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/scheduler')) return 'react-vendor'
          if (id.match(/node_modules\/react\//)) return 'react-vendor'
          if (id.includes('node_modules/three')) return 'three-vendor'
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 7777,
    strictPort: true,
  },
})
