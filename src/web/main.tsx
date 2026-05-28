import { createRoot } from 'react-dom/client'
import { WebApp } from './WebApp'
// Reuse the desktop renderer's full v2 stylesheet + locally bundled fonts.
import '../renderer/src/assets/main.css'
import 'katex/dist/katex.min.css'
import './web.css'

const root = createRoot(document.getElementById('root') as HTMLElement)
root.render(<WebApp />)

// Register the service worker for offline support. Same-origin scope by design.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline cache is best-effort */
    })
  })
}
