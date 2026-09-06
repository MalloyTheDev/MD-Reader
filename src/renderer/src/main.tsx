import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

function mount(): void {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  )
}

// Under Tauri there is no Electron preload, so window.api is provided by the shim in
// ./lib/tauri-api. It MUST be installed BEFORE App mounts: App's first mount effect calls
// window.api immediately, so a non-blocking import would race and leave window.api undefined
// at startup (blank/stuck app). Await the shim, then mount. Under Electron the preload already
// set window.api, so we mount directly and never pull the Tauri shim into the Electron bundle.
const tauriGlobals = window as unknown as {
  __TAURI__?: unknown
  __TAURI_INTERNALS__?: unknown
}
const viteEnv = (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {}
const isTauri =
  !!tauriGlobals.__TAURI__ ||
  !!tauriGlobals.__TAURI_INTERNALS__ ||
  !!viteEnv.TAURI ||
  !!viteEnv.TAURI_PLATFORM

if (isTauri) {
  void import('./lib/tauri-api')
    .catch((err) => console.error('Failed to load Tauri API shim', err))
    .finally(mount)
} else {
  mount()
}
