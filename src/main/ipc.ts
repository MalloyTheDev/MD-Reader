import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'fs'
import { join, relative, sep, dirname, resolve, isAbsolute, basename, extname } from 'path'
import matter from 'gray-matter'
import { watch, type FSWatcher } from 'chokidar'
import { MarkdownFileMeta, MarkdownFileContent, ReadFileResult, FileSidecar } from '../shared/types'
import * as store from './store'
import * as sidecar from './sidecar'

const MD_RE = /\.(md|markdown|mdown|mkd|mdx)$/i
const SKIP_DIRS = new Set(['node_modules', '.git', '.obsidian', '.trash', '.vscode'])

let libraryRoot: string | null = null
let watcher: FSWatcher | null = null
let changeTimer: NodeJS.Timeout | null = null

// Folders the user has explicitly authorized as a library root (via the picker dialog,
// a file-association open, or restoring the previously-used folder). Confinement checks
// are only meaningful if the renderer can't silently widen the root to anywhere on disk.
const authorizedRoots = new Set<string>()

export function authorizeRoot(p: string): void {
  authorizedRoots.add(resolve(p))
}

function isAuthorized(p: string): boolean {
  return authorizedRoots.has(resolve(p))
}

export function getLibraryRoot(): string | null {
  return libraryRoot
}

export function isInsideRoot(abs: string): boolean {
  if (!libraryRoot) return false
  const rel = relative(libraryRoot, abs)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function parseFrontmatter(raw: string): {
  content: string
  title: string | null
  author: string | null
} {
  try {
    const parsed = matter(raw)
    const data = parsed.data ?? {}
    const rawTitle = data.title ?? data.Title
    const rawAuthor = data.author ?? data.Author
    return {
      content: parsed.content,
      title: rawTitle != null ? String(rawTitle) : null,
      author: rawAuthor != null ? String(rawAuthor) : null
    }
  } catch {
    return { content: raw, title: null, author: null }
  }
}

async function walk(dir: string, root: string, out: MarkdownFileMeta[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null)
  if (!entries) return
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue
    const abs = join(dir, ent.name)
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue
      await walk(abs, root, out)
    } else if (ent.isFile() && MD_RE.test(ent.name)) {
      try {
        const st = await fs.stat(abs)
        out.push({
          name: ent.name,
          relativePath: relative(root, abs).split(sep).join('/'),
          absolutePath: abs,
          size: st.size,
          mtimeMs: st.mtimeMs
        })
      } catch {
        /* ignore unreadable files */
      }
    }
  }
}

// --- Source-code digest (for AI README generation) ---
const SRC_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|cs|c|cc|cpp|h|hpp|m|swift|scala|sh|css|scss|less|html|vue|svelte|sql|json|ya?ml|toml|md|txt|gradle)$/i
const DIGEST_SKIP = new Set([
  'node_modules',
  '.git',
  '.obsidian',
  '.trash',
  '.vscode',
  '.idea',
  'dist',
  'out',
  'build',
  '.next',
  '.nuxt',
  'coverage',
  'vendor',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  '.cache',
  '.turbo'
])
const DIGEST_MAX_FILE = 20_000
const DIGEST_MAX_TOTAL = 340_000

async function walkSource(
  dir: string,
  root: string,
  out: { rel: string; abs: string; size: number }[]
): Promise<void> {
  if (out.length > 4000) return
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null)
  if (!entries) return
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue
    const abs = join(dir, ent.name)
    if (ent.isDirectory()) {
      if (DIGEST_SKIP.has(ent.name)) continue
      await walkSource(abs, root, out)
    } else if (
      ent.isFile() &&
      (SRC_EXT.test(ent.name) || ent.name.toLowerCase() === 'dockerfile')
    ) {
      // Don't feed likely-secret files into the AI digest (dotfiles like .env are already skipped).
      if (
        /(secret|credential|password|token|\.pem$|\.key$|\.pfx$|\.p12$|\.keystore$|\.tfvars$|id_rsa|id_dsa|id_ecdsa)/i.test(
          ent.name
        )
      )
        continue
      try {
        const st = await fs.stat(abs)
        if (st.size > 400_000) continue // skip huge/minified files
        out.push({ rel: relative(root, abs).split(sep).join('/'), abs, size: st.size })
      } catch {
        /* ignore unreadable */
      }
    }
  }
}

