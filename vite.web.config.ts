import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone web build for the v2 PWA. Reuses the renderer's pure libraries (renderBodyHtml,
// markdown pipeline, KaTeX, Mermaid, chart parsers) via the @renderer / @shared aliases so the
// browser app and the Electron app render Markdown identically. Kept separate from electron-vite
// so the web build cannot accidentally pull in Electron-only modules.
export default defineConfig({
  root: resolve('src/web'),
  base: './',
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  server: {
    port: 5174,
    strictPort: true
  },
  build: {
    outDir: resolve('dist-web'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000
  },
  plugins: [react()]
})
