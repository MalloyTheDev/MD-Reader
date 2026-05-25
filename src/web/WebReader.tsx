import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { renderBodyHtml, renderDocHtml } from '../renderer/src/lib/export'
import { buildIndex, runLibrarySearch } from '../renderer/src/lib/search'
import { computeDocStats } from '../renderer/src/lib/docinfo'
import type { MarkdownFileContent } from '../shared/types'

interface Doc {
  name: string
  content: string
}
interface Heading {
  id: string
  text: string
  level: number
}

const THEMES = ['light', 'sepia', 'dark', 'nord'] as const
type Theme = (typeof THEMES)[number]

const MD_RE = /\.(md|markdown|mdown|mkd|mdx|txt)$/i
const DOCS_KEY = 'mdreader-web-docs'
const THEME_KEY = 'mdreader-web-theme'
const WIDTH_KEY = 'mdreader-web-width'
const ZOOM_KEY = 'mdreader-web-zoom'
const POS_KEY = 'mdreader-web-pos'

const WIDTHS = ['narrow', 'normal', 'wide'] as const
type Width = (typeof WIDTHS)[number]
const WIDTH_PX: Record<Width, number> = { narrow: 640, normal: 820, wide: 1040 }
const MIN_ZOOM = 0.8
const MAX_ZOOM = 1.6

// Minimal File System Access typings (Chromium-only; feature-detected before use).
interface FsHandle {
  kind: 'file' | 'directory'
  name: string
  getFile?: () => Promise<File>
  values?: () => AsyncIterable<FsHandle>
}
type DirPicker = () => Promise<FsHandle>

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
}

function loadDocs(): Doc[] {
  try {
    const raw = localStorage.getItem(DOCS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) {
      return arr.filter((d) => d && typeof d.name === 'string' && typeof d.content === 'string')
    }
  } catch {
    /* ignore bad/oversized storage */
  }
  return []
}

function loadTheme(): Theme {
  const t = (typeof localStorage !== 'undefined' && localStorage.getItem(THEME_KEY)) || ''
  return (THEMES as readonly string[]).includes(t) ? (t as Theme) : 'sepia'
}

function loadWidth(): Width {
  const w = (typeof localStorage !== 'undefined' && localStorage.getItem(WIDTH_KEY)) || ''
  return (WIDTHS as readonly string[]).includes(w) ? (w as Width) : 'normal'
}

function loadZoom(): number {
  const z = Number((typeof localStorage !== 'undefined' && localStorage.getItem(ZOOM_KEY)) || '')
  return z >= MIN_ZOOM && z <= MAX_ZOOM ? z : 1
}

function loadPositions(): Record<string, number> {
  try {
    const obj = JSON.parse(localStorage.getItem(POS_KEY) || '{}')
    if (obj && typeof obj === 'object') {
      const out: Record<string, number> = {}
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
      }
      return out
    }
  } catch {
    /* ignore bad storage */
  }
  return {}
}

// Which heading is currently at the top of the reading pane (for outline scroll-spy).
function activeHeadingFor(el: HTMLElement, items: Heading[]): string {
  if (!items.length) return ''
  const top = el.getBoundingClientRect().top
  let current = items[0].id
  for (const h of items) {
    const node = document.getElementById(h.id)
    if (!node) continue
    if (node.getBoundingClientRect().top - top <= 84) current = h.id
    else break
  }
  return current
}

// Bake copy buttons into code blocks and copy-link anchors into headings, as part of the
// rendered HTML string so they survive React re-renders. Clicks are handled by delegation.
function augmentHtml(html: string): string {
  let out = html.replace(
    /(<pre(?:\s[^>]*)?>)(<code)/g,
    '$1<button class="web-codecopy" type="button" aria-label="Copy code">Copy</button>$2'
  )
  out = out.replace(
    /<h([1-6])([^>]*\sid="([^"]+)"[^>]*)>([\s\S]*?)<\/h\1>/g,
    (_m, lvl, attrs, id, inner) =>
      `<h${lvl}${attrs}>${inner}<button class="web-anchor" type="button" data-anchor="${id}" aria-label="Copy link to section">#</button></h${lvl}>`
  )
  return out
}

