// Capture screenshots of the running app over CDP for UI/UX review.
import { spawn, execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

function killStaleInstances() {
  try {
    execSync('taskkill /F /IM md-reader.exe /T', { stdio: 'ignore' })
  } catch {
    /* none running */
  }
}

const PORT = 9223
const EXE = resolve('dist/win-unpacked/md-reader.exe')
const DOC = resolve('sample-library/demos/slides-and-tasks.md')
const OUT = resolve('docs/screenshots')
mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let nextId = 1
const pending = new Map()
let ws

function send(method, params = {}) {
  const id = nextId++
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((res, rej) => {
    pending.set(id, { res, rej })
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        rej(new Error('timeout ' + method))
      }
    }, 15000)
  })
}
const evalJS = (expression) =>
  send('Runtime.evaluate', { expression, returnByValue: true, userGesture: true }).then(
    (r) => r.result?.value
  )
const evalAwait = (expression) =>
  send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  }).then((r) => r.result?.value)

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(resolve(OUT, name + '.png'), Buffer.from(r.data, 'base64'))
  console.log('shot:', name)
}

async function getWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const t = (await res.json()).find((x) => x.type === 'page' && x.webSocketDebuggerUrl)
      if (t) return t.webSocketDebuggerUrl
    } catch {
      /* not up */
    }
    await sleep(500)
  }
  throw new Error('no target')
}

