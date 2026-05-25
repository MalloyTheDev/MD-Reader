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

export function WebReader(): React.JSX.Element {
  const [docs, setDocs] = useState<Doc[]>(loadDocs)
  const [active, setActive] = useState(0)
  const [html, setHtml] = useState('')
  const [rendering, setRendering] = useState(false)
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [query, setQuery] = useState('')
  const [outline, setOutline] = useState<Heading[]>([])
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const docRef = useRef<HTMLDivElement>(null)

  const activeDoc = docs[active]

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

  // Render the active document with the desktop app's exact, sanitized pipeline.
  useEffect(() => {
    let cancelled = false
    if (!activeDoc) {
      setHtml('')
      setOutline([])
      return
    }
    setRendering(true)
    renderBodyHtml(activeDoc.content, theme)
      .then((out) => {
        if (!cancelled) {
          setHtml(out)
          setRendering(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHtml('<p>Could not render this document.</p>')
          setRendering(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [activeDoc, theme])

  // After render, build the outline from the rendered headings (assigning ids where missing).
  useEffect(() => {
    const root = docRef.current
    if (!root || !html) {
      setOutline([])
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
  }, [html])

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
        docRef.current?.parentElement?.scrollTo({ top: 0 })
      }
    },
    [docs]
  )

  const scrollToHeading = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

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
                        className={'web-outline web-outline-' + h.level}
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
        <main className="web-main">
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
          ) : (
            <article className="web-doc markdown-body" ref={docRef}>
              {rendering ? (
                <p className="web-rendering">Rendering...</p>
              ) : (
                <div dangerouslySetInnerHTML={{ __html: html }} />
              )}
            </article>
          )}
        </main>
      </div>

      {dragOver && docs.length > 0 && <div className="web-dropmask">Drop Markdown files to add</div>}
    </div>
  )
}
