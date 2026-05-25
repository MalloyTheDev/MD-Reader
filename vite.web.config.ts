import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone web build for the install-free PWA reader. Reuses the renderer's pure rendering
// libraries (markdown pipeline, charts, KaTeX, Mermaid) via the @renderer/@shared aliases.
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
