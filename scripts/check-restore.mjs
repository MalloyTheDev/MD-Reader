// Verify the startup restore flow still works with the libraryRoot authorization guard:
// launch with NO file argument and confirm the previously-used library loads (not the
// welcome screen). Requires a prior run to have persisted lastFolder.
import { spawn, execSync } from 'node:child_process'
import { resolve } from 'node:path'

// child.kill() won't reap the Electron process tree on Windows; a lingering instance keeps
// the single-instance lock + debug port and the next run attaches to the wrong window.
function killStaleInstances() {
  try {
    execSync('taskkill /F /IM md-reader.exe /T', { stdio: 'ignore' })
  } catch {
    /* none running */
  }
}

const PORT = 9224
const EXE = resolve('dist/win-unpacked/md-reader.exe')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let nextId = 1
const pending = new Map()
let ws

function send(method, params = {}) {
  const id = nextId++
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((res, rej) => {
    pending.set(id, { res, rej })
    setTimeout(() => pending.has(id) && (pending.delete(id), rej(new Error('timeout'))), 15000)
  })
}
const evalJS = (expression) =>
  send('Runtime.evaluate', { expression, returnByValue: true }).then((r) => r.result?.value)

async function getWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const t = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(
        (x) => x.type === 'page' && x.webSocketDebuggerUrl
      )
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
  await sleep(600) // let the OS release the single-instance lock before relaunching
  const child = spawn(EXE, [`--remote-debugging-port=${PORT}`, '--remote-allow-origins=*'], {
    stdio: 'ignore'
  })
  ws = new WebSocket(await getWs())
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
  await send('Runtime.enable')

  let books = 0
  let reader = false
  let welcome = false
  for (let i = 0; i < 25; i++) {
    await sleep(400)
    books = (await evalJS(`document.querySelectorAll('.book').length`)) || 0
    reader = await evalJS(`!!document.querySelector('.reader-content')`)
    welcome = await evalJS(`!!document.querySelector('.empty-state')`)
    if (books > 0 || reader || welcome) break
  }
  // Restore succeeds if it reopened the last file (reader) or showed the library (books),
  // and did NOT fall back to the welcome screen.
  const ok = (books > 0 || reader) && !welcome
  console.log(JSON.stringify({ restoredBooks: books, reader, welcomeScreen: welcome }))
  console.log('RESTORE: ' + (ok ? 'PASS (library/file restored)' : 'FAIL (fell back to welcome)'))

  try {
    ws.close()
  } catch {
    /* ignore */
  }
  child.kill()
  killStaleInstances()
  setTimeout(() => process.exit(ok ? 0 : 1), 400)
}

main().catch((e) => {
  console.error('CHECK ERROR', e)
  process.exit(1)
})
