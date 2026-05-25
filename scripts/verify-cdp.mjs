// End-to-end smoke test over the Chrome DevTools Protocol.
// Launches the packaged (unpacked) app with a Markdown file argument (exercising the
// new CLI / file-association open-path flow), then drives the UI and collects errors.
import { spawn, execSync } from 'node:child_process'
import { resolve } from 'node:path'

// Electron spawns a process tree and child.kill() won't reap it on Windows; a lingering
// instance keeps the single-instance lock + debug port, so the next run attaches to the
// wrong (dying) window. Start from a clean slate.
function killStaleInstances() {
  try {
    execSync('taskkill /F /IM md-reader.exe /T', { stdio: 'ignore' })
  } catch {
    /* none running */
  }
}

const PORT = 9222
// Verify the actual packaged build.
const EXE = resolve('dist/win-unpacked/md-reader.exe')
const DOC = resolve('sample-library/demos/slides-and-tasks.md')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const consoleErrors = []
const exceptions = []
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
        rej(new Error('timeout: ' + method))
      }
    }, 15000)
  })
}

async function evalJS(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true
  })
  if (r.exceptionDetails) {
    return { __error: r.exceptionDetails.exception?.description || 'eval error' }
  }
  return r.result?.value
}

async function getPageWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const targets = await res.json()
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page.webSocketDebuggerUrl
    } catch {
      /* not up yet */
    }
    await sleep(500)
  }
  throw new Error('No CDP page target found')
}

