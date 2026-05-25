import { app, shell, BrowserWindow, protocol, net, screen, ipcMain } from 'electron'
import { join, resolve, relative, isAbsolute, dirname } from 'path'
import { existsSync, appendFileSync, realpathSync } from 'fs'
import { tmpdir } from 'os'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIpc, getLibraryRoot, authorizeRoot } from './ipc'
import { registerAiIpc } from './ai'
import * as store from './store'
import type { WindowBounds } from '../shared/types'

// Lightweight crash logger: a packaged desktop app has no console, so persist
// fatal main-process errors to a temp file for post-mortem debugging.
const CRASH_LOG = join(tmpdir(), 'mdreader-crash.log')
function logCrash(kind: string, e: unknown): void {
  try {
    const detail = e instanceof Error ? e.stack || e.message : String(e)
    appendFileSync(CRASH_LOG, `${new Date().toISOString()} ${kind} ${detail}\n`)
  } catch {
    /* ignore */
  }
}
process.on('uncaughtException', (e) => logCrash('uncaughtException', e))
process.on('unhandledRejection', (e) => logCrash('unhandledRejection', e))

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mdimg',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

const MD_ARG_RE = /\.(md|markdown|mdown|mkd|mdx)$/i

/** Find a Markdown file path passed on the command line (file association / CLI). */
function findMdArg(argv: string[]): string | null {
  for (const a of argv.slice(1)) {
    if (a.startsWith('-')) continue
    if (MD_ARG_RE.test(a)) {
      const abs = resolve(a)
      if (existsSync(abs)) return abs
    }
  }
  return null
}

let pendingOpenPath: string | null = findMdArg(process.argv)

function sendOpenPath(p: string): void {
  authorizeRoot(dirname(p))
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) {
    pendingOpenPath = p
    return
  }
  if (win.isMinimized()) win.restore()
  win.focus()
  win.webContents.send('app:openPath', p)
}

function boundsVisible(b: WindowBounds): boolean {
  if (b.x == null || b.y == null) return true
  return screen.getAllDisplays().some((d) => {
    const wa = d.workArea
    return (
      b.x! < wa.x + wa.width &&
      b.x! + b.width > wa.x &&
      b.y! < wa.y + wa.height &&
      b.y! + b.height > wa.y
    )
  })
}

function createWindow(saved: WindowBounds | null): void {
  const use = saved && boundsVisible(saved) ? saved : null
  const mainWindow = new BrowserWindow({
    width: use?.width ?? 1180,
    height: use?.height ?? 820,
    ...(use && use.x != null && use.y != null ? { x: use.x, y: use.y } : {}),
    minWidth: 700,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    title: 'MD Reader',
    icon,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  let saveTimer: NodeJS.Timeout | null = null
  const saveBounds = (): void => {
    if (mainWindow.isDestroyed() || mainWindow.isMinimized() || mainWindow.isFullScreen()) return
    const b = mainWindow.getBounds()
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => store.setWindowBounds(b), 400)
  }
  mainWindow.on('resize', saveBounds)
  mainWindow.on('move', saveBounds)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (/^https?:\/\//i.test(details.url)) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Keep the renderer pinned to the app shell; route any external navigation out.
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (url === mainWindow.webContents.getURL()) return
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (is.dev && devUrl && url.startsWith(devUrl)) return
    e.preventDefault()
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  // A second launch (e.g. opening another .md) focuses this instance and opens the file.
  app.on('second-instance', (_e, argv) => {
    const p = findMdArg(argv)
    if (p) {
      sendOpenPath(p)
    } else {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        if (win.isMinimized()) win.restore()
        win.focus()
      }
    }
  })

  // macOS delivers file-open via this event rather than argv.
  app.on('open-file', (e, p) => {
    e.preventDefault()
    if (BrowserWindow.getAllWindows().length === 0) pendingOpenPath = p
    else sendOpenPath(p)
  })

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.mdreader.app')

    protocol.handle('mdimg', (request) => {
      const url = new URL(request.url)
      const base = decodeURIComponent(url.searchParams.get('base') ?? '')
      const p = decodeURIComponent(url.searchParams.get('p') ?? '')
      const abs = isAbsolute(p) ? p : resolve(base, p)
      const root = getLibraryRoot()
      if (!root) throw new Error('Forbidden: no library open')
      const rel = relative(root, abs)
      if (rel.startsWith('..') || isAbsolute(rel)) {
        throw new Error('Forbidden: image outside library root')
      }
      // Resolve symlinks and re-check containment so a symlink inside the library
      // can't be used to read a file outside the root.
      let real = abs
      try {
        real = realpathSync(abs)
      } catch {
        /* missing file - let net.fetch return the 404 */
      }
      const relReal = relative(root, real)
      if (relReal.startsWith('..') || isAbsolute(relReal)) {
        throw new Error('Forbidden: image outside library root')
      }
      return net.fetch(pathToFileURL(real).toString())
    })

    registerIpc()
    registerAiIpc()

    // The renderer asks for this once on startup (avoids a race with the push event).
    ipcMain.handle('app:getPendingOpenPath', () => {
      const p = pendingOpenPath
      pendingOpenPath = null
      if (p) authorizeRoot(dirname(p))
      return p
    })

    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

    const bounds = await store.getWindowBounds()
    createWindow(bounds)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(null)
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