export function WebReader(): React.JSX.Element {
  const [docs, setDocs] = useState<Doc[]>(loadDocs)
  const [active, setActive] = useState(0)
  const [html, setHtml] = useState('')
  const [rendering, setRendering] = useState(false)
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [query, setQuery] = useState('')
  const [outline, setOutline] = useState<Heading[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [progress, setProgress] = useState(0)
  const [activeHeadingId, setActiveHeadingId] = useState('')
  const [width, setWidth] = useState<Width>(loadWidth)
  const [zoom, setZoom] = useState<number>(loadZoom)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const docRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const positionsRef = useRef<Record<string, number>>(loadPositions())
  const lastDocRef = useRef<string>('')
  const renderedDocRef = useRef<string>('')
  const posTimer = useRef<number | undefined>(undefined)

  const activeDoc = docs[active]

  const persistPositions = useCallback(() => {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(positionsRef.current))
    } catch {
      /* ignore quota */
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* ignore quota */
    }
  }, [theme])

  // Persist the open set so a refresh keeps your session.
  useEffect(() => {
    try {
      localStorage.setItem(DOCS_KEY, JSON.stringify(docs))
    } catch {
      /* too large for storage - skip persistence */
    }
  }, [docs])

  // Persist reading-display preferences.
  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, width)
      localStorage.setItem(ZOOM_KEY, String(zoom))
    } catch {
      /* ignore quota */
    }
  }, [width, zoom])

  // Render the active document with the desktop app's exact, sanitized pipeline.
  useEffect(() => {
    let cancelled = false
    if (!activeDoc) {
      renderedDocRef.current = ''
      setHtml('')
      setOutline([])
      return
    }
    const name = activeDoc.name
    setRendering(true)
    renderBodyHtml(activeDoc.content, theme)
      .then((out) => {
        if (!cancelled) {
          renderedDocRef.current = name
          setHtml(augmentHtml(out))
          setRendering(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          renderedDocRef.current = name
          setHtml('<p>Could not render this document.</p>')
          setRendering(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [activeDoc, theme])

  // After render: build the outline, enhance code blocks and headings, and restore the
  // saved scroll position when the document (not just the theme) has changed.
  useEffect(() => {
    const root = docRef.current
    if (!root || !html) {
      setOutline([])
      lastDocRef.current = ''
      return
    }
    const seen = new Set<string>()
    const items: Heading[] = []
    root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el) => {
      const text = (el.textContent || '').trim()
      if (!text) return
      let id = el.id
      if (!id) {
        id = slugify(text) || 'h'
        let n = 1
        while (seen.has(id)) id = `${slugify(text)}-${n++}`
        el.id = id
      }
      seen.add(id)
      items.push({ id, text, level: Number(el.tagName.slice(1)) })
    })
    setOutline(items)

    const el = mainRef.current
    const name = renderedDocRef.current
    if (el && name && name !== lastDocRef.current) {
      lastDocRef.current = name
      el.scrollTop = positionsRef.current[name] ?? 0
    }
    if (el) {
      const max = el.scrollHeight - el.clientHeight
      setProgress(max > 0 ? Math.min(1, el.scrollTop / max) : 0)
    }
    setActiveHeadingId(el ? activeHeadingFor(el, items) : items[0]?.id ?? '')
  }, [html])

  // Leaving a document active means leaving edit mode for it.
  useEffect(() => {
    setEditing(false)
  }, [active])

  // Commit edits to the in-app copy (and localStorage) shortly after typing stops.
  useEffect(() => {
    if (!editing || !activeDoc) return
    const name = activeDoc.name
    const id = window.setTimeout(() => {
      setDocs((prev) => prev.map((d) => (d.name === name && d.content !== draft ? { ...d, content: draft } : d)))
    }, 300)
    return () => window.clearTimeout(id)
  }, [draft, editing, activeDoc])

  // Reader keyboard shortcuts: focus/clear search, move between docs, toggle help.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      const inField = tag === 'input' || tag === 'textarea'
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchInput.current?.focus()
        searchInput.current?.select()
      } else if (e.key === '?' && !inField) {
        e.preventDefault()
        setShowHelp((h) => !h)
      } else if (e.key === 'Escape') {
        if (showHelp) setShowHelp(false)
        else if (query || document.activeElement === searchInput.current) {
          setQuery('')
          searchInput.current?.blur()
        }
      } else if (mod && (e.key === '[' || e.key === ']') && docs.length > 1) {
        e.preventDefault()
        const dir = e.key === ']' ? 1 : -1
        setActive((a) => Math.max(0, Math.min(docs.length - 1, a + dir)))
        setQuery('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [docs.length, query, showHelp])

  const searchIndex = useMemo(() => {
    const files: MarkdownFileContent[] = docs.map((d) => ({
      absolutePath: d.name,
      relativePath: d.name,
      name: d.name,
      content: d.content,
      title: null,
      author: null
    }))
    return buildIndex(files)
  }, [docs])

  const results = useMemo(
    () => (query.trim() ? runLibrarySearch(searchIndex, query) : []),
    [searchIndex, query]
  )

  const stats = useMemo(
    () => (activeDoc ? computeDocStats(activeDoc.content) : null),
    [activeDoc]
  )

  const addDocs = useCallback((incoming: Doc[]) => {
    if (incoming.length === 0) return
    setDocs((prev) => {
      const merged = [...prev]
      for (const d of incoming) {
        const i = merged.findIndex((m) => m.name === d.name)
        if (i >= 0) merged[i] = d
        else merged.push(d)
      }
      return merged
    })
  }, [])

  const readFiles = useCallback(
    async (files: File[]) => {
      const md = files.filter((f) => MD_RE.test(f.name))
      const read = await Promise.all(
        md.map(async (f) => ({ name: f.name, content: await f.text() }))
      )
      addDocs(read)
    },
    [addDocs]
  )

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      void readFiles(Array.from(e.target.files ?? []))
      e.target.value = ''
    },
    [readFiles]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      void readFiles(Array.from(e.dataTransfer.files))
    },
    [readFiles]
  )

  const openFolder = useCallback(async () => {
    const picker = (window as unknown as { showDirectoryPicker?: DirPicker }).showDirectoryPicker
    if (!picker) return
    try {
      const out: Doc[] = []
      const walk = async (h: FsHandle, prefix: string): Promise<void> => {
        if (!h.values) return
        for await (const entry of h.values()) {
          if (entry.kind === 'file' && MD_RE.test(entry.name) && entry.getFile) {
            const file = await entry.getFile()
            out.push({ name: prefix + entry.name, content: await file.text() })
          } else if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
            await walk(entry, prefix + entry.name + '/')
          }
        }
      }
      await walk(await picker(), '')
      addDocs(out)
    } catch {
      /* user cancelled the picker */
    }
  }, [addDocs])

  const openByName = useCallback(
    (name: string) => {
      const i = docs.findIndex((d) => d.name === name)
      if (i >= 0) {
        setActive(i)
        setQuery('')
      }
    },
    [docs]
  )

  const scrollToHeading = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Delegated clicks for the copy buttons and section anchors baked into the rendered HTML.
  const onDocClick = useCallback((e: React.MouseEvent) => {
    const t = e.target as HTMLElement
    if (t.classList?.contains('web-codecopy')) {
      const text = t.parentElement?.querySelector('code')?.textContent ?? ''
      void navigator.clipboard
        ?.writeText(text)
        .then(() => {
          t.textContent = 'Copied'
          window.setTimeout(() => {
            t.textContent = 'Copy'
          }, 1200)
        })
        .catch(() => {})
    } else if (t.classList?.contains('web-anchor')) {
      e.stopPropagation()
      const link = location.origin + location.pathname + '#' + (t.getAttribute('data-anchor') || '')
      void navigator.clipboard
        ?.writeText(link)
        .then(() => {
          t.classList.add('is-copied')
          window.setTimeout(() => t.classList.remove('is-copied'), 1000)
        })
        .catch(() => {})
    }
  }, [])

  // Drive the progress bar, highlight the in-view heading, and remember the scroll position.
  const onMainScroll = useCallback(() => {
    const el = mainRef.current
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    setProgress(max > 0 ? Math.min(1, el.scrollTop / max) : 0)
    setActiveHeadingId(activeHeadingFor(el, outline))
    const name = activeDoc?.name
    // Only record once the active doc's content is actually live, so a transition
    // clamp does not overwrite the saved position.
    if (name && name === renderedDocRef.current) {
      positionsRef.current[name] = el.scrollTop
      if (posTimer.current) window.clearTimeout(posTimer.current)
      posTimer.current = window.setTimeout(persistPositions, 400)
    }
  }, [outline, activeDoc, persistPositions])

  // Save the current document as a self-contained HTML file (math, diagrams, and
  // charts are baked in), reusing the desktop export pipeline.
  const downloadHtml = useCallback(async () => {
    if (!activeDoc) return
    const title = activeDoc.name.replace(MD_RE, '')
    const full = await renderDocHtml(activeDoc.content, title, theme)
    const url = URL.createObjectURL(new Blob([full], { type: 'text/html' }))
    const a = document.createElement('a')
    a.href = url
    a.download = title + '.html'
    a.click()
    URL.revokeObjectURL(url)
  }, [activeDoc, theme])

  const closeDoc = useCallback(
    (name: string, e: React.MouseEvent) => {
      e.stopPropagation()
      setDocs((prev) => prev.filter((d) => d.name !== name))
      setActive((a) => Math.max(0, Math.min(a, docs.length - 2)))
    },
    [docs.length]
  )

  const hasDirPicker =
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'

  return (
    <div
      className="web-app"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {docs.length > 0 && !editing && (
        <div className="web-progress" aria-hidden="true">
          <div className="web-progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <header className="web-header">
        <span className="web-brand">
          📖 MD Reader <span className="web-tag">web</span>
        </span>
        {activeDoc && (
          <span className="web-doc-title">
            {activeDoc.name.replace(MD_RE, '')}
            {stats && (
              <span className="web-stats">
                {stats.words.toLocaleString()} words · {stats.readingMin} min read
              </span>
            )}
          </span>
        )}
        <div className="web-actions">
          <button type="button" className="web-btn" onClick={() => fileInput.current?.click()}>
            Open files
          </button>
          {hasDirPicker && (
            <button type="button" className="web-btn" onClick={() => void openFolder()}>
              Open folder
            </button>
          )}
          {activeDoc && (
            <button
              type="button"
              className={'web-btn' + (editing ? ' web-primary' : '')}
              onClick={() => {
                if (editing) {
                  setEditing(false)
                } else {
                  setDraft(activeDoc.content)
                  setEditing(true)
                }
              }}
            >
              {editing ? 'Done' : 'Edit'}
            </button>
          )}
          {activeDoc && (
            <button type="button" className="web-btn" onClick={() => void downloadHtml()}>
              Download HTML
            </button>
          )}
          <select
            className="web-select"
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
            aria-label="Theme"
          >
            {THEMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="web-btn"
            onClick={() => setShowHelp(true)}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            ?
          </button>
          <a
            className="web-btn web-ghost"
            href="https://github.com/MalloyTheDev/MD-Reader/releases/latest"
          >
            Get the desktop app
          </a>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".md,.markdown,.mdown,.mkd,.mdx,.txt"
          multiple
          hidden
          onChange={onPick}
        />
      </header>

      <div className="web-body">
        {docs.length > 0 && (
          <nav className="web-sidebar" aria-label="Documents and search">
            <input
              ref={searchInput}
              className="web-search"
              type="search"
              placeholder="Search all docs (tag:, has:math, ...)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query.trim() ? (
              <div className="web-results">
                <div className="web-side-label">
                  {results.length} result{results.length === 1 ? '' : 's'}
                </div>
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="web-result"
                    onClick={() => openByName(r.id)}
                    title={r.id}
                  >
                    <span className="web-result-title">{r.title}</span>
                    {(r.matches[0] || r.snippet) && (
                      <span className="web-result-snip">{r.matches[0] || r.snippet}</span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="web-side-label">Display</div>
                <div className="web-display">
                  <div className="web-segmented" role="group" aria-label="Reading width">
                    {WIDTHS.map((w) => (
                      <button
                        key={w}
                        type="button"
                        className={'web-seg' + (w === width ? ' is-active' : '')}
                        onClick={() => setWidth(w)}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                  <div className="web-textsize" role="group" aria-label="Text size">
                    <button
                      type="button"
                      className="web-seg"
                      onClick={() => setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - 0.1) * 10) / 10))}
                      aria-label="Decrease text size"
                    >
                      A-
                    </button>
                    <span className="web-textsize-val">{Math.round(zoom * 100)}%</span>
                    <button
                      type="button"
                      className="web-seg"
                      onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + 0.1) * 10) / 10))}
                      aria-label="Increase text size"
                    >
                      A+
                    </button>
                  </div>
                </div>
                <div className="web-side-label">Documents</div>
                {docs.map((d, i) => (
                  <div
                    key={d.name}
                    className={'web-doc-item' + (i === active ? ' is-active' : '')}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActive(i)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setActive(i)
                    }}
                    title={d.name}
                  >
                    <span className="web-doc-name">{d.name.replace(MD_RE, '')}</span>
                    <button
                      type="button"
                      className="web-close"
                      onClick={(e) => closeDoc(d.name, e)}
                      aria-label="Close document"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {outline.length > 1 && (
                  <>
                    <div className="web-side-label">Outline</div>
                    {outline.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        className={
                          'web-outline web-outline-' +
                          h.level +
                          (h.id === activeHeadingId ? ' is-active' : '')
                        }
                        onClick={() => scrollToHeading(h.id)}
                        title={h.text}
                      >
                        {h.text}
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </nav>
        )}
        <main
          className={'web-main' + (editing ? ' is-editing' : '')}
          ref={mainRef}
          onScroll={onMainScroll}
        >
          {docs.length === 0 ? (
            <div className={'web-empty' + (dragOver ? ' is-drag' : '')}>
              <div className="web-empty-emoji">📖</div>
              <h1>Read Markdown in your browser</h1>
              <p>
                Open a <code>.md</code> file - math, Mermaid diagrams, charts, tables, and callouts
                all render. Nothing is uploaded; your files stay on your device.
              </p>
              <button
                type="button"
                className="web-btn web-primary"
                onClick={() => fileInput.current?.click()}
              >
                Open Markdown files
              </button>
              <p className="web-hint">or drag and drop files anywhere</p>
            </div>
          ) : editing ? (
            <div className="web-edit">
              <div className="web-edit-note">
                Edits are saved in your browser only, not the original file. Use Download HTML to
                export a copy.
              </div>
              <div className="web-edit-cols">
                <textarea
                  className="web-editor"
                  value={draft}
                  spellCheck={false}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label="Markdown source"
                />
                <article
                  className="web-doc markdown-body web-edit-preview"
                  ref={docRef}
                  style={{ zoom }}
                  onClick={onDocClick}
                >
                  <div dangerouslySetInnerHTML={{ __html: html }} />
                </article>
              </div>
            </div>
          ) : (
            <article
              className="web-doc markdown-body"
              ref={docRef}
              style={{ maxWidth: WIDTH_PX[width], zoom }}
              onClick={onDocClick}
            >
              {rendering ? (
                <p className="web-rendering">Rendering...</p>
              ) : (
                <div dangerouslySetInnerHTML={{ __html: html }} />
              )}
            </article>
          )}
        </main>
      </div>

      {docs.length > 0 && !editing && progress > 0.08 && (
        <button
          type="button"
          className="web-totop"
          onClick={() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
          title="Back to top"
        >
          ↑
        </button>
      )}

      {showHelp && (
        <div
          className="web-help-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          onClick={() => setShowHelp(false)}
        >
          <div className="web-help" onClick={(e) => e.stopPropagation()}>
            <h2>Keyboard shortcuts</h2>
            <dl>
              <dt>Ctrl / Cmd + K</dt>
              <dd>Focus search</dd>
              <dt>Esc</dt>
              <dd>Clear search or close</dd>
              <dt>Ctrl / Cmd + [</dt>
              <dd>Previous document</dd>
              <dt>Ctrl / Cmd + ]</dt>
              <dd>Next document</dd>
              <dt>?</dt>
              <dd>Toggle this help</dd>
            </dl>
            <button type="button" className="web-btn" onClick={() => setShowHelp(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {dragOver && docs.length > 0 && <div className="web-dropmask">Drop Markdown files to add</div>}
    </div>
  )
}
