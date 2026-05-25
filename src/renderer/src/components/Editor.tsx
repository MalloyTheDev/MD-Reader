import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { AppSettings, WriteMode } from '@shared/types'
import { makeComponents, rehypePlugins, remarkPlugins, urlTransform } from '../lib/markdown'
import { readingLabel } from '../lib/text'
import { runAiOnce, parseJsonLoose, type AiOnceHandle } from '../lib/aiClient'
import { csvToMarkdownTable, markdownTableToCsv, extractTableBlock } from '../lib/table'

interface EditorProps {
  raw: string
  baseDir: string
  fileKey: string
  settings: AppSettings
  wikiTargets: string[]
  onSave: (content: string) => void
  onNotice?: (msg: string) => void
}

interface WikiState {
  start: number
  matches: string[]
  sel: number
}

interface SlashState {
  start: number
  matches: { label: string; snippet: string }[]
  sel: number
}

const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\s*\n?/

const INSERTS: { label: string; snippet: string }[] = [
  {
    label: 'Diagram',
    snippet: '\n\n```mermaid\nflowchart LR\n  A[Start] --> B[Step] --> C[Done]\n```\n\n'
  },
  { label: 'Table', snippet: '\n\n| Column A | Column B |\n| --- | --- |\n| a | b |\n\n' },
  { label: 'Code', snippet: '\n\n```js\n// your code here\n```\n\n' },
  { label: 'Callout', snippet: '\n\n> [!note] Title\n> Body text\n\n' },
  { label: 'Heading', snippet: '\n\n## Heading\n\n' }
]

// Commands offered by the inline "/" menu (Notion-style).
const SLASH_COMMANDS: { label: string; snippet: string }[] = [
  { label: 'Heading', snippet: '## ' },
  { label: 'Table', snippet: '| Column A | Column B |\n| --- | --- |\n| a | b |\n' },
  { label: 'Code block', snippet: '```js\n// your code here\n```\n' },
  {
    label: 'Diagram (Mermaid)',
    snippet: '```mermaid\nflowchart LR\n  A[Start] --> B[Done]\n```\n'
  },
  { label: 'Callout', snippet: '> [!note] Title\n> Body text\n' },
  { label: 'Math block', snippet: '$$\n\\int_0^1 x^2\\,dx\n$$\n' },
  { label: 'Quote', snippet: '> ' },
  { label: 'Checklist', snippet: '- [ ] Task\n' },
  { label: 'Bullet list', snippet: '- Item\n' },
  { label: 'Divider', snippet: '\n---\n' },
  { label: 'Link to note', snippet: '[[]]' }
]

const WRITE_MODES: { mode: WriteMode; label: string; needsSel: boolean }[] = [
  { mode: 'rewrite', label: 'Rewrite selection', needsSel: true },
  { mode: 'expand', label: 'Expand selection', needsSel: true },
  { mode: 'grammar', label: 'Fix spelling & grammar', needsSel: true },
  { mode: 'continue', label: 'Continue writing', needsSel: false }
]

