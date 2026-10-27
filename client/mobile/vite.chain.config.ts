import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// CHAIN build (specs: protocol/cn|en/boot-chain.md §3) — packs the mobile shell
// into a SINGLE self-contained IIFE so it can ride inside a `septopus.loader`
// document's `code` field and be executed by the boot shim via new Function().
//   · one JS file (no ESM imports at runtime, no code-splitting)
//   · one CSS file (injected by the loader prelude)
//   · assets are NOT bundled — the world fetches them from the content gateway
//     (the A3 path: names → CAS blobs), see services/ipfs /assets/<file>.
// Dev stays on vite.config.ts (HMR etc.); this is a RELEASE artifact only.
const pkgVersion = (() => {
  try { return JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version as string }
  catch { return '0.0.0' }
})()

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
    __APP_COMMIT__: JSON.stringify('chain'),
  },
  resolve: {
    alias: {
      '@engine': resolve(__dirname, '../../engine/src'),
      '@core': resolve(__dirname, '../core/src'),
      '@land-plugin': process.env.SEPTOPUS_LAND === 'solana'
        ? resolve(__dirname, '../chain/src/index.ts')
        : resolve(__dirname, '../core/src/land/plugin-none.ts'),
      ...(process.env.SEPTOPUS_LAND === 'solana'
        ? { 'buffer': resolve(__dirname, '../chain/node_modules/buffer') }
        : {}),
      // Out-of-root shared source (core/engine) must resolve bare deps from THIS
      // app's node_modules at build time (rolldown resolves relative to importer).
      'react': resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom'),
      // Must precede bare 'three' — see vite.config.ts for why (Spark's
      // 'three/addons/*' deep imports need three's examples/jsm path).
      'three/addons': resolve(__dirname, 'node_modules/three/examples/jsm'),
      'three': resolve(__dirname, 'node_modules/three'),
    },
  },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist-chain',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    modulePreload: false,                   // single IIFE — no preload helper needed
    chunkSizeWarningLimit: 15000,
    cssCodeSplit: false,                    // one CSS blob for the prelude to inject
    assetsInlineLimit: 1024 * 1024,         // inline small assets as data: URIs
    rollupOptions: {
      input: resolve(__dirname, 'src/chain-main.tsx'), // Unified system JS entry — no index.html
      output: {
        format: 'iife',                     // runnable via new Function (no ESM)
        inlineDynamicImports: true,         // a single chunk, no code-splitting
        entryFileNames: 'app.js',
        assetFileNames: '[name][extname]',  // style.css etc, stable names
      },
    },
  },
})
