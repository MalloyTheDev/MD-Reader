import '../renderer/src/assets/main.css'
import 'katex/dist/katex.min.css'
import './web.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WebReader } from './WebReader'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <WebReader />
  </StrictMode>
)

// Register the service worker so the app is installable and works offline after first load.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