interface OrganizeResult {
  title?: string
  tags?: string[]
  links?: string[]
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extFor(type: string): string {
  if (type === 'image/jpeg') return '.jpg'
  if (type === 'image/png') return '.png'
  if (type === 'image/gif') return '.gif'
  if (type === 'image/webp') return '.webp'
  if (type === 'image/svg+xml') return '.svg'
  if (type === 'image/avif') return '.avif'
  if (type === 'image/bmp') return '.bmp'
  return '.png'
}

function OrganizeBody({
  organize,
  onApplyTitle,
  onApplyTags,
  onApplyLink
}: {
  organize: OrganizeResult
  onApplyTitle: (t: string) => void
  onApplyTags: (t: string[]) => void
  onApplyLink: (t: string) => void
}): React.JSX.Element {
  const title = organize.title
  const tags = organize.tags ?? []
  const links = organize.links ?? []
  const empty = !title && tags.length === 0 && links.length === 0
  return (
    <div className="organize-body">
      {title && (
        <div className="organize-row">
          <span className="organize-label">Title</span>
          <span className="organize-val">{title}</span>
          <button type="button" className="btn btn-small" onClick={() => onApplyTitle(title)}>
            Apply
          </button>
        </div>
      )}
      {tags.length > 0 && (
        <div className="organize-row">
          <span className="organize-label">Tags</span>
          <span className="organize-val">{tags.map((t) => `#${t}`).join(' ')}</span>
          <button type="button" className="btn btn-small" onClick={() => onApplyTags(tags)}>
            Add
          </button>
        </div>
      )}
      {links.length > 0 && (
        <div className="organize-row">
          <span className="organize-label">Related</span>
          <span className="organize-val organize-links">
            {links.map((l) => (
              <button
                key={l}
                type="button"
                className="organize-chip"
                onClick={() => onApplyLink(l)}
                title="Insert link"
              >
                [[{l}]] +
              </button>
            ))}
          </span>
        </div>
      )}
      {empty && <p className="sv-hint">No suggestions for this note.</p>}
    </div>
  )
}

export function Editor({
  raw,
  baseDir,
  fileKey,
  settings,
  wikiTargets,
  onSave,
  onNotice
}: EditorProps): React.JSX.Element {
  const [text, setText] = useState(raw)
  const [wiki, setWiki] = useState<WikiState | null>(null)
  const [slash, setSlash] = useState<SlashState | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiMenuOpen, setAiMenuOpen] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiUndo, setAiUndo] = useState<string | null>(null)
  const [organize, setOrganize] = useState<OrganizeResult | null>(null)
  const [organizeBusy, setOrganizeBusy] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const findRef = useRef<HTMLInputElement>(null)
  const aiHandleRef = useRef<AiOnceHandle | null>(null)

  const insertAtCaret = (snippet: string): void => {
    const ta = taRef.current
    const s = ta?.selectionStart ?? text.length
    const e = ta?.selectionEnd ?? s
    setText((prev) => prev.slice(0, s) + snippet + prev.slice(e))
    const pos = s + snippet.length
    requestAnimationFrame(() => {
      ta?.focus()
      ta?.setSelectionRange(pos, pos)
    })
  }

  const wrapSelection = (before: string, after: string): void => {
    const ta = taRef.current
    if (!ta) return
    const s = ta.selectionStart ?? 0
    const e = ta.selectionEnd ?? s
    const sel = text.slice(s, e)
    setText((prev) => prev.slice(0, s) + before + sel + after + prev.slice(e))
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(s + before.length, s + before.length + sel.length)
    })
  }

  // Read CSV/TSV from the clipboard and insert it as a Markdown table at the caret.
  const importCsvTable = async (): Promise<void> => {
    // Capture the caret before awaiting the clipboard, so a focus/selection change during the
    // async read can't redirect where the table is inserted.
    const ta = taRef.current
    const s = ta?.selectionStart ?? text.length
    const e = ta?.selectionEnd ?? s
    let clip = ''
    try {
      clip = await navigator.clipboard.readText()
    } catch {
      onNotice?.('Couldn’t read the clipboard. Copy some CSV first, then try again.')
      return
    }
    const md = csvToMarkdownTable(clip)
    if (!md) {
      onNotice?.('Clipboard has no CSV/TSV data to convert into a table.')
      return
    }
    const snippet = '\n\n' + md + '\n\n'
    setText((prev) => prev.slice(0, s) + snippet + prev.slice(e))
    const pos = s + snippet.length
    requestAnimationFrame(() => {
      ta?.focus()
      ta?.setSelectionRange(pos, pos)
    })
  }

  // Convert the selected table (or the table block around the caret) to CSV and copy it.
  const exportTableCsv = async (): Promise<void> => {
    const ta = taRef.current
    const s = ta?.selectionStart ?? 0
    const e = ta?.selectionEnd ?? s
    const block = s !== e ? text.slice(s, e) : extractTableBlock(text, s)
    const csv = block ? markdownTableToCsv(block) : ''
    if (!csv) {
      onNotice?.('Place the cursor in a Markdown table (or select one) to copy it as CSV.')
      return
    }
    try {
      await navigator.clipboard.writeText(csv)
      onNotice?.('Copied the table as CSV to the clipboard.')
    } catch {
      onNotice?.('Couldn’t write to the clipboard.')
    }
  }

  const wrapLink = (): void => {
    const ta = taRef.current
    if (!ta) return
    const s = ta.selectionStart ?? 0
    const e = ta.selectionEnd ?? s
    const sel = text.slice(s, e) || 'text'
    setText((prev) => prev.slice(0, s) + `[${sel}](url)` + prev.slice(e))
    const urlStart = s + sel.length + 3
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(urlStart, urlStart + 3)
    })
  }

  useEffect(() => {
    setText(raw)
    setWiki(null)
    setSlash(null)
    setAiMenuOpen(false)
    setAiError(null)
    setAiUndo(null)
    setOrganize(null)
  }, [fileKey, raw])

  useEffect(() => () => aiHandleRef.current?.cancel(), [])

  // --- AI writing assistant: operate on the current selection (or cursor for "continue"). ---
  const runWrite = (mode: WriteMode): void => {
    const ta = taRef.current
    if (!ta || aiBusy || organizeBusy) return
    const s = ta.selectionStart ?? 0
    const e = ta.selectionEnd ?? s
    const sel = text.slice(s, e)
    if (mode !== 'continue' && !sel.trim()) {
      setAiMenuOpen(false)
      setAiError('Select some text first, then choose a writing action.')
      return
    }
    setAiMenuOpen(false)
    setAiError(null)
    const original = text
    setAiUndo(original)
    setAiBusy(true)
    const anchorStart = mode === 'continue' ? e : s
    const before = original.slice(0, anchorStart)
    const after = original.slice(e)
    const lead = mode === 'continue' && before.length > 0 && !/\s$/.test(before) ? ' ' : ''
    const contextSel = mode === 'continue' ? original.slice(Math.max(0, e - 1500), e) : sel
    const handle = runAiOnce(
      {
        action: 'write',
        writeMode: mode,
        selection: contextSel,
        provider: settings.aiProvider,
        model: settings.aiModel,
        baseUrl: settings.aiBaseUrl,
        doc: original.slice(0, 8000)
      },
      (full) => setText(before + lead + full + after)
    )
    aiHandleRef.current = handle
    handle.promise
      .then((r) => {
        const next = before + lead + r.text + after
        setText(next)
        setAiBusy(false)
        requestAnimationFrame(() => {
          ta.focus()
          const end = (before + lead + r.text).length
          ta.setSelectionRange(mode === 'continue' ? end : anchorStart, end)
        })
      })
      .catch((err: Error) => {
        // User pressed Stop - keep whatever streamed so far (and the Undo affordance).
        if (err.name === 'AbortError') return
        setText(original)
        setAiUndo(null)
        setAiBusy(false)
        setAiError(err.message)
      })
  }

  const undoAi = (): void => {
    if (aiUndo === null) return
    setText(aiUndo)
    setAiUndo(null)
  }

  const stopAi = (): void => {
    aiHandleRef.current?.cancel()
    setAiBusy(false)
    setOrganizeBusy(false)
    setAiError(null)
  }

  // --- AI auto-organize: suggest a title, tags, and cross-links. ---
  const runOrganize = (): void => {
    if (organizeBusy || aiBusy) return
    setAiMenuOpen(false)
    setOrganize(null)
    setAiError(null)
    setOrganizeBusy(true)
    const handle = runAiOnce({
      action: 'organize',
      provider: settings.aiProvider,
      model: settings.aiModel,
      baseUrl: settings.aiBaseUrl,
      doc: text,
      titles: wikiTargets
    })
    aiHandleRef.current = handle
    handle.promise
      .then((r) => {
        setOrganizeBusy(false)
        const parsed = parseJsonLoose<OrganizeResult>(r.text)
        if (!parsed) {
          setAiError('Could not read the organization suggestions.')
          return
        }
        setOrganize({
          title: typeof parsed.title === 'string' ? parsed.title.trim() : undefined,
          tags: Array.isArray(parsed.tags)
            ? parsed.tags
                .filter((t): t is string => typeof t === 'string')
                .map((t) => t.replace(/^#/, '').trim())
                .filter(Boolean)
                .slice(0, 8)
            : [],
          links: Array.isArray(parsed.links)
            ? parsed.links
                .filter((l): l is string => typeof l === 'string' && wikiTargets.includes(l))
                .slice(0, 8)
            : []
        })
      })
      .catch((err: Error) => {
        setOrganizeBusy(false)
        if (err.name === 'AbortError') return
        setAiError(err.message)
      })
  }

  const applyTitle = (title: string): void => {
    setText((prev) => {
      const fm = prev.match(FRONTMATTER_RE)?.[0] ?? ''
      const body = prev.slice(fm.length)
      if (/^#\s+.*$/m.test(body.split('\n')[0] ?? '')) {
        const lines = body.split('\n')
        lines[0] = `# ${title}`
        return fm + lines.join('\n')
      }
      return `${fm}# ${title}\n\n${body}`
    })
  }

  const applyTags = (tags: string[]): void => {
    const line = tags.map((t) => `#${t}`).join(' ')
    setText((prev) => {
      const fm = prev.match(FRONTMATTER_RE)?.[0] ?? ''
      const body = prev.slice(fm.length)
      const h1 = body.match(/^#\s+.*(?:\n|$)/)
      if (h1) {
        const rest = body.slice(h1[0].length).replace(/^\n+/, '')
        return fm + h1[0].replace(/\n*$/, '') + '\n\n' + line + '\n\n' + rest
      }
      return fm + line + '\n\n' + body.replace(/^\n+/, '')
    })
  }

  const applyLink = (title: string): void => {
    setText((prev) => {
      if (new RegExp(`\\[\\[${escapeRegExp(title)}\\]\\]`).test(prev)) return prev
      if (/(^|\n)##\s+Related\b/.test(prev)) {
        return prev.replace(/((?:^|\n)##\s+Related[^\n]*\n)/, `$1- [[${title}]]\n`)
      }
      return prev.replace(/\s*$/, '') + `\n\n## Related\n- [[${title}]]\n`
    })
  }

  const dirty = text !== raw

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        onSave(text)
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'h' || e.key === 'H' || e.key === 'f' || e.key === 'F')
      ) {
        e.preventDefault()
        setFindOpen(true)
        requestAnimationFrame(() => findRef.current?.focus())
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        if (document.activeElement === taRef.current) {
          e.preventDefault()
          wrapSelection('**', '**')
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) {
        if (document.activeElement === taRef.current) {
          e.preventDefault()
          wrapSelection('*', '*')
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        if (document.activeElement === taRef.current) {
          e.preventDefault()
          wrapLink()
        }
      } else if (e.key === 'Escape' && findOpen) {
        setFindOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, onSave, findOpen])

  // Autosave (debounced) when enabled.
  useEffect(() => {
    if (!settings.autosave || text === raw) return
    const t = setTimeout(() => onSave(text), 1500)
    return () => clearTimeout(t)
  }, [text, raw, settings.autosave, onSave])

  const updateAutocomplete = (val: string, caret: number): void => {
    const before = val.slice(0, caret)
    const wikiIdx = before.lastIndexOf('[[')
    if (wikiIdx >= 0) {
      const between = before.slice(wikiIdx + 2)
      if (!between.includes(']]') && !between.includes('\n') && between.length <= 40) {
        const q = between.toLowerCase()
        const matches = wikiTargets.filter((t) => t.toLowerCase().includes(q)).slice(0, 8)
        setWiki({ start: wikiIdx, matches, sel: 0 })
        setSlash(null)
        return
      }
    }
    const slashIdx = before.lastIndexOf('/')
    if (slashIdx >= 0) {
      const prev = slashIdx === 0 ? '' : before[slashIdx - 1]
      const between = before.slice(slashIdx + 1)
      if (
        (slashIdx === 0 || /\s/.test(prev)) &&
        /^[a-zA-Z]*$/.test(between) &&
        between.length <= 20
      ) {
        const q = between.toLowerCase()
        const matches = SLASH_COMMANDS.filter((c) => c.label.toLowerCase().includes(q)).slice(0, 8)
        if (matches.length) {
          setSlash({ start: slashIdx, matches, sel: 0 })
          setWiki(null)
          return
        }
      }
    }
    setWiki(null)
    setSlash(null)
  }

  const insertWiki = (name: string): void => {
    const ta = taRef.current
    if (!ta || !wiki) return
    const caret = ta.selectionStart ?? text.length
    setText((prev) => prev.slice(0, wiki.start) + `[[${name}]]` + prev.slice(caret))
    setWiki(null)
    const pos = wiki.start + name.length + 4
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(pos, pos)
    })
  }

  const chooseSlash = (cmd: { label: string; snippet: string }): void => {
    const ta = taRef.current
    if (!ta || !slash) return
    const caret = ta.selectionStart ?? text.length
    setText((prev) => prev.slice(0, slash.start) + cmd.snippet + prev.slice(caret))
    setSlash(null)
    const pos = slash.start + cmd.snippet.length
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(pos, pos)
    })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (slash && slash.matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlash((s) => (s ? { ...s, sel: Math.min(s.matches.length - 1, s.sel + 1) } : s))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlash((s) => (s ? { ...s, sel: Math.max(0, s.sel - 1) } : s))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        chooseSlash(slash.matches[slash.sel])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setSlash(null)
      }
      return
    }
    if (!wiki || wiki.matches.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setWiki((w) => (w ? { ...w, sel: Math.min(w.matches.length - 1, w.sel + 1) } : w))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setWiki((w) => (w ? { ...w, sel: Math.max(0, w.sel - 1) } : w))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insertWiki(wiki.matches[wiki.sel])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setWiki(null)
    }
  }

  const saveImages = async (files: File[]): Promise<void> => {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return
    const md: string[] = []
    for (const file of images) {
      try {
        const buf = new Uint8Array(await file.arrayBuffer())
        const fallback = `pasted-${Date.now()}${extFor(file.type)}`
        const name = file.name && file.name !== 'image.png' ? file.name : fallback
        const href = await window.api.saveImage({ baseDir, name, data: buf })
        const alt = (file.name || 'image').replace(/\.[^.]+$/, '')
        md.push(`![${alt}](${href})`)
      } catch (err) {
        console.error('Could not save dropped image:', err)
      }
    }
    if (md.length) insertAtCaret(md.join('\n\n'))
  }

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    const files: File[] = []
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile()
        if (f) files.push(f)
      }
    }
    if (files.length) {
      e.preventDefault()
      void saveImages(files)
    }
  }

  const onDrop = (e: React.DragEvent<HTMLTextAreaElement>): void => {
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    if (files.length) {
      e.preventDefault()
      setDragOver(false)
      void saveImages(files)
    }
  }

  const matchCount = useMemo(() => {
    if (!findText) return 0
    return text.toLowerCase().split(findText.toLowerCase()).length - 1
  }, [text, findText])

  const findNext = (backwards = false): void => {
    const ta = taRef.current
    if (!ta || !findText) return
    const hay = text.toLowerCase()
    const needle = findText.toLowerCase()
    let idx: number
    if (!backwards) {
      idx = hay.indexOf(needle, ta.selectionEnd ?? 0)
      if (idx < 0) idx = hay.indexOf(needle, 0)
    } else {
      idx = hay.lastIndexOf(needle, (ta.selectionStart ?? 0) - 1)
      if (idx < 0) idx = hay.lastIndexOf(needle)
    }
    if (idx < 0) return
    ta.focus()
    ta.setSelectionRange(idx, idx + findText.length)
  }

  const replaceOne = (): void => {
    const ta = taRef.current
    if (!ta || !findText) return
    const s = ta.selectionStart ?? 0
    const e = ta.selectionEnd ?? 0
    let base = text
    let caret = e
    if (e > s && text.slice(s, e).toLowerCase() === findText.toLowerCase()) {
      base = text.slice(0, s) + replaceText + text.slice(e)
      caret = s + replaceText.length
      setText(base)
    }
    const needle = findText.toLowerCase()
    let at = base.toLowerCase().indexOf(needle, caret)
    if (at < 0) at = base.toLowerCase().indexOf(needle)
    if (at >= 0) {
      requestAnimationFrame(() => {
        ta.focus()
        ta.setSelectionRange(at, at + findText.length)
      })
    }
  }

  const replaceAll = (): void => {
    if (!findText) return
    const re = new RegExp(escapeRegExp(findText), 'gi')
    // Function replacer so `$`, `$1`, `$&` in the replacement are inserted literally.
    setText((prev) => prev.replace(re, () => replaceText))
  }

  const preview = useMemo(() => text.replace(FRONTMATTER_RE, ''), [text])
  const stats = useMemo(() => readingLabel(preview), [preview])
  const components = useMemo(
    () =>
      makeComponents(
        baseDir,
        () => {},
        () => {},
        settings.allowRemoteImages,
        settings.theme
      ),
    [baseDir, settings.allowRemoteImages, settings.theme]
  )
  // Memoize so editor-only state (find bar, slash menu, drag) doesn't re-parse the preview.
  const renderedPreview = useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
        urlTransform={urlTransform}
      >
        {preview}
      </ReactMarkdown>
    ),
    [preview, components]
  )

  return (
    <div className="editor-layout">
      <div className="editor-pane">
        <div className="editor-bar">
          <span className={'editor-status' + (dirty ? ' is-dirty' : '')}>
            {dirty ? '● Unsaved changes' : '✓ Saved'}
          </span>
          <span className="editor-hint">[[ links · / commands · ⌘B/I/K · Ctrl+H find</span>
          {aiBusy && (
            <span className="editor-ai-status">
              ✦ Writing…{' '}
              <button type="button" className="link-btn" onClick={stopAi}>
                Stop
              </button>
            </span>
          )}
          {!aiBusy && aiUndo !== null && (
            <button
              type="button"
              className="btn btn-small"
              onClick={undoAi}
              title="Revert the last AI edit"
            >
              ↺ Undo AI
            </button>
          )}
          {aiError && <span className="editor-ai-error">{aiError}</span>}
          <span className="editor-count">{stats}</span>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => onSave(text)}
            disabled={!dirty}
          >
            Save
          </button>
        </div>
        {findOpen && (
          <div className="editor-find">
            <input
              ref={findRef}
              className="find-input"
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  findNext(e.shiftKey)
                } else if (e.key === 'Escape') {
                  setFindOpen(false)
                }
              }}
              placeholder="Find"
              spellCheck={false}
            />
            <input
              className="find-input"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replace with"
              spellCheck={false}
            />
            <span className="find-count">
              {matchCount} match{matchCount === 1 ? '' : 'es'}
            </span>
            <button type="button" className="btn btn-small" onClick={() => findNext(false)}>
              Next
            </button>
            <button type="button" className="btn btn-small" onClick={() => findNext(true)}>
              Prev
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={replaceOne}
              disabled={!matchCount}
            >
              Replace
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={replaceAll}
              disabled={!matchCount}
            >
              All
            </button>
            <button
              type="button"
              className="btn-icon"
              onClick={() => setFindOpen(false)}
              aria-label="Close find"
            >
              ×
            </button>
          </div>
        )}
        <div className="editor-insert">
          <span className="insert-label">Insert</span>
          {INSERTS.map((it) => (
            <button
              key={it.label}
              type="button"
              className="insert-btn"
              onClick={() => insertAtCaret(it.snippet)}
            >
              {it.label}
            </button>
          ))}
          <button
            type="button"
            className="insert-btn"
            title="Paste clipboard CSV/TSV as a Markdown table"
            onClick={() => void importCsvTable()}
          >
            CSV→Table
          </button>
          <button
            type="button"
            className="insert-btn"
            title="Copy the current Markdown table as CSV"
            onClick={() => void exportTableCsv()}
          >
            Table→CSV
          </button>
          <span className="insert-sep" />
          <div className="editor-ai-wrap">
            <button
              type="button"
              className={'insert-btn insert-ai' + (aiMenuOpen ? ' is-active' : '')}
              onClick={() => setAiMenuOpen((o) => !o)}
              disabled={aiBusy || organizeBusy}
            >
              ✦ AI
            </button>
            {aiMenuOpen && (
              <>
                <div
                  className="menu-backdrop"
                  onClick={() => setAiMenuOpen(false)}
                  aria-hidden="true"
                />
                <ul className="editor-ai-menu">
                  {WRITE_MODES.map((w) => (
                    <li key={w.mode}>
                      <button
                        type="button"
                        className="editor-ai-item"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          runWrite(w.mode)
                        }}
                      >
                        {w.label}
                      </button>
                    </li>
                  ))}
                  <li className="editor-ai-divider" aria-hidden="true" />
                  <li>
                    <button
                      type="button"
                      className="editor-ai-item"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        runOrganize()
                      }}
                    >
                      Organize note (title · tags · links)
                    </button>
                  </li>
                </ul>
              </>
            )}
          </div>
        </div>
        {(organize || organizeBusy) && (
          <div className="organize-panel">
            <div className="organize-head">
              <span>✦ Organize suggestions</span>
              <button
                type="button"
                className="btn-icon"
                onClick={() => {
                  setOrganize(null)
                  stopAi()
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {organizeBusy ? (
              <p className="sv-hint">Analyzing the note…</p>
            ) : organize ? (
              <OrganizeBody
                organize={organize}
                onApplyTitle={applyTitle}
                onApplyTags={applyTags}
                onApplyLink={applyLink}
              />
            ) : null}
          </div>
        )}
        <textarea
          ref={taRef}
          className={'editor-textarea' + (dragOver ? ' is-dragover' : '')}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            updateAutocomplete(e.target.value, e.target.selectionStart ?? e.target.value.length)
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onDrop={onDrop}
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer.types).includes('Files')) {
              e.preventDefault()
              setDragOver(true)
            }
          }}
          onDragLeave={() => setDragOver(false)}
          spellCheck={false}
          readOnly={aiBusy}
          placeholder="# Write some Markdown…  (type / for commands)"
        />
        {wiki && wiki.matches.length > 0 && (
          <ul className="wiki-pop">
            {wiki.matches.map((m, i) => (
              <li key={m}>
                <button
                  type="button"
                  className={'wiki-pop-item' + (i === wiki.sel ? ' is-sel' : '')}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    insertWiki(m)
                  }}
                >
                  {m}
                </button>
              </li>
            ))}
          </ul>
        )}
        {slash && slash.matches.length > 0 && (
          <ul className="wiki-pop slash-pop">
            {slash.matches.map((m, i) => (
              <li key={m.label}>
                <button
                  type="button"
                  className={'wiki-pop-item' + (i === slash.sel ? ' is-sel' : '')}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    chooseSlash(m)
                  }}
                >
                  {m.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="editor-preview markdown-body">{renderedPreview}</div>
    </div>
  )
}