// Redact obvious secrets from a file before it goes into the AI digest (sent to a 3rd-party LLM).
function redactSecrets(text: string): string {
  return (
    text
      .replace(
        /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
        '<redacted private key>'
      )
      // key/secret/token/password assignments: keep the name, redact the value
      .replace(
        /\b(api[_-]?key|secret|token|password|passwd|access[_-]?key|client[_-]?secret|auth|bearer)\b(\s*[:=]\s*)(['"]?)[^\s'"]{6,}\3/gi,
        '$1$2$3<redacted>$3'
      )
      // AWS access key IDs
      .replace(/\bAKIA[0-9A-Z]{16}\b/g, '<redacted>')
  )
}

function digestPriority(rel: string): number {
  const r = rel.toLowerCase()
  if (/(^|\/)package\.json$/.test(r)) return 0
  if (/(^|\/)readme/.test(r)) return 1
  if (
    /(^|\/)(cargo\.toml|go\.mod|requirements\.txt|pyproject\.toml|composer\.json|pom\.xml|build\.gradle)$/.test(
      r
    )
  )
    return 1
  if (/(tsconfig|\.config\.|\.conf\.|\.ya?ml$|\.toml$)/.test(r)) return 2
  if (/(^|\/)(src\/)?(index|main|app)\.[a-z]+$/.test(r)) return 3
  return 5
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

// Sanitize a user/AI-supplied base file or folder name to a single safe path segment:
// strips path separators & illegal chars, neutralizes ".." traversal and leading/trailing
// dots/spaces, and avoids reserved Windows device names. Never returns an empty string.
function safeSeg(name: string, fallback = 'Untitled'): string {
  let s = (name || '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\\/:*?"<>|]/g, '')
    .replace(/^[. ]+/, '')
    .replace(/[. ]+$/, '')
    .replace(/\.{2,}/g, '.')
    .trim()
  if (!s) return fallback
  if (WIN_RESERVED.test(s.split('.')[0])) s = '_' + s
  return s.slice(0, 120)
}

const EMBED_RE = /!\[\[([^\]#|\n]+?)(?:#([^\]|\n]+))?\]\]/g

async function buildNameMap(root: string): Promise<Map<string, string>> {
  const metas: MarkdownFileMeta[] = []
  await walk(root, root, metas)
  const map = new Map<string, string>()
  for (const m of metas) {
    const base = m.name.replace(MD_RE, '').toLowerCase()
    if (!map.has(base)) map.set(base, m.absolutePath)
    map.set(m.relativePath.replace(MD_RE, '').toLowerCase(), m.absolutePath)
  }
  return map
}

function sectionOf(content: string, heading: string): string {
  const lines = content.split('\n')
  const target = heading.trim().toLowerCase()
  let start = -1
  let level = 0
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.+)$/.exec(lines[i])
    if (m && m[2].trim().toLowerCase() === target) {
      start = i
      level = m[1].length
      break
    }
  }
  if (start < 0) return content
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s+/.exec(lines[i])
    if (m && m[1].length <= level) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n')
}

async function expandEmbeds(body: string, baseDir: string, root: string): Promise<string> {
  if (!body.includes('![[')) return body
  const map = await buildNameMap(root)
  let result = body
  for (const mt of [...body.matchAll(EMBED_RE)]) {
    const [full, rawName, heading] = mt
    const name = rawName.trim()
    let abs: string | undefined
    const direct = resolve(
      baseDir,
      /\.(md|markdown|mdown|mkd|mdx)$/i.test(name) ? name : name + '.md'
    )
    if (isInsideRoot(direct) && (await fileExists(direct))) abs = direct
    else abs = map.get(name.toLowerCase()) ?? map.get(name.replace(MD_RE, '').toLowerCase())
    if (!abs) {
      result = result.replace(full, `*↳ embedded note “${name}” not found*`)
      continue
    }
    try {
      const inner = parseFrontmatter(await fs.readFile(abs, 'utf8')).content
      const slice = heading ? sectionOf(inner, heading) : inner
      result = result.replace(full, `\n\n*↳ ${name}*\n\n${slice.trim()}\n\n`)
    } catch {
      result = result.replace(full, `*↳ could not read “${name}”*`)
    }
  }
  return result
}

function stopWatching(): void {
  if (watcher) {
    watcher.close().catch(() => {})
    watcher = null
  }
}

function startWatching(root: string): void {
  stopWatching()
  watcher = watch(root, {
    ignoreInitial: true,
    depth: 16,
    ignored: (p: string) => /(^|[\\/])(\.[^\\/]+|node_modules)([\\/]|$)/.test(p),
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
  })
  const notify = (): void => {
    if (changeTimer) clearTimeout(changeTimer)
    changeTimer = setTimeout(() => {
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send('library:changed')
    }, 400)
  }
  watcher
    .on('add', notify)
    .on('unlink', notify)
    .on('change', notify)
    .on('addDir', notify)
    .on('unlinkDir', notify)
}

export function registerIpc(): void {
  ipcMain.handle('library:pickFolder', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      properties: ['openDirectory'],
      title: 'Choose your library folder'
    })
    if (res.canceled || res.filePaths.length === 0) return null
    libraryRoot = res.filePaths[0]
    authorizeRoot(libraryRoot)
    startWatching(libraryRoot)
    return libraryRoot
  })

  // The managed "vault": a dedicated library under Documents/MD Reader. Created on demand,
  // seeded with a welcome note the first time, and authorized as a root.
  ipcMain.handle('library:openVault', async () => {
    const dir = join(app.getPath('documents'), 'MD Reader')
    const existed = await fileExists(dir)
    await fs.mkdir(dir, { recursive: true })
    if (!existed) {
      const welcome = join(dir, 'Welcome.md')
      await fs
        .writeFile(
          welcome,
          '# Welcome to your MD Reader vault\n\nThis folder is your personal Markdown library — everything you create or import lives here, in one place.\n\n- Make collections with **New folder** (e.g. "Coding Projects", "Studying").\n- **Import** existing Markdown to bring it in.\n- Generate notes, courses, and READMEs with AI — they save here too.\n',
          'utf8'
        )
        .catch(() => {})
    }
    libraryRoot = dir
    authorizeRoot(dir)
    startWatching(dir)
    return dir
  })

  // Create a named collection (subfolder) inside the current library/vault root.
  ipcMain.handle('folder:create', async (_e, name: string) => {
    if (!libraryRoot) throw new Error('No library open')
    const safe = safeSeg(name, 'New Folder')
    let dir = join(libraryRoot, safe)
    let i = 1
    while (await fileExists(dir)) {
      dir = join(libraryRoot, `${safe} ${i}`)
      i++
    }
    if (!isInsideRoot(resolve(dir))) throw new Error('Access denied')
    await fs.mkdir(dir, { recursive: true })
    return dir
  })

  // Import Markdown files (copy) into the vault, optionally into a named collection.
  ipcMain.handle('library:importFiles', async (e, subdir: string) => {
    if (!libraryRoot) throw new Error('No library open')
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      properties: ['openFile', 'multiSelections'],
      title: 'Import Markdown files',
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mdx'] }]
    })
    if (res.canceled) return 0
    // `subdir` is an existing collection's relative path chosen in the UI; the isInsideRoot
    // guard (not safeSeg) is what prevents traversal here so nested paths are preserved.
    const targetDir = subdir ? join(libraryRoot, subdir) : libraryRoot
    if (!isInsideRoot(resolve(targetDir))) throw new Error('Access denied')
    await fs.mkdir(targetDir, { recursive: true })
    let count = 0
    for (const src of res.filePaths) {
      if (!MD_RE.test(src)) continue
      const base = safeSeg(basename(src, extname(src)), 'Imported')
      let dest = join(targetDir, base + '.md')
      let i = 1
      while (await fileExists(dest)) {
        dest = join(targetDir, `${base} ${i}.md`)
        i++
      }
      if (!isInsideRoot(resolve(dest))) continue
      try {
        await fs.copyFile(src, dest)
        count++
      } catch {
        /* skip unreadable file */
      }
    }
    return count
  })

  // Import an entire folder of Markdown (copy) into a new collection, preserving structure.
  ipcMain.handle('library:importFolder', async (e) => {
    if (!libraryRoot) throw new Error('No library open')
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      properties: ['openDirectory'],
      title: 'Import a folder of Markdown'
    })
    if (res.canceled || res.filePaths.length === 0) return 0
    const srcRoot = res.filePaths[0]
    const metas: MarkdownFileMeta[] = []
    await walk(srcRoot, srcRoot, metas)
    if (metas.length === 0) return 0
    const collName = safeSeg(basename(srcRoot), 'Imported')
    let collDir = join(libraryRoot, collName)
    let n = 1
    while (await fileExists(collDir)) {
      collDir = join(libraryRoot, `${collName} ${n}`)
      n++
    }
    if (!isInsideRoot(resolve(collDir))) throw new Error('Access denied')
    let count = 0
    for (const m of metas) {
      const segs = m.relativePath.split('/')
      const rel = segs.map((seg, idx) =>
        idx === segs.length - 1
          ? safeSeg(basename(seg, extname(seg)), 'Imported') + '.md'
          : safeSeg(seg, 'folder')
      )
      const dest = join(collDir, ...rel)
      if (!isInsideRoot(resolve(dest))) continue
      try {
        await fs.mkdir(dirname(dest), { recursive: true })
        await fs.copyFile(m.absolutePath, dest)
        count++
      } catch {
        /* skip */
      }
    }
    return count
  })

  // Read a digest of a user-picked project's source (read-only) for AI README generation.
  ipcMain.handle('project:digest', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      properties: ['openDirectory'],
      title: 'Choose a project folder to document'
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const root = res.filePaths[0]
    const files: { rel: string; abs: string; size: number }[] = []
    await walkSource(root, root, files)
    const name = basename(root)
    if (files.length === 0) return { name, digest: '', fileCount: 0 }
    files.sort((a, b) => digestPriority(a.rel) - digestPriority(b.rel) || a.size - b.size)
    const tree = files
      .map((f) => f.rel)
      .slice(0, 600)
      .join('\n')
    const parts: string[] = [`Project: ${name}`, '', 'File tree:', tree]
    let total = tree.length + 40
    for (const f of files) {
      if (total >= DIGEST_MAX_TOTAL) break
      const content = await fs.readFile(f.abs, 'utf8').catch(() => '')
      if (!content) continue
      const slice = redactSecrets(content).slice(0, DIGEST_MAX_FILE)
      const block = `\n--- ${f.rel} ---\n${slice}`
      if (total + block.length > DIGEST_MAX_TOTAL) break
      parts.push(block)
      total += block.length
    }
    return { name, digest: parts.join('\n'), fileCount: files.length }
  })

  ipcMain.handle('library:listMarkdown', async (_e, folderPath: string) => {
    const root = resolve(folderPath)
    if (!isAuthorized(root)) {
      // Allow restoring the previously-used folder; otherwise refuse to widen the root.
      const persisted = (await store.getState()).lastFolder
      if (persisted && resolve(persisted) === root) authorizeRoot(root)
      else throw new Error('Folder not authorized — open it with the folder picker.')
    }
    libraryRoot = root
    startWatching(root)
    const out: MarkdownFileMeta[] = []
    await walk(root, root, out)
    out.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true }))
    return out
  })

  ipcMain.handle('library:readAll', async (_e, folderPath: string) => {
    const root = resolve(folderPath)
    if (!isAuthorized(root)) throw new Error('Folder not authorized')
    libraryRoot = root
    const metas: MarkdownFileMeta[] = []
    await walk(root, root, metas)
    const out: MarkdownFileContent[] = []
    for (const m of metas) {
      try {
        const raw = await fs.readFile(m.absolutePath, 'utf8')
        const fm = parseFrontmatter(raw)
        out.push({
          absolutePath: m.absolutePath,
          relativePath: m.relativePath,
          name: m.name,
          content: fm.content,
          title: fm.title,
          author: fm.author
        })
      } catch {
        /* ignore */
      }
    }
    return out
  })

  ipcMain.handle('file:read', async (_e, filePath: string): Promise<ReadFileResult> => {
    const abs = resolve(filePath)
    if (!libraryRoot || !isInsideRoot(abs)) {
      throw new Error('Access denied: file is outside the library folder')
    }
    const raw = await fs.readFile(abs, 'utf8')
    const fm = parseFrontmatter(raw)
    const content = await expandEmbeds(fm.content, dirname(abs), libraryRoot ?? dirname(abs))
    return { content, raw, baseDir: dirname(abs), title: fm.title, author: fm.author }
  })

  ipcMain.handle('file:write', async (_e, filePath: string, content: string) => {
    const abs = resolve(filePath)
    if (!libraryRoot || !isInsideRoot(abs)) {
      throw new Error('Access denied: file is outside the library folder')
    }
    await fs.writeFile(abs, content, 'utf8')
  })

  ipcMain.handle('file:newFile', async (_e, folderPath: string, name: string) => {
    const safe = safeSeg(name)
    let target = join(folderPath, safe + '.md')
    let i = 1
    while (await fileExists(target)) {
      target = join(folderPath, `${safe} ${i}.md`)
      i++
    }
    if (!libraryRoot || !isInsideRoot(resolve(target))) {
      throw new Error('Access denied')
    }
    await fs.writeFile(target, `# ${safe}\n\n`, 'utf8')
    return target
  })

  // Move a library file to the OS Recycle Bin/Trash (recoverable, never a silent permanent delete).
  ipcMain.handle('file:trash', async (_e, filePath: string) => {
    const abs = resolve(filePath)
    if (!libraryRoot || !isInsideRoot(abs)) {
      return { ok: false, error: 'That file is outside the current library.' }
    }
    if (!(await fileExists(abs))) {
      return { ok: false, error: 'The file no longer exists on disk.' }
    }
    try {
      await shell.trashItem(abs)
      return { ok: true }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not move the file to the Recycle Bin.'
      }
    }
  })

  // Move a whole collection folder (and its contents) to the Recycle Bin.
  ipcMain.handle('folder:trash', async (_e, folderRel: string) => {
    if (!libraryRoot) return { ok: false, error: 'No library is open.' }
    const abs = resolve(join(libraryRoot, folderRel))
    if (!isInsideRoot(abs) || abs === resolve(libraryRoot)) {
      return { ok: false, error: 'That folder is outside the current library.' }
    }
    if (!(await fileExists(abs))) return { ok: false, error: 'The folder no longer exists.' }
    try {
      await shell.trashItem(abs)
      return { ok: true }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not move the folder to the Recycle Bin.'
      }
    }
  })

  // Return which of the given paths no longer exist on disk (for "missing file" cleanup).
  ipcMain.handle('library:checkMissing', async (_e, paths: string[]) => {
    const missing: string[] = []
    for (const p of Array.isArray(paths) ? paths : []) {
      if (typeof p === 'string' && !(await fileExists(p))) missing.push(p)
    }
    return missing
  })

  // Create a course pack: a new subfolder of related notes written together. Returns the
  // absolute path of the first file (the Overview) so the renderer can open it.
  ipcMain.handle(
    'course:create',
    async (_e, opts: { folderName: string; files: { name: string; content: string }[] }) => {
      if (!libraryRoot) throw new Error('No library folder is open.')
      const safeFolder = safeSeg(opts.folderName, 'Course')
      let dir = join(libraryRoot, safeFolder)
      let i = 1
      while (await fileExists(dir)) {
        dir = join(libraryRoot, `${safeFolder} ${i}`)
        i++
      }
      if (!isInsideRoot(resolve(dir))) throw new Error('Access denied')
      await fs.mkdir(dir, { recursive: true })
      let firstPath: string | null = null
      for (const f of Array.isArray(opts.files) ? opts.files : []) {
        const safeName = safeSeg(f.name)
        const target = join(dir, safeName + '.md')
        if (!isInsideRoot(resolve(target))) continue
        await fs.writeFile(target, typeof f.content === 'string' ? f.content : '', 'utf8')
        if (!firstPath) firstPath = target
      }
      return firstPath
    }
  )

  // Save a pasted/dropped image into an `assets` folder next to the document.
  // Returns the relative href to embed (e.g. "assets/pasted-123.png").
  ipcMain.handle(
    'file:saveImage',
    async (_e, opts: { baseDir: string; name: string; data: Uint8Array }) => {
      const baseAbs = resolve(opts.baseDir)
      if (!libraryRoot || !isInsideRoot(baseAbs)) {
        throw new Error('Access denied: target is outside the library folder')
      }
      const assetsDir = join(baseAbs, 'assets')
      const rawName = (opts.name || 'image').replace(/[\\/:*?"<>|]/g, '').trim()
      let ext = extname(rawName).toLowerCase()
      if (!/^\.(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(ext)) ext = '.png'
      const stem = safeSeg(basename(rawName, extname(rawName)) || 'image', 'image')
        .replace(/\s+/g, '-')
        .slice(0, 60)
      let target = join(assetsDir, stem + ext)
      let i = 1
      while (await fileExists(target)) {
        target = join(assetsDir, `${stem}-${i}${ext}`)
        i++
      }
      if (!isInsideRoot(resolve(target))) throw new Error('Access denied')
      await fs.mkdir(assetsDir, { recursive: true })
      await fs.writeFile(target, Buffer.from(opts.data))
      return 'assets/' + basename(target)
    }
  )

  ipcMain.handle(
    'export:save',
    async (
      e,
      opts: {
        defaultName: string
        content: string
        filters: { name: string; extensions: string[] }[]
      }
    ) => {
      const win = BrowserWindow.fromWebContents(e.sender) ?? BrowserWindow.getAllWindows()[0]
      const res = await dialog.showSaveDialog(win, {
        defaultPath: opts.defaultName,
        filters: opts.filters
      })
      if (res.canceled || !res.filePath) return false
      await fs.writeFile(res.filePath, opts.content, 'utf8')
      return true
    }
  )

  ipcMain.handle('export:docx', async (e, opts: { defaultName: string; html: string }) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? BrowserWindow.getAllWindows()[0]
    const res = await dialog.showSaveDialog(win, {
      defaultPath: opts.defaultName,
      filters: [{ name: 'Word document', extensions: ['docx'] }]
    })
    if (res.canceled || !res.filePath) return false
    const mod = await import('html-to-docx')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const HTMLtoDOCX = ((mod as any).default ?? mod) as (
      html: string
    ) => Promise<ArrayBuffer | Buffer>
    const out = await HTMLtoDOCX(opts.html)
    await fs.writeFile(res.filePath, Buffer.from(out as ArrayBuffer))
    return true
  })

  ipcMain.handle('settings:get', () => store.getSettings())
  ipcMain.handle('settings:set', (_e, patch) => store.setSettings(patch))
  ipcMain.handle('state:get', () => store.getState())
  ipcMain.handle('state:set', (_e, patch) => store.setState(patch))

  ipcMain.handle('sidecar:load', async () => {
    if (!libraryRoot) return {}
    return sidecar.loadSidecar(libraryRoot)
  })

  ipcMain.handle('sidecar:save', async (_e, filePath: string, data: FileSidecar) => {
    const abs = resolve(filePath)
    if (!libraryRoot || !isInsideRoot(abs)) return
    await sidecar.saveSidecarFile(libraryRoot, abs, data)
  })

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
    return Promise.resolve()
  })

  // Reveal a library file (e.g. an image) in the OS file explorer. Confined to the library root.
  ipcMain.handle('shell:showItem', (_e, base: string, p: string) => {
    const abs = isAbsolute(p) ? resolve(p) : resolve(base, p)
    if (!libraryRoot || !isInsideRoot(abs)) return false
    shell.showItemInFolder(abs)
    return true
  })
}
