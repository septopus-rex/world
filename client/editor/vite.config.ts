import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Septopus EDITOR shell — the standalone SPP粒子 (option library / StylePack)
// editor. Port 7779.
//
// It is the "Editor 2" of spp-editors.md §3: independent of the WORLD runtime
// (no block streaming, no player, no game loop) but NOT of the engine — it
// imports the engine as a library (AdjunctRegistry / expandSpp / MeshFactory)
// and previews through a lean Engine harness (StylePackPreviewLoader, path b).
// Editor 1 (the source editor / 魔法球) deliberately stays INSIDE the world app,
// because placing cells in space is a spatial act — see spp-editors.md §2.
const pkgVersion = (() => {
  try { return JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version as string }
  catch { return '0.0.0' }
})()

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
    __APP_COMMIT__: JSON.stringify('editor'),
  },
  resolve: {
    alias: {
      '@engine': resolve(__dirname, '../../engine/src'),
      // Shared client core — the editor consumes only the CONTENT side of it
      // (bundled stylepacks), not the world loader.
      '@core': resolve(__dirname, '../core/src'),
      // Out-of-root shared source (core/engine) must resolve bare deps from THIS
      // app's node_modules at build time (rolldown resolves relative to importer).
      'react': resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom'),
      // MUST precede the bare 'three' alias below: object aliases are literal
      // path substitutions (no package.json `exports` map applied), so a deep
      // import like 'three/addons/x' would otherwise resolve to a literal,
      // nonexistent 'node_modules/three/addons/x' on disk instead of three's
      // real 'examples/jsm/x' (Spark, the Gaussian-splat renderer, imports
      // three's postprocessing helpers this way).
      'three/addons': resolve(__dirname, 'node_modules/three/examples/jsm'),
      'three': resolve(__dirname, 'node_modules/three'),
    },
  },
  // Demo fixtures (models/textures) are SHARED content — serve the same public
  // dir the world apps use, so an option's a4 model resolves identically here
  // and in the world.
  publicDir: resolve(__dirname, '../desktop/public'),
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',   // IPv4 explicit (vite8 'localhost' may bind ::1 only —
    port: 7779,          // playwright probes 127.0.0.1)
    strictPort: true,
    fs: { allow: [resolve(__dirname, '../..')] }, // engine + core live outside the app root
  },
})
