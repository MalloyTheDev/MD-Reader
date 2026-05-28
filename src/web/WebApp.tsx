import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
// Reuse the desktop renderer's Markdown pipeline so the web app and the Electron app
// render the exact same HTML for the same input.
import { renderBodyHtml } from '@renderer/lib/export'
import { Ico } from '@renderer/components/Icons'

interface Doc {
  name: string
  content: string
}
type Theme = 'light' | 'dark'
type SizeKey = 'sm' | 'md' | 'lg' | 'xl'

const MD_RE = /\.(md|markdown|mdown|mkd|mdx|txt)$/i
const DOCS_KEY = 'mdreader-web-v2-docs'
const THEME_KEY = 'mdreader-web-v2-theme'
const SIZE_KEY = 'mdreader-web-v2-size'

function loadDocs(): Doc[] {
  try {
    const raw = localStorage.getItem(DOCS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) {
      return arr.filter(
        (d): d is Doc =>
          d && typeof (d as Doc).name === 'string' && typeof (d as Doc).content === 'string'
      )
    }
  } catch {
    /* storage corrupted or too large; start fresh */
  }
  return []
}
function loadTheme(): Theme {
  const t = (typeof localStorage !== 'undefined' && localStorage.getItem(THEME_KEY)) || ''
  return t === 'dark' ? 'dark' : 'light'
}
function loadSize(): SizeKey {
  const s = (typeof localStorage !== 'undefined' && localStorage.getItem(SIZE_KEY)) || 'md'
  return (['sm', 'md', 'lg', 'xl'] as const).includes(s as SizeKey) ? (s as SizeKey) : 'md'
}

// Minimal File System Access API typings (Chromium-only; feature-detected before use).
interface FsHandle {
  kind: 'file' | 'directory'
  name: string
  getFile?: () => Promise<File>
  values?: () => AsyncIterable<FsHandle>
}
type DirPicker = () => Promise<FsHandle>

