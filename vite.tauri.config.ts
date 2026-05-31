import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone Vite build of the FULL v2 renderer (src/renderer), for the Tauri shell.
// Unlike electron.vite.config.ts (which builds main/preload/renderer for Electron) this
// produces a plain web bundle that Tauri serves as its frontendDist. The renderer talks to
// the backend only through window.api; under Tauri that interface is provided by the
// tauri-api shim (src/renderer/src/lib/tauri-api.ts) instead of the Electron preload.
export default defineConfig({
  root: resolve('src/renderer'),
  base: './',
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  plugins: [react()],
  build: {
    outDir: resolve('dist-tauri'),
    emptyOutDir: true,
    target: 'esnext',
    sourcemap: false
  },
  server: {
    port: 5175,
    strictPort: true
  },
  // Tauri reads stdout; keep clearScreen off so build/dev logs are visible.
  clearScreen: false
})
