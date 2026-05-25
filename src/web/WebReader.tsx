import { useCallback, useEffect, useRef, useState } from 'react'
import { renderBodyHtml } from '../renderer/src/lib/export'

interface Doc {
  name: string
  content: string
}

const THEMES = ['light', 'sepia', 'dark', 'nord'] as const
type Theme = (typeof THEMES)[number]

const MD_RE = /\.(md|markdown|mdown|mkd|mdx|txt)$/i

// Minimal File System Access typings (Chromium-only; feature-detected before use).
interface FsHandle {
  kind: 'file' | 'directory'
  name: string
  getFile?: () => Promise<File>
  values?: () => AsyncIterable<FsHandle>
}
type DirPicker = () => Promise<FsHandle>

export function WebReader(): React.JSX.Element {
  const [docs, setDocs] = useState<Doc[]>([])
  const [active, setActive] = useState(0)
  const [html, setHtml] = useState('')
  const [rendering, setRendering] = useState(false)
  const [theme, setTheme] = useState<Theme>('sepia')
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Render the active document (and re-render on theme change) using the desktop app's exact,
  // sanitized pipeline: math, Mermaid, charts, callouts, and GFM all come for free.
  useEffect(() => {
    let cancelled = false
    const doc = docs[active]
    if (!doc) {
      setHtml('')
      return
    }
    setRendering(true)
    renderBodyHtml(doc.content, theme)
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
  }, [docs, active, theme])

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
        <div className="web-actions">
          <button type="button" className="web-btn" onClick={() => fileInput.current?.click()}>
            Open files
          </button>
          {hasDirPicker && (
            <button type="button" className="web-btn" onClick={() => void openFolder()}>
              Open folder
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
          <nav className="web-sidebar" aria-label="Open documents">
            {docs.map((d, i) => (
              <button
                key={d.name}
                type="button"
                className={'web-doc-item' + (i === active ? ' is-active' : '')}
                onClick={() => setActive(i)}
                title={d.name}
              >
                {d.name.replace(MD_RE, '')}
              </button>
            ))}
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
            <article className="web-doc markdown-body">
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