async function main() {
  killStaleInstances()
  await sleep(600)
  const child = spawn(EXE, [`--remote-debugging-port=${PORT}`, '--remote-allow-origins=*', DOC], {
    stdio: 'ignore'
  })
  const wsUrl = await getWs()
  ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? rej(new Error(m.error.message)) : res(m.result)
    }
  })
  await send('Page.enable')
  await send('Runtime.enable')

  for (let i = 0; i < 30; i++) {
    if (await evalJS(`!!document.querySelector('.reader-content, .markdown-body')`)) break
    await sleep(400)
  }
  // Configure throwaway keys so the AI panels render their controls for the screenshots.
  // These are never used for a real request and are cleared at the end.
  await evalAwait(`window.api.aiSetKey('anthropic','dummy-key-for-screenshots').then(()=>1)`)
  await evalAwait(`window.api.aiSetKey('openai','dummy-key-for-screenshots').then(()=>1)`)
  await sleep(800)
  await shot('01-reader')

  await evalJS(`document.querySelector('[title="Table of contents"]')?.click()`)
  await sleep(500)
  await shot('02-reader-toc')
  await evalJS(`document.querySelector('[title="Table of contents"]')?.click()`)
  await sleep(300)

  await evalJS(`document.querySelector('[title="Present (slides)"]')?.click()`)
  await sleep(700)
  await shot('03-slides')
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`)
  await sleep(400)

  await evalJS(`document.querySelector('[title="Study assistant (AI)"]')?.click()`)
  await sleep(700)
  await shot('04-ai-panel')
  await evalJS(`document.querySelector('[title="Study assistant (AI)"]')?.click()`)
  await sleep(300)

  // Repurpose / Create panel.
  await evalJS(`document.querySelector('[title="Repurpose with AI"]')?.click()`)
  await sleep(600)
  await shot('04b-create')
  await evalJS(`document.querySelector('.create-panel [aria-label="Close"]')?.click()`)
  await sleep(300)

  await evalJS(`document.querySelector('[title="Reading settings"]')?.click()`)
  await sleep(500)
  await shot('05-settings')
  // Toggle the accent OFF to confirm the neutral look + that presets hide.
  await evalJS(`document.querySelector('[title^="Turn the colored accent"]')?.click()`)
  await sleep(400)
  await shot('05b-accent-off')
  await evalJS(`document.querySelector('[title^="Turn the colored accent"]')?.click()`)
  await sleep(300)
  // Open the full categorized Settings screen.
  await evalJS(`document.querySelector('.settings-more')?.click()`)
  await sleep(500)
  await shot('05c-settings-screen')
  await evalJS(
    `[...document.querySelectorAll('.sv-nav-item')].find(b=>/Typography/.test(b.textContent))?.click()`
  )
  await sleep(300)
  await shot('05d-settings-typography')
  await evalJS(`document.querySelector('.settings-view [aria-label="Close"]')?.click()`)
  await sleep(300)

  await evalJS(`document.querySelector('[title="Edit"]')?.click()`)
  await sleep(700)
  await shot('06-editor')
  // Editor AI menu (rewrite/expand/grammar/continue + organize).
  await evalJS(`document.querySelector('.insert-ai')?.click()`)
  await sleep(300)
  await shot('06b-editor-ai')
  await evalJS(`document.querySelector('.menu-backdrop')?.click()`)
  await sleep(200)
  await evalJS(
    `window.dispatchEvent(new KeyboardEvent('keydown',{key:'h',ctrlKey:true,cancelable:true}))`
  )
  await sleep(400)
  await shot('07-editor-find')
  await evalJS(`document.querySelector('[title="Done editing"]')?.click()`)
  await sleep(400)

  await evalJS(`document.querySelector('[title="Back to library"]')?.click()`)
  await sleep(700)
  await shot('08-library')

  // New course panel from the library shelf actions.
  await evalJS(
    `[...document.querySelectorAll('.act')].find(b=>/New course/.test(b.textContent))?.click()`
  )
  await sleep(500)
  await shot('08b-course')
  await evalJS(`document.querySelector('.create-panel [aria-label="Close"]')?.click()`)
  await sleep(200)

  // README-from-code panel.
  await evalJS(
    `[...document.querySelectorAll('.act')].find(b=>/README/.test(b.textContent))?.click()`
  )
  await sleep(500)
  await shot('08c-readme')
  await evalJS(`document.querySelector('.create-panel [aria-label="Close"]')?.click()`)
  await sleep(200)
  // New-folder inline input.
  await evalJS(
    `document.querySelector('[title="Create a new collection folder"]')?.click()`
  )
  await sleep(250)
  await shot('08d-newfolder')
  await evalJS(`document.querySelector('.lib2')?.click()`)
  await sleep(150)

  // Remove/delete confirmation modal.
  await evalJS(`document.querySelector('[title^="Remove from library"]')?.click()`)
  await sleep(300)
  await shot('08e-delete-confirm')
  await evalJS(`document.querySelector('.confirm-actions .btn')?.click()`)
  await sleep(150)

  // Open the Math Showcase to verify the upgraded equations.
  await evalJS(
    `[...document.querySelectorAll('.book2')].find(b=>/Math Showcase/.test(b.textContent))?.click()`
  )
  await sleep(1100)
  await shot('10-math')
  await evalJS(`document.querySelector('[title="Back to library"]')?.click()`)
  await sleep(600)

  await evalJS(
    `[...document.querySelectorAll('.act')].find(b=>/Tasks/.test(b.textContent))?.click()`
  )
  await sleep(500)
  await shot('09-tasks')
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`)
  await sleep(300)

  // Always-visible folder navigation menu (open another / switch back to recent).
  await evalJS(
    `[...document.querySelectorAll('.act')].find(b=>/Folders/.test(b.textContent))?.click()`
  )
  await sleep(350)
  await shot('11-folders-menu')
  await evalJS(`document.querySelector('.menu-backdrop')?.click()`)
  await sleep(200)

  // Templates picker.
  await evalJS(
    `[...document.querySelectorAll('.act')].find(b=>/Template/.test(b.textContent))?.click()`
  )
  await sleep(450)
  await shot('12-templates')
  await evalJS(`document.querySelector('.template-close')?.click()`)
  await sleep(200)

  // Charts (safe declarative chart blocks).
  await evalJS(
    `[...document.querySelectorAll('.book2')].find(b=>/Charts Showcase/.test(b.textContent))?.click()`
  )
  await sleep(1200)
  await shot('13-charts')

  // Document info panel (counts + health).
  await evalJS(`document.querySelector('[title="Document info"]')?.click()`)
  await sleep(450)
  await shot('14-doc-info')
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`)
  await sleep(250)
  await evalJS(`document.querySelector('[title="Back to library"]')?.click()`)
  await sleep(600)

  // Tables & callouts.
  await evalJS(
    `[...document.querySelectorAll('.book2')].find(b=>/Tables & Callouts/.test(b.textContent))?.click()`
  )
  await sleep(1200)
  await shot('15-tables-callouts')
  await evalJS(`document.querySelector('[title="Back to library"]')?.click()`)
  await sleep(500)

  // Cross-library search with operators (search for a term that hits a demo).
  await evalJS(`(() => {
    const el = document.querySelector('.tb-search input'); if (!el) return
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
    set.call(el, 'has:chart'); el.dispatchEvent(new Event('input',{bubbles:true}))
  })()`)
  await sleep(500)
  await shot('16-search-operators')

  // Remove the throwaway keys so no dummy credential is left behind.
  await evalAwait(`window.api.aiClearKey('anthropic').then(()=>1)`)
  await evalAwait(`window.api.aiClearKey('openai').then(()=>1)`)

  try {
    ws.close()
  } catch {
    /* ignore */
  }
  child.kill()
  killStaleInstances()
  console.log('done -> ' + OUT)
  setTimeout(() => process.exit(0), 400)
}

main().catch((e) => {
  console.error('SHOOT ERROR', e)
  process.exit(1)
})
