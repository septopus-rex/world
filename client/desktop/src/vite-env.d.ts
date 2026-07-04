/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

// Build-time constants injected by vite.config.ts `define` (release version
// tracking — see deploy/RELEASE.md).
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