async function main() {
  killStaleInstances()
  await sleep(600) // let the OS release the single-instance lock before relaunching
  const child = spawn(EXE, [`--remote-debugging-port=${PORT}`, '--remote-allow-origins=*', DOC], {
    stdio: 'ignore'
  })
  child.on('error', (e) => console.error('spawn error', e))

  const wsUrl = await getPageWs()
  ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result)
      return
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      exceptions.push(
        msg.params.exceptionDetails.exception?.description ||
          msg.params.exceptionDetails.text ||
          'exception'
      )
    }
  })

  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')

  const results = {}

  // Wait for the open-path flow to load the doc into the reader.
  let readerReady = false
  for (let i = 0; i < 40; i++) {
    const ok = await evalJS(`!!document.querySelector('.reader-content, .markdown-body')`)
    if (ok === true) {
      readerReady = true
      break
    }
    await sleep(400)
  }
  results.openedViaCliArg = readerReady
  results.title = await evalJS(`document.querySelector('.app-title')?.textContent || ''`)

  results.api = await evalJS(`(() => {
    const a = window.api || {}
    return {
      sidecarLoad: typeof a.sidecarLoad === 'function',
      sidecarSave: typeof a.sidecarSave === 'function',
      saveImage: typeof a.saveImage === 'function',
      onOpenPath: typeof a.onOpenPath === 'function',
      getPendingOpenPath: typeof a.getPendingOpenPath === 'function'
    }
  })()`)

  results.readerHasText = await evalJS(
    `(document.querySelector('.reader-content')?.textContent || '').length > 40`
  )
  results.presentButton = await evalJS(`!!document.querySelector('[title="Present (slides)"]')`)

  // Open slides, advance, then close.
  await evalJS(`document.querySelector('[title="Present (slides)"]')?.click()`)
  await sleep(500)
  results.slidesOpened = await evalJS(`!!document.querySelector('.slides-overlay')`)
  const counter1 = await evalJS(`document.querySelector('.slides-counter')?.textContent?.trim()`)
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'}))`)
  await sleep(300)
  const counter2 = await evalJS(`document.querySelector('.slides-counter')?.textContent?.trim()`)
  results.slidesAdvanced = !!counter1 && !!counter2 && counter1 !== counter2
  results.slideCounters = [counter1, counter2]
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`)
  await sleep(300)
  results.slidesClosed = await evalJS(`!document.querySelector('.slides-overlay')`)

  // Editor: open, test find bar (Ctrl+H) and the slash menu.
  await evalJS(`document.querySelector('[title="Edit"]')?.click()`)
  await sleep(500)
  results.editorMounted = await evalJS(`!!document.querySelector('.editor-textarea')`)
  await evalJS(
    `window.dispatchEvent(new KeyboardEvent('keydown',{key:'h',ctrlKey:true,cancelable:true}))`
  )
  await sleep(300)
  results.findBar = await evalJS(`!!document.querySelector('.editor-find')`)
  // Close find, then simulate typing "/" to trigger the slash menu.
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`)
  await sleep(150)
  results.slashMenu = await evalJS(`(() => {
    const ta = document.querySelector('.editor-textarea')
    if (!ta) return false
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set
    setter.call(ta, ta.value + '\\n/')
    ta.selectionStart = ta.selectionEnd = ta.value.length
    ta.dispatchEvent(new Event('input',{bubbles:true}))
    return true
  })()`)
  await sleep(300)
  results.slashMenuOpened = await evalJS(`!!document.querySelector('.slash-pop')`)
  // Leave editor without saving changes: toggle edit off.
  await evalJS(`document.querySelector('[title="Done editing"]')?.click()`)
  await sleep(300)

  // AI: open the study-assistant panel, then jump to Settings → AI via its configure action.
  await evalJS(`document.querySelector('[title="Study assistant (AI)"]')?.click()`)
  await sleep(400)
  results.aiPanelOpened = await evalJS(`!!document.querySelector('.ai-panel')`)
  // onConfigure is reachable from the model chip (key configured) or the setup button (no key).
  await evalJS(
    `(document.querySelector('.ai-model-chip') || document.querySelector('.ai-setup .btn-primary'))?.click()`
  )
  await sleep(500)
  results.aiSettings = await evalJS(`(() => {
    const sv = !!document.querySelector('.settings-view')
    const ai = !!document.querySelector('.ai-settings')
    const activeNav = document.querySelector('.sv-nav-item.is-active')?.textContent?.trim() || ''
    const providerOptions = document.querySelectorAll('.ai-settings .seg .seg-btn').length
    const hasModelInput = !!document.querySelector('.ai-model-row .sv-text')
    return { sv, ai, activeNav, providerOptions, hasModelInput }
  })()`)
  // Switch provider to Ollama → base URL field should appear, key field should hide.
  await evalJS(
    `[...document.querySelectorAll('.ai-settings .seg .seg-btn')].find(b => /Ollama/i.test(b.textContent))?.click()`
  )
  await sleep(300)
  results.aiOllamaUI = await evalJS(`(() => {
    const rows = [...document.querySelectorAll('.ai-settings .settings-row')]
    const labels = rows.map(r => r.querySelector('.settings-label')?.textContent || '')
    return {
      hasBaseUrl: labels.some(l => /Base URL/i.test(l)),
      hasApiKey: labels.some(l => /API key/i.test(l))
    }
  })()`)
  // Restore Anthropic so we don't persist a provider change, then close settings.
  await evalJS(
    `[...document.querySelectorAll('.ai-settings .seg .seg-btn')].find(b => /Anthropic/i.test(b.textContent))?.click()`
  )
  await sleep(200)
  await evalJS(`document.querySelector('.settings-view [aria-label="Close"]')?.click()`)
  await sleep(300)

  // Create / repurpose panel opens from the reader topbar.
  // (settle a bit longer: the settings-view backdrop must fully unmount before the click lands)
  await sleep(250)
  await evalJS(`document.querySelector('[title="Repurpose with AI"]')?.click()`)
  await sleep(450)
  results.createPanel = await evalJS(`!!document.querySelector('.create-panel')`)
  if (!results.createPanel) {
    await evalJS(`document.querySelector('[title="Repurpose with AI"]')?.click()`)
    await sleep(450)
    results.createPanel = await evalJS(`!!document.querySelector('.create-panel')`)
  }
  await evalJS(`document.querySelector('.create-panel [aria-label="Close"]')?.click()`)
  await sleep(200)

  // Back to library → verify books + tasks dashboard.
  await evalJS(`document.querySelector('[title="Back to library"]')?.click()`)
  await sleep(600)
  results.bookCount = await evalJS(`document.querySelectorAll('.book').length`)
  // New-course panel opens from the library shelf actions.
  await evalJS(
    `[...document.querySelectorAll('.shelf-actions .btn')].find(b => /New course/.test(b.textContent))?.click()`
  )
  await sleep(400)
  results.coursePanel = await evalJS(
    `(() => { const p = document.querySelector('.create-panel'); return !!p && /New course/.test(p.textContent || '') })()`
  )
  await evalJS(`document.querySelector('.create-panel [aria-label="Close"]')?.click()`)
  await sleep(200)
  // Vault controls present in the library shelf actions.
  results.vaultButton = await evalJS(
    `[...document.querySelectorAll('.shelf-actions .btn')].some(b => /Vault/.test(b.textContent))`
  )
  // New folder → enter it → confirm you can get BACK (the "stuck in folder" fix) → delete it (cleanup).
  await evalJS(
    `[...document.querySelectorAll('.shelf-actions .btn')].find(b => /New folder/.test(b.textContent))?.click()`
  )
  await sleep(200)
  results.newFolderInput = await evalJS(`!!document.querySelector('.newfolder-input')`)
  await evalJS(`(() => {
    const el = document.querySelector('.newfolder-input'); if (!el) return false
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
    set.call(el, 'ZZ CDP Test'); el.dispatchEvent(new Event('input',{bubbles:true})); return true
  })()`)
  await sleep(150)
  await evalJS(
    `[...document.querySelectorAll('.newfolder-inline button, .shelf-actions button')].find(b => b.textContent.trim()==='Create')?.click()`
  )
  await sleep(400)
  results.folderChip = await evalJS(
    `[...document.querySelectorAll('.folder-bar .tag-chip')].some(b => /ZZ CDP Test/.test(b.textContent))`
  )
  // Enter the (empty) folder.
  await evalJS(
    `[...document.querySelectorAll('.folder-bar .tag-chip')].find(b => /ZZ CDP Test/.test(b.textContent))?.click()`
  )
  await sleep(250)
  // The critical fix: a clear way back must be present.
  results.folderBackLink = await evalJS(
    `[...document.querySelectorAll('.filter-note .link-btn')].some(b => /All books/.test(b.textContent))`
  )
  await evalJS(
    `[...document.querySelectorAll('.filter-note .link-btn')].find(b => /All books/.test(b.textContent))?.click()`
  )
  await sleep(250)
  results.backToAllWorks = await evalJS(`!document.querySelector('.filter-note')`)
  // Re-enter and delete the test folder (cleanup) via the confirm modal.
  await evalJS(
    `[...document.querySelectorAll('.folder-bar .tag-chip')].find(b => /ZZ CDP Test/.test(b.textContent))?.click()`
  )
  await sleep(200)
  await evalJS(
    `[...document.querySelectorAll('.filter-note .link-danger')].find(b => /Delete folder/.test(b.textContent))?.click()`
  )
  await sleep(250)
  results.folderConfirm = await evalJS(`!!document.querySelector('.confirm-modal')`)
  await evalJS(
    `[...document.querySelectorAll('.confirm-choice')].find(b => /Delete folder/.test(b.textContent))?.click()`
  )
  await sleep(600)
  results.folderDeleted = await evalJS(
    `![...document.querySelectorAll('.folder-bar .tag-chip')].some(b => /ZZ CDP Test/.test(b.textContent))`
  )
  // README-from-code panel opens.
  await evalJS(
    `[...document.querySelectorAll('.shelf-actions .btn')].find(b => /README/.test(b.textContent))?.click()`
  )
  await sleep(400)
  results.readmePanel = await evalJS(
    `(() => { const p = document.querySelector('.create-panel'); return !!p && /README/.test(p.textContent || '') })()`
  )
  await evalJS(`document.querySelector('.create-panel [aria-label="Close"]')?.click()`)
  await sleep(200)
  // Delete/remove system: ⋯ menu → confirm modal → Remove from Library → Undo (no real deletion).
  const booksBefore = await evalJS(`document.querySelectorAll('.book').length`)
  await evalJS(`document.querySelector('.book .book-menu')?.click()`)
  await sleep(300)
  results.confirmModal = await evalJS(`!!document.querySelector('.confirm-modal')`)
  await evalJS(
    `[...document.querySelectorAll('.confirm-choice')].find(b => /Remove from Library/.test(b.textContent))?.click()`
  )
  await sleep(300)
  results.undoToast = await evalJS(`!!document.querySelector('.undo-toast')`)
  const booksAfterRemove = await evalJS(`document.querySelectorAll('.book').length`)
  results.removeHidesBook = booksAfterRemove < booksBefore
  await evalJS(`document.querySelector('.undo-toast .link-btn')?.click()`)
  await sleep(300)
  results.undoRestores = (await evalJS(`document.querySelectorAll('.book').length`)) === booksBefore
  results.tasksButton = await evalJS(
    `[...document.querySelectorAll('.shelf-actions .btn')].some(b => /Tasks/.test(b.textContent))`
  )
  await evalJS(
    `[...document.querySelectorAll('.shelf-actions .btn')].find(b => /Tasks/.test(b.textContent))?.click()`
  )
  await sleep(500)
  results.tasksOverlay = await evalJS(`!!document.querySelector('.tasks-overlay')`)
  results.taskRows = await evalJS(`document.querySelectorAll('.task-row').length`)

  results.consoleErrors = consoleErrors
  results.exceptions = exceptions

  console.log(JSON.stringify(results, null, 2))

  const critical =
    results.openedViaCliArg &&
    results.api &&
    Object.values(results.api).every(Boolean) &&
    results.readerHasText &&
    results.slidesOpened &&
    results.slidesAdvanced &&
    results.slidesClosed &&
    results.editorMounted &&
    results.findBar &&
    results.aiPanelOpened &&
    results.aiSettings.sv &&
    results.aiSettings.ai &&
    results.aiSettings.activeNav === 'AI' &&
    results.aiSettings.providerOptions === 4 &&
    results.aiSettings.hasModelInput &&
    results.aiOllamaUI.hasBaseUrl &&
    !results.aiOllamaUI.hasApiKey &&
    results.createPanel &&
    results.coursePanel &&
    results.confirmModal &&
    results.undoToast &&
    results.removeHidesBook &&
    results.undoRestores &&
    results.folderChip &&
    results.folderBackLink &&
    results.backToAllWorks &&
    results.folderConfirm &&
    results.folderDeleted &&
    results.bookCount > 0 &&
    results.tasksButton &&
    results.tasksOverlay &&
    results.taskRows > 0 &&
    exceptions.length === 0 &&
    consoleErrors.length === 0

  console.log('\nVERDICT: ' + (critical ? 'PASS' : 'FAIL'))

  try {
    ws.close()
  } catch {
    /* ignore */
  }
  child.kill()
  killStaleInstances() // reap the whole Electron process tree so the next run is clean
  setTimeout(() => process.exit(critical ? 0 : 1), 500)
}

main().catch((e) => {
  console.error('VERIFY ERROR:', e)
  process.exit(1)
})