export function WebApp(): React.JSX.Element {
  const [docs, setDocs] = useState<Doc[]>(loadDocs)
  const [active, setActive] = useState<number | null>(null)
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [size, setSize] = useState<SizeKey>(loadSize)
  const [html, setHtml] = useState('')
  const [rendering, setRendering] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [aaOpen, setAaOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const pendingOpen = useRef<string | null>(null)

  const activeDoc = active !== null ? docs[active] : undefined

  // Theme + persistence.
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* ignore quota */
    }
  }, [theme])

  useEffect(() => {
    try {
      localStorage.setItem(SIZE_KEY, size)
    } catch {
      /* ignore quota */
    }
  }, [size])

  useEffect(() => {
    try {
      localStorage.setItem(DOCS_KEY, JSON.stringify(docs))
    } catch {
      /* too large for localStorage - session-only */
    }
  }, [docs])

  // After docs commit, focus the doc that was just dropped/picked (set via pendingOpen ref).
  useEffect(() => {
    const name = pendingOpen.current
    if (!name) return
    const idx = docs.findIndex((d) => d.name === name)
    pendingOpen.current = null
    if (idx >= 0) setActive(idx)
  }, [docs])

  // Render the active doc through the v2 desktop pipeline.
  useEffect(() => {
    let cancelled = false
    if (!activeDoc) {
      setHtml('')
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

  const addDocs = useCallback((incoming: Doc[]) => {
    if (incoming.length === 0) return
    pendingOpen.current = incoming[0].name
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
      if (md.length === 0) return
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
            const f = await entry.getFile()
            out.push({ name: prefix + entry.name, content: await f.text() })
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

  const closeDoc = useCallback(
    (name: string, e: React.MouseEvent) => {
      e.stopPropagation()
      const closedIdx = docs.findIndex((d) => d.name === name)
      setDocs((prev) => prev.filter((d) => d.name !== name))
      setActive((a) => {
        if (a === null || closedIdx < 0) return a
        if (a === closedIdx) {
          const newLen = docs.length - 1
          return newLen > 0 ? Math.min(a, newLen - 1) : null
        }
        if (a > closedIdx) return a - 1
        return a
      })
    },
    [docs]
  )

  const hasDirPicker =
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker ===
    'function'

  const activeTitle = activeDoc?.name.replace(MD_RE, '') || ''
  const wordCountOf = useMemo(
    () => (s: string) => s.replace(/[#*_`>\-[\]()]/g, ' ').split(/\s+/).filter(Boolean).length,
    []
  )

  return (
    <div
      className="app2"
      onDragOver={(e) => {
        e.preventDefault()
        if (!dragOver) setDragOver(true)
      }}
      onDragLeave={(e) => {
        // Only clear when leaving the window, not when crossing internal elements.
        if (e.target === e.currentTarget) setDragOver(false)
      }}
      onDrop={onDrop}
    >
      <header className="tb">
        <div className="tb-left">
          {active !== null ? (
            <>
              <button
                type="button"
                className="tb-back"
                onClick={() => setActive(null)}
                title="Back to library"
                aria-label="Back to library"
              >
                <Ico.arrLeft />
              </button>
              <span className="tb-doc-title">{activeTitle}</span>
            </>
          ) : (
            <a
              className="brand2"
              href="#"
              onClick={(e) => {
                e.preventDefault()
              }}
            >
              <div className="brand2-mark">M</div>
              <span className="brand2-name">MD Reader</span>
              <span className="web-tag">web</span>
            </a>
          )}
        </div>
        <div className="tb-mid">
          <div
            className="tb-search"
            onClick={() => fileInput.current?.click()}
            role="button"
            tabIndex={0}
          >
            <Ico.search />
            <span style={{ flex: 1 }}>Drop a Markdown file, or click to open…</span>
          </div>
        </div>
        <div className="tb-right">
          <button
            type="button"
            className="ibtn"
            onClick={() => fileInput.current?.click()}
            title="Open files"
            aria-label="Open files"
          >
            <Ico.folder />
          </button>
          {hasDirPicker && (
            <button
              type="button"
              className="ibtn"
              onClick={() => void openFolder()}
              title="Open folder"
              aria-label="Open folder"
            >
              <Ico.layers />
            </button>
          )}
          <span className="tb-divider" />
          <button
            type="button"
            className="ibtn"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title="Switch theme"
            aria-label="Switch theme"
          >
            {theme === 'dark' ? <Ico.sun /> : <Ico.moon />}
          </button>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className={'ibtn' + (aaOpen ? ' on' : '')}
              onClick={(e) => {
                e.stopPropagation()
                setAaOpen((o) => !o)
              }}
              title="Reading size"
              aria-label="Reading size"
            >
              <span
                style={{
                  fontFamily: 'var(--font-read)',
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: '-0.01em'
                }}
              >
                Aa
              </span>
            </button>
            {aaOpen && (
              <>
                <div
                  className="panel-backdrop"
                  onClick={() => setAaOpen(false)}
                  aria-hidden="true"
                />
                <div
                  className="folder-menu"
                  style={{ width: 240 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="folder-menu-h">Reading size</div>
                  <div
                    style={{
                      display: 'flex',
                      padding: '4px 10px 8px',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Size</span>
                    <div className="seg2">
                      {(['sm', 'md', 'lg', 'xl'] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={size === s ? 'on' : ''}
                          onClick={() => setSize(s)}
                          style={{
                            fontSize: s === 'sm' ? 10 : s === 'md' ? 12 : s === 'lg' ? 14 : 16
                          }}
                        >
                          Aa
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
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

      {(docs.length > 0 || active !== null) && (
        <div className="tabs2">
          <button
            type="button"
            className={'tab2' + (active === null ? ' on' : '')}
            onClick={() => setActive(null)}
            title="Library"
          >
            <Ico.shelf /> Library
          </button>
          {docs.map((d, i) => (
            <button
              key={d.name}
              type="button"
              className={'tab2' + (i === active ? ' on' : '')}
              onClick={() => setActive(i)}
              title={d.name}
            >
              <Ico.book /> {d.name.replace(MD_RE, '')}
              <span
                className="x"
                onClick={(e) => closeDoc(d.name, e)}
                aria-label="Close tab"
              >
                <Ico.close />
              </span>
            </button>
          ))}
        </div>
      )}

      <main className="main2">
        <div className="canvas2 web-only-canvas">
          {active === null ? (
            docs.length === 0 ? (
              <div className="web-empty">
                <div className="web-empty-emoji">📖</div>
                <h1>Read Markdown in your browser</h1>
                <p>
                  Open a <code>.md</code> file - math, Mermaid diagrams, charts, tables, and
                  callouts all render. Nothing is uploaded; your files stay on your device.
                </p>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => fileInput.current?.click()}
                >
                  <Ico.folder /> Open Markdown files
                </button>
                <p className="web-hint">or drag and drop files anywhere</p>
              </div>
            ) : (
              <div className="lib2 fade-in">
                <div className="sec-label">
                  <h2>
                    Open documents <span className="count">· {docs.length}</span>
                  </h2>
                </div>
                <div className="shelf2">
                  {docs.map((d, i) => (
                    <button
                      key={d.name}
                      type="button"
                      className="book2"
                      onClick={() => setActive(i)}
                    >
                      <div
                        className="cover2"
                        style={{
                          background: 'linear-gradient(135deg, oklch(0.42 0.10 50), oklch(0.32 0.09 45))'
                        }}
                      >
                        <div className="cover2-title">{d.name.replace(MD_RE, '')}</div>
                        <div className="cover2-meta">
                          {wordCountOf(d.content).toLocaleString()} words
                        </div>
                      </div>
                      <div>
                        <div className="b-title">{d.name.replace(MD_RE, '')}</div>
                        <div className="b-sub">
                          <span>{(d.content.length / 1024).toFixed(1)} KB</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          ) : (
            <article
              className={`page2 markdown-body size-${size}`}
              style={{ maxWidth: '66ch', margin: '0 auto', padding: '0 32px' }}
            >
              {rendering ? (
                <p style={{ color: 'var(--muted)' }}>Rendering…</p>
              ) : (
                <div dangerouslySetInnerHTML={{ __html: html }} />
              )}
            </article>
          )}
        </div>
      </main>

      {dragOver && <div className="web-dropmask">Drop Markdown files to add</div>}
    </div>
  )
}
