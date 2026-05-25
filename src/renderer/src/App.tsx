import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AiAction,
  AiTurn,
  Annotation,
  AppSettings,
  Bookmark,
  FileSidecar,
  MarkdownFileContent,
  MarkdownFileMeta,
  PersistedState,
  ReadingPosition,
  ThemeName
} from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'
import { purgeState } from './lib/library-clean'
import { Library } from './components/Library'
import { Reader } from './components/Reader'
import { Editor } from './components/Editor'
import { CommandPalette } from './components/CommandPalette'
import { ShortcutsOverlay } from './components/ShortcutsOverlay'
import { GraphView } from './components/GraphView'
import { AiPanel } from './components/AiPanel'
import { FlashcardReview } from './components/FlashcardReview'
import { SlidesView } from './components/SlidesView'
import { TasksView } from './components/TasksView'
import { SettingsView } from './components/SettingsView'
import { HighlightsView } from './components/HighlightsView'
import { CreatePanel } from './components/CreatePanel'
import { CoursePanel } from './components/CoursePanel'
import { ReadmePanel } from './components/ReadmePanel'
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal'
import { TemplatePicker } from './components/TemplatePicker'
import type { DocTemplate } from './lib/templates'
import { DocInfoPanel } from './components/DocInfoPanel'
import { computeDocStats, findBrokenWikiLinks } from './lib/docinfo'
import { newCard, scheduleCard } from './lib/annotations'
import { annotationsToMarkdown, deckToCsv, renderBodyHtml, renderDocHtml } from './lib/export'
import { buildIndex, runLibrarySearch, type LibSearchResult } from './lib/search'
import { buildGraph, type GraphData } from './lib/graph'
import { scanTasks, toggleInRaw, type TaskItem } from './lib/tasks'
import type MiniSearch from 'minisearch'
import type { LibDoc } from './lib/search'

const NAME_EXT = /\.(md|markdown|mdown|mkd|mdx)$/i
const titleOf = (name: string): string => name.replace(NAME_EXT, '').replace(/[-_]+/g, ' ')
const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2)

export type SortMode = 'name' | 'modified' | 'recent'

const THEMES: { key: ThemeName; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'sepia', label: 'Sepia' },
  { key: 'dark', label: 'Dark' }
]

const ACCENT_PRESETS = [
  '#1f6feb',
  '#0891b2',
  '#2e7d32',
  '#b58900',
  '#c2410c',
  '#d92662',
  '#7c3aed',
  '#475569'
]

function SettingsPanel({
  settings,
  onChange,
  onClose,
  onOpenAll
}: {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
  onClose: () => void
  onOpenAll: () => void
}): React.JSX.Element {
  // Live accent preview without lag: paint the CSS var on every drag tick, but only commit
  // to React state + IPC on a trailing debounce so we don't re-render/persist per tick.
  const accentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onAccentInput = (v: string): void => {
    document.documentElement.style.setProperty('--accent', v)
    if (accentTimer.current) clearTimeout(accentTimer.current)
    accentTimer.current = setTimeout(() => onChange({ accent: v }), 200)
  }
  useEffect(
    () => () => {
      if (accentTimer.current) clearTimeout(accentTimer.current)
    },
    []
  )
  return (
    <>
      <div className="panel-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="settings-panel" role="dialog" aria-label="Reading settings">
        <div className="settings-row">
          <span className="settings-label">Theme</span>
          <div className="seg">
            {THEMES.map((t) => (
              <button
                key={t.key}
                type="button"
                className={'seg-btn' + (settings.theme === t.key ? ' is-active' : '')}
                onClick={() => onChange({ theme: t.key })}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">Font size</span>
          <div className="stepper">
            <button
              type="button"
              onClick={() => onChange({ fontSizePx: Math.max(14, settings.fontSizePx - 1) })}
              aria-label="Decrease font size"
            >
              −
            </button>
            <span className="stepper-value">{settings.fontSizePx}px</span>
            <button
              type="button"
              onClick={() => onChange({ fontSizePx: Math.min(30, settings.fontSizePx + 1) })}
              aria-label="Increase font size"
            >
              +
            </button>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">Width</span>
          <input
            type="range"
            min={50}
            max={100}
            value={settings.readingWidthCh}
            onChange={(e) => onChange({ readingWidthCh: Number(e.target.value) })}
          />
        </div>
        <div className="settings-row">
          <span className="settings-label">Line height</span>
          <input
            type="range"
            min={12}
            max={24}
            value={Math.round(settings.lineHeight * 10)}
            onChange={(e) => onChange({ lineHeight: Number(e.target.value) / 10 })}
          />
        </div>
        <div className="settings-row">
          <span className="settings-label">Two-page (wide)</span>
          <button
            type="button"
            className={'toggle' + (settings.twoPage ? ' is-on' : '')}
            onClick={() => onChange({ twoPage: !settings.twoPage })}
            role="switch"
            aria-checked={settings.twoPage}
          >
            <span className="toggle-knob" />
          </button>
        </div>
        <div className="settings-row">
          <span className="settings-label">Remote images</span>
          <button
            type="button"
            className={'toggle' + (settings.allowRemoteImages ? ' is-on' : '')}
            onClick={() => onChange({ allowRemoteImages: !settings.allowRemoteImages })}
            role="switch"
            aria-checked={settings.allowRemoteImages}
            title="Load images from the web (off by default to avoid tracking)"
          >
            <span className="toggle-knob" />
          </button>
        </div>
        <div className="settings-row">
          <span className="settings-label">Font</span>
          <div className="seg">
            {(
              [
                ['serif', 'Serif'],
                ['sans', 'Sans'],
                ['dyslexic', 'Easy']
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                className={'seg-btn' + (settings.fontFamily === k ? ' is-active' : '')}
                onClick={() => onChange({ fontFamily: k })}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">Page turn</span>
          <div className="seg">
            {(
              [
                ['off', 'Off'],
                ['fast', 'Fast'],
                ['smooth', 'Smooth']
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                className={'seg-btn' + (settings.pageAnimation === k ? ' is-active' : '')}
                onClick={() => onChange({ pageAnimation: k })}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">Accent color</span>
          <button
            type="button"
            className={'toggle' + (settings.accentEnabled ? ' is-on' : '')}
            onClick={() => onChange({ accentEnabled: !settings.accentEnabled })}
            role="switch"
            aria-checked={settings.accentEnabled}
            title="Turn the colored accent on or off (off uses a neutral gray)"
          >
            <span className="toggle-knob" />
          </button>
        </div>
        {settings.accentEnabled && (
          <div className="settings-row accent-row">
            <div className="accent-presets">
              {ACCENT_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={'accent-swatch' + (settings.accent === c ? ' is-active' : '')}
                  style={{ background: c }}
                  onClick={() => onChange({ accent: c })}
                  aria-label={'Accent ' + c}
                />
              ))}
            </div>
            <div className="accent-pick">
              <input
                type="color"
                value={settings.accent || '#1f6feb'}
                onChange={(e) => onAccentInput(e.target.value)}
              />
              <button type="button" className="link-btn" onClick={() => onChange({ accent: '' })}>
                theme
              </button>
            </div>
          </div>
        )}
        <div className="settings-row">
          <span className="settings-label">Focus ruler</span>
          <button
            type="button"
            className={'toggle' + (settings.focusRuler ? ' is-on' : '')}
            onClick={() => onChange({ focusRuler: !settings.focusRuler })}
            role="switch"
            aria-checked={settings.focusRuler}
            title="A highlight band that follows your cursor while reading"
          >
            <span className="toggle-knob" />
          </button>
        </div>
        {settings.focusRuler && (
          <>
            <div className="settings-row">
              <span className="settings-label">Ruler height</span>
              <input
                type="range"
                min={20}
                max={80}
                value={settings.rulerHeight}
                onChange={(e) => onChange({ rulerHeight: Number(e.target.value) })}
              />
            </div>
            <div className="settings-row">
              <span className="settings-label">Ruler strength</span>
              <input
                type="range"
                min={4}
                max={40}
                value={settings.rulerOpacity}
                onChange={(e) => onChange({ rulerOpacity: Number(e.target.value) })}
              />
            </div>
          </>
        )}
        <div className="settings-row">
          <span className="settings-label">AI summary on open</span>
          <button
            type="button"
            className={'toggle' + (settings.aiSummaryOnOpen ? ' is-on' : '')}
            onClick={() => onChange({ aiSummaryOnOpen: !settings.aiSummaryOnOpen })}
            role="switch"
            aria-checked={settings.aiSummaryOnOpen}
            title="Automatically summarize each document when you open it (uses your API key)"
          >
            <span className="toggle-knob" />
          </button>
        </div>
        <button type="button" className="settings-more" onClick={onOpenAll}>
          ⚙ All settings…
        </button>
      </div>
    </>
  )
}

function App(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [ready, setReady] = useState(false)
  const [folder, setFolder] = useState<string | null>(null)
  const [files, setFiles] = useState<MarkdownFileMeta[]>([])
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [current, setCurrent] = useState<MarkdownFileMeta | null>(null)
  const [doc, setDoc] = useState<{
    content: string
    raw: string
    baseDir: string
    title: string | null
  } | null>(null)
  const [editing, setEditing] = useState(false)
  const [tabs, setTabs] = useState<MarkdownFileMeta[]>([])
  const docCacheRef = useRef<
    Record<string, { content: string; raw: string; baseDir: string; title: string | null }>
  >({})
  const [libQuery, setLibQuery] = useState('')
  const [libResults, setLibResults] = useState<LibSearchResult[]>([])
  const [indexing, setIndexing] = useState(false)
  const [docQuery, setDocQuery] = useState('')
  const [tocOpen, setTocOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('name')
  const [bookmarks, setBookmarks] = useState<Record<string, Bookmark[]>>({})
  const [annotations, setAnnotations] = useState<Record<string, Annotation[]>>({})
  const [reviewOpen, setReviewOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [graphOpen, setGraphOpen] = useState(false)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [aiSeed, setAiSeed] = useState<{ action: AiAction; selection?: string } | null>(null)
  const [aiChats, setAiChats] = useState<Record<string, AiTurn[]>>({})
  const [favorites, setFavorites] = useState<string[]>([])
  const [slidesOpen, setSlidesOpen] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [settingsViewOpen, setSettingsViewOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [courseOpen, setCourseOpen] = useState(false)
  const [readmeOpen, setReadmeOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [docInfoOpen, setDocInfoOpen] = useState(false)
  const [settingsCat, setSettingsCat] = useState('Appearance')
  const [highlightsOpen, setHighlightsOpen] = useState(false)
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  // Newly-created collections that are still empty (folders are otherwise derived from files).
  const [extraFolders, setExtraFolders] = useState<string[]>([])
  const [hidden, setHidden] = useState<string[]>([]) // "Remove from Library" (not deleted on disk)
  const [missing, setMissing] = useState<string[]>([]) // referenced files no longer on disk
  const [deleteTarget, setDeleteTarget] = useState<MarkdownFileMeta | null>(null)
  const [folderDeleteTarget, setFolderDeleteTarget] = useState<string | null>(null)
  const [undoHidden, setUndoHidden] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null) // transient status/error toast
  const [recentFolders, setRecentFolders] = useState<string[]>([]) // recently opened library roots
  const recentFoldersRef = useRef<string[]>([])
  const [expandedMath, setExpandedMath] = useState<string | null>(null) // enlarged equation HTML

  const indexRef = useRef<{ index: MiniSearch<LibDoc>; docs: Map<string, LibDoc> } | null>(null)
  const positionsRef = useRef<Record<string, ReadingPosition>>({})
  const annotationsRef = useRef<Record<string, Annotation[]>>({})
  const bookmarksRef = useRef<Record<string, Bookmark[]>>({})
  const didInitRef = useRef(false)
  const closedTabsRef = useRef<MarkdownFileMeta[]>([])
  const currentRef = useRef<MarkdownFileMeta | null>(null)
  const filesRef = useRef<MarkdownFileMeta[]>([])
  const libQueryRef = useRef('')
  const currentFolderRef = useRef<string | null>(null)
  const titlesRef = useRef<Record<string, string>>({})
  const allDocsRef = useRef<MarkdownFileContent[]>([])
  const settingsRef = useRef(settings)
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    currentRef.current = current
  }, [current])
  useEffect(() => {
    annotationsRef.current = annotations
  }, [annotations])
  useEffect(() => {
    bookmarksRef.current = bookmarks
  }, [bookmarks])
  useEffect(() => {
    filesRef.current = files
  }, [files])
  useEffect(() => {
    libQueryRef.current = libQuery
  }, [libQuery])
  useEffect(() => {
    titlesRef.current = titles
  }, [titles])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = settings.theme
    root.dataset.font = settings.fontFamily
    root.style.setProperty('--reader-font-size', settings.fontSizePx + 'px')
    root.style.setProperty('--reader-width', settings.readingWidthCh + 'ch')
    root.style.setProperty('--reader-line-height', String(settings.lineHeight))
    if (!settings.accentEnabled) {
      // Neutral: every var(--accent) resolves to the theme's muted gray.
      root.style.setProperty('--accent', 'var(--fg-muted)')
      root.style.setProperty(
        '--accent-soft',
        'color-mix(in srgb, var(--fg-muted) 18%, transparent)'
      )
    } else if (settings.accent) {
      root.style.setProperty('--accent', settings.accent)
      root.style.removeProperty('--accent-soft')
    } else {
      root.style.removeProperty('--accent')
      root.style.removeProperty('--accent-soft')
    }
    root.style.setProperty(
      '--page-turn',
      settings.pageAnimation === 'off'
        ? '0ms'
        : settings.pageAnimation === 'smooth'
          ? '320ms'
          : '150ms'
    )
    root.style.setProperty('--ruler-strength', settings.rulerOpacity + '%')
    root.style.setProperty('--ruler-height', settings.rulerHeight + 'px')
    root.style.setProperty('--reader-weight', String(settings.fontWeight))
    root.style.setProperty('--reader-letter-spacing', settings.letterSpacing / 100 + 'em')
    root.style.setProperty('--reader-para-space', String(settings.paragraphSpacing / 100))
    root.style.setProperty('--reader-margin', String(settings.margins / 100))
    root.style.setProperty('--reader-align', settings.justify ? 'justify' : 'left')
    root.dataset.density = settings.uiDensity
  }, [settings])

  const indexBusyRef = useRef(false)
  const indexAgainRef = useRef<string | null>(null)
  const buildLibraryIndex = useCallback(async (folderPath: string) => {
    // Coalesce overlapping rebuilds (bursty file-watch events) into one trailing run.
    if (indexBusyRef.current) {
      indexAgainRef.current = folderPath
      return
    }
    indexBusyRef.current = true
    setIndexing(true)
    try {
      const all = await window.api.readAll(folderPath)
      allDocsRef.current = all
      indexRef.current = buildIndex(all)
      const t: Record<string, string> = {}
      for (const f of all) if (f.title) t[f.absolutePath] = f.title
      setTitles(t)
      setGraph(buildGraph(all))
      setTasks(scanTasks(all))
    } catch {
      indexRef.current = null
    } finally {
      setIndexing(false)
      indexBusyRef.current = false
      const again = indexAgainRef.current
      indexAgainRef.current = null
      if (again) void buildLibraryIndex(again)
    }
  }, [])

  // Load per-file notes (highlights, bookmarks, positions) from the library's sidecar file.
  const loadNotesFor = useCallback(async (folderPath: string) => {
    let map: Record<string, FileSidecar> = {}
    try {
      map = await window.api.sidecarLoad(folderPath)
    } catch {
      map = {}
    }
    const anns: Record<string, Annotation[]> = {}
    const bms: Record<string, Bookmark[]> = {}
    const pos: Record<string, ReadingPosition> = {}
    for (const [abs, d] of Object.entries(map)) {
      if (d.annotations?.length) anns[abs] = d.annotations
      if (d.bookmarks?.length) bms[abs] = d.bookmarks
      if (d.position) pos[abs] = d.position
    }
    annotationsRef.current = anns
    bookmarksRef.current = bms
    positionsRef.current = pos
    setAnnotations(anns)
    setBookmarks(bms)
  }, [])

  // Write one file's notes back to the sidecar (merging the unspecified slices from refs).
  const saveSidecar = useCallback(
    (
      abs: string,
      patch: { annotations?: Annotation[]; bookmarks?: Bookmark[]; position?: ReadingPosition }
    ) => {
      if (patch.annotations)
        annotationsRef.current = { ...annotationsRef.current, [abs]: patch.annotations }
      if (patch.bookmarks)
        bookmarksRef.current = { ...bookmarksRef.current, [abs]: patch.bookmarks }
      if (patch.position) positionsRef.current = { ...positionsRef.current, [abs]: patch.position }
      void window.api.sidecarSave(abs, {
        annotations: annotationsRef.current[abs] ?? [],
        bookmarks: bookmarksRef.current[abs] ?? [],
        position: positionsRef.current[abs] ?? null
      })
    },
    []
  )

  const doOpen = useCallback(async (meta: MarkdownFileMeta) => {
    setCurrent(meta)
    setDoc(null)
    setDocQuery('')
    setEditing(false)
    setTabs((prev) =>
      prev.some((t) => t.absolutePath === meta.absolutePath) ? prev : [...prev, meta]
    )
    try {
      const res = await window.api.readFile(meta.absolutePath)
      const d = { content: res.content, raw: res.raw, baseDir: res.baseDir, title: res.title }
      docCacheRef.current[meta.absolutePath] = d
      // Bail if the user switched files while this load was in flight.
      if (currentRef.current?.absolutePath !== meta.absolutePath) return
      setDoc(d)
    } catch (e) {
      if (currentRef.current?.absolutePath !== meta.absolutePath) return
      setDoc({
        content: '# Could not open file\n\n`' + String(e) + '`',
        raw: '',
        baseDir: '',
        title: null
      })
    }
    if (currentRef.current?.absolutePath !== meta.absolutePath) return
    window.api.setState({ lastFile: meta.absolutePath })
    if (settingsRef.current.aiSummaryOnOpen) {
      setAiOpen(true)
      setAiSeed({ action: 'summarize' })
    }
  }, [])

  // Track a library root in the most-recent-first list so the user can switch back in one click
  // (no re-browsing the file system). Persisted across sessions.
  const recordRecent = useCallback((dir: string): void => {
    if (!dir) return
    const norm = (p: string): string => p.replace(/\\/g, '/').toLowerCase()
    const next = [dir, ...recentFoldersRef.current.filter((p) => norm(p) !== norm(dir))].slice(0, 8)
    recentFoldersRef.current = next
    setRecentFolders(next)
    void window.api.setState({ recentFolders: next })
  }, [])

  // Open a single .md (file association / CLI / second instance): use its folder as the library.
  const openPathAsLibrary = useCallback(
    async (filePath: string) => {
      const dir = filePath.replace(/[\\/][^\\/]*$/, '')
      if (!dir) return
      try {
        const list = await window.api.listMarkdown(dir)
        setFolder(dir)
        recordRecent(dir)
        setFiles(list)
        filesRef.current = list
        setCurrent(null)
        setDoc(null)
        setTabs([])
        docCacheRef.current = {}
        setActiveTag(null)
        await loadNotesFor(dir)
        void window.api.setState({ lastFolder: dir })
        void buildLibraryIndex(dir)
        const norm = (p: string): string => p.replace(/\\/g, '/').toLowerCase()
        const meta = list.find((f) => norm(f.absolutePath) === norm(filePath))
        if (meta) void doOpen(meta)
      } catch {
        /* ignore */
      }
    },
    [buildLibraryIndex, doOpen, loadNotesFor, recordRecent]
  )

  const onChatChange = useCallback((t: AiTurn[]) => {
    const cur = currentRef.current
    if (!cur) return
    setAiChats((prev) => {
      const updated = { ...prev, [cur.absolutePath]: t.slice(-40) }
      void window.api.setState({ aiChats: updated })
      return updated
    })
  }, [])

  const saveDoc = useCallback(async (content: string) => {
    const cur = currentRef.current
    if (!cur) return
    await window.api.writeFile(cur.absolutePath, content)
    const res = await window.api.readFile(cur.absolutePath)
    const d = { content: res.content, raw: res.raw, baseDir: res.baseDir, title: res.title }
    docCacheRef.current[cur.absolutePath] = d
    if (currentRef.current?.absolutePath === cur.absolutePath) setDoc(d)
    if (res.title) setTitles((t) => ({ ...t, [cur.absolutePath]: res.title as string }))
  }, [])

  const newNote = useCallback(async () => {
    const f = currentFolderRef.current
    if (!f) return
    const path = await window.api.newFile(f, 'Untitled')
    if (!path) return
    const list = await window.api.listMarkdown(f)
    setFiles(list)
    filesRef.current = list
    const meta = list.find((x) => x.absolutePath === path)
    if (meta) {
      await doOpen(meta)
      setEditing(true)
    }
  }, [doOpen])

  // Create a new note pre-filled with content and open it in the editor for review.
  // Returns true on success; false if there's no active folder or the write failed (so callers can
  // surface a message instead of silently doing nothing).
  const newNoteWith = useCallback(
    async (content: string, name: string): Promise<boolean> => {
      const f = currentFolderRef.current
      if (!f) return false
      try {
        const path = await window.api.newFile(f, name)
        if (!path) return false
        await window.api.writeFile(path, content)
        const list = await window.api.listMarkdown(f)
        setFiles(list)
        filesRef.current = list
        const meta = list.find((x) => x.absolutePath === path)
        if (meta) {
          await doOpen(meta)
          setEditing(true)
        }
        return true
      } catch {
        return false
      }
    },
    [doOpen]
  )

  // Create a new note from a curated template scaffold and open it in the editor.
  const newFromTemplate = useCallback(
    async (t: DocTemplate): Promise<void> => {
      const ctx = { date: new Date().toISOString().slice(0, 10) }
      const ok = await newNoteWith(t.build(ctx), t.fileName(ctx))
      if (!ok) setNotice('Couldn’t create the note. Open a folder or vault first, then try again.')
    },
    [newNoteWith]
  )

  // After a course pack is written, refresh the library and open its Overview note.
  const openCourseResult = useCallback(
    async (overviewPath: string): Promise<void> => {
      const f = currentFolderRef.current
      if (!f) return
      const list = await window.api.listMarkdown(f)
      setFiles(list)
      filesRef.current = list
      const meta = list.find((x) => x.absolutePath === overviewPath)
      if (meta) await doOpen(meta)
    },
    [doOpen]
  )

  const openByPath = useCallback(
    (abs: string) => {
      const meta = filesRef.current.find((f) => f.absolutePath === abs)
      if (!meta) return
      const carry = libQueryRef.current.trim()
      void doOpen(meta).then(() => {
        if (carry) setDocQuery(carry)
      })
    },
    [doOpen]
  )

  const switchTab = useCallback(
    (abs: string) => {
      const meta = tabs.find((t) => t.absolutePath === abs)
      if (!meta) return
      setEditing(false)
      setDocQuery('')
      setAiOpen(false)
      setCurrent(meta)
      const cached = docCacheRef.current[abs]
      if (cached) setDoc(cached)
      else void doOpen(meta)
      void window.api.setState({ lastFile: abs })
    },
    [tabs, doOpen]
  )

  const closeTab = useCallback(
    (abs: string) => {
      const closed = tabs.find((t) => t.absolutePath === abs)
      if (closed) {
        closedTabsRef.current = [
          ...closedTabsRef.current.filter((t) => t.absolutePath !== abs),
          closed
        ].slice(-20)
      }
      delete docCacheRef.current[abs]
      const idx = tabs.findIndex((t) => t.absolutePath === abs)
      const next = tabs.filter((t) => t.absolutePath !== abs)
      setTabs(next)
      if (currentRef.current?.absolutePath === abs) {
        const neighbor = next[idx] ?? next[idx - 1] ?? null
        setEditing(false)
        setAiOpen(false)
        setDocQuery('')
        if (neighbor) {
          setCurrent(neighbor)
          const c = docCacheRef.current[neighbor.absolutePath]
          if (c) setDoc(c)
          else void doOpen(neighbor)
        } else {
          setCurrent(null)
          setDoc(null)
        }
      }
    },
    [tabs, doOpen]
  )

  const onToggleFavorite = useCallback((abs: string) => {
    setFavorites((prev) => {
      const next = prev.includes(abs) ? prev.filter((x) => x !== abs) : [...prev, abs]
      void window.api.setState({ favorites: next })
      return next
    })
  }, [])

  // Strip one or more paths from all persisted references (favorites, recents, annotations,
  // bookmarks, positions, ai chats, hidden), close any open tab, and persist — used on delete/cleanup.
  const applyPurge = useCallback(
    (paths: string[]) => {
      let s: PersistedState = {
        lastFolder: currentFolderRef.current,
        lastFile: currentRef.current?.absolutePath ?? null,
        positions: positionsRef.current,
        bookmarks: bookmarksRef.current,
        annotations: annotationsRef.current,
        aiChats,
        favorites,
        hidden,
        recentFolders: recentFoldersRef.current
      }
      for (const p of paths) s = purgeState(s, p)
      positionsRef.current = s.positions
      bookmarksRef.current = s.bookmarks
      annotationsRef.current = s.annotations
      setAnnotations(s.annotations)
      setBookmarks(s.bookmarks)
      setAiChats(s.aiChats)
      setFavorites(s.favorites)
      setHidden(s.hidden)
      void window.api.setState(s)
      for (const p of paths) closeTab(p)
    },
    [aiChats, favorites, hidden, closeTab]
  )

  const deleteFileToTrash = useCallback(
    async (meta: MarkdownFileMeta): Promise<string | null> => {
      const res = await window.api.trashFile(meta.absolutePath)
      if (!res.ok) return res.error ?? 'Could not move the file to the Recycle Bin.'
      applyPurge([meta.absolutePath])
      setDeleteTarget(null)
      const f = currentFolderRef.current
      if (f) {
        const list = await window.api.listMarkdown(f)
        setFiles(list)
        filesRef.current = list
        void buildLibraryIndex(f)
      }
      return null
    },
    [applyPurge, buildLibraryIndex]
  )

  const deleteFolder = useCallback(
    async (folderName: string): Promise<string | null> => {
      const res = await window.api.trashFolder(folderName)
      if (!res.ok) return res.error ?? 'Could not move the folder to the Recycle Bin.'
      const underIt = filesRef.current
        .filter((f) => f.relativePath.startsWith(folderName + '/'))
        .map((f) => f.absolutePath)
      if (underIt.length) applyPurge(underIt)
      setExtraFolders((prev) => prev.filter((x) => x !== folderName))
      setActiveFolder((cur) => (cur === folderName ? null : cur))
      setFolderDeleteTarget(null)
      const f = currentFolderRef.current
      if (f) {
        const list = await window.api.listMarkdown(f)
        setFiles(list)
        filesRef.current = list
        void buildLibraryIndex(f)
      }
      return null
    },
    [applyPurge, buildLibraryIndex]
  )

  const removeFromLibrary = useCallback((abs: string) => {
    setHidden((prev) => {
      const next = [...new Set([...prev, abs])]
      void window.api.setState({ hidden: next })
      return next
    })
    setDeleteTarget(null)
    setUndoHidden(abs)
  }, [])

  const undoRemove = useCallback(() => {
    setUndoHidden((p) => {
      if (p)
        setHidden((prev) => {
          const next = prev.filter((x) => x !== p)
          void window.api.setState({ hidden: next })
          return next
        })
      return null
    })
  }, [])

  const cleanupMissing = useCallback(() => {
    if (missing.length) applyPurge(missing)
    setMissing([])
  }, [missing, applyPurge])

  // Detect files referenced (favorites/recents/notes) under the current library that vanished from disk.
  useEffect(() => {
    if (!folder) {
      setMissing([])
      return
    }
    const inFiles = new Set(files.map((x) => x.absolutePath))
    const refs = new Set<string>([
      ...favorites,
      ...Object.keys(positionsRef.current),
      ...Object.keys(annotationsRef.current),
      ...Object.keys(bookmarksRef.current)
    ])
    const sep = folder.includes('\\') ? '\\' : '/'
    const candidates = [...refs].filter((p) => p.startsWith(folder + sep) && !inFiles.has(p))
    if (candidates.length === 0) {
      setMissing([])
      return
    }
    let cancelled = false
    void window.api.checkMissing(candidates).then((m) => {
      if (!cancelled) setMissing(m)
    })
    return () => {
      cancelled = true
    }
  }, [files, folder, favorites])

  // Auto-dismiss the "removed from library" undo toast.
  useEffect(() => {
    if (!undoHidden) return
    const t = setTimeout(() => setUndoHidden(null), 6000)
    return () => clearTimeout(t)
  }, [undoHidden])

  // Auto-dismiss the transient status/error notice.
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(t)
  }, [notice])

  // Delegated handler for the per-equation toolbar (copy LaTeX / expand) injected by rehypeMathActions.
  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null
      const copyBtn = target?.closest('.math-copy') as HTMLElement | null
      if (copyBtn) {
        const tex = copyBtn.getAttribute('data-latex') || ''
        if (tex) void navigator.clipboard?.writeText(tex).catch(() => {})
        copyBtn.textContent = 'Copied!'
        setTimeout(() => (copyBtn.textContent = 'Copy LaTeX'), 1200)
        return
      }
      const expandBtn = target?.closest('.math-expand') as HTMLElement | null
      if (expandBtn) {
        const eq = expandBtn.closest('.math-block')?.querySelector('.katex-display')
        if (eq) setExpandedMath(eq.outerHTML)
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  const toggleTask = useCallback(async (task: TaskItem) => {
    try {
      const res = await window.api.readFile(task.fileAbs)
      const nextRaw = toggleInRaw(res.raw, task.index)
      if (nextRaw === res.raw) return
      await window.api.writeFile(task.fileAbs, nextRaw)
      setTasks((prev) =>
        prev.map((t) =>
          t.fileAbs === task.fileAbs && t.index === task.index ? { ...t, checked: !t.checked } : t
        )
      )
      const cur = currentRef.current
      if (cur && cur.absolutePath === task.fileAbs) {
        const fresh = await window.api.readFile(task.fileAbs)
        const d = {
          content: fresh.content,
          raw: fresh.raw,
          baseDir: fresh.baseDir,
          title: fresh.title
        }
        docCacheRef.current[task.fileAbs] = d
        if (currentRef.current?.absolutePath === task.fileAbs) setDoc(d)
      }
    } catch (e) {
      console.error('Could not toggle task:', e)
    }
  }, [])

  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true
    void (async () => {
      const [s, st] = await Promise.all([window.api.getSettings(), window.api.getState()])
      setSettings(s)
      setAiChats(st.aiChats ?? {})
      setFavorites(st.favorites ?? [])
      setHidden(st.hidden ?? [])
      recentFoldersRef.current = st.recentFolders ?? []
      setRecentFolders(recentFoldersRef.current)
      const pending = await window.api.getPendingOpenPath().catch(() => null)
      if (pending) {
        await openPathAsLibrary(pending)
      } else if (st.lastFolder) {
        try {
          const list = await window.api.listMarkdown(st.lastFolder)
          setFolder(st.lastFolder)
          recordRecent(st.lastFolder)
          setFiles(list)
          filesRef.current = list
          await loadNotesFor(st.lastFolder)
          void buildLibraryIndex(st.lastFolder)
          if (st.lastFile && list.some((f) => f.absolutePath === st.lastFile)) {
            void doOpen(list.find((f) => f.absolutePath === st.lastFile)!)
          }
        } catch {
          /* folder may have moved */
        }
      } else {
        // First run: open the managed vault (Documents/MD Reader) as the home library.
        try {
          const p = await window.api.openVault()
          const list = await window.api.listMarkdown(p)
          setFolder(p)
          recordRecent(p)
          setFiles(list)
          filesRef.current = list
          await loadNotesFor(p)
          void buildLibraryIndex(p)
          void window.api.setState({ lastFolder: p })
        } catch {
          /* vault unavailable — fall through to welcome */
        }
      }
      setReady(true)
    })()
  }, [buildLibraryIndex, doOpen, loadNotesFor, openPathAsLibrary, recordRecent])

  // Refresh when files on disk change.
  useEffect(() => {
    const unsub = window.api.onLibraryChanged(() => {
      const f = currentFolderRef.current
      if (!f) return
      void window.api.listMarkdown(f).then((list) => {
        setFiles(list)
        filesRef.current = list
      })
      void buildLibraryIndex(f)
    })
    return unsub
  }, [buildLibraryIndex])

  // A second launch / macOS open-file pushes the path here while the app is already open.
  useEffect(() => {
    const unsub = window.api.onOpenPath((p) => void openPathAsLibrary(p))
    return unsub
  }, [openPathAsLibrary])

  useEffect(() => {
    currentFolderRef.current = folder
  }, [folder])

  useEffect(() => {
    if (indexRef.current && libQuery.trim()) {
      setLibResults(runLibrarySearch(indexRef.current, libQuery))
    } else {
      setLibResults([])
    }
  }, [libQuery, indexing])

  const openLibrary = useCallback(
    async (folderPath: string) => {
      let list: MarkdownFileMeta[]
      try {
        list = await window.api.listMarkdown(folderPath)
      } catch {
        // The folder was moved/deleted/unmounted — drop it from recents and tell the user.
        const norm = (p: string): string => p.replace(/\\/g, '/').toLowerCase()
        const next = recentFoldersRef.current.filter((p) => norm(p) !== norm(folderPath))
        recentFoldersRef.current = next
        setRecentFolders(next)
        void window.api.setState({ recentFolders: next })
        setNotice('That folder is no longer available. It was removed from Recent.')
        return
      }
      setFolder(folderPath)
      recordRecent(folderPath)
      setFiles(list)
      filesRef.current = list
      setCurrent(null)
      setDoc(null)
      setTabs([])
      docCacheRef.current = {}
      setLibQuery('')
      indexRef.current = null
      setTitles({})
      setGraph(null)
      setActiveTag(null)
      setActiveFolder(null)
      setExtraFolders([])
      setGraphOpen(false)
      await loadNotesFor(folderPath)
      window.api.setState({ lastFolder: folderPath, lastFile: null })
      void buildLibraryIndex(folderPath)
    },
    [buildLibraryIndex, loadNotesFor, recordRecent]
  )

  const pickFolder = useCallback(async () => {
    const folderPath = await window.api.pickFolder()
    if (folderPath) await openLibrary(folderPath)
  }, [openLibrary])

  const openVault = useCallback(async () => {
    const p = await window.api.openVault()
    await openLibrary(p)
  }, [openLibrary])

  // Refresh the current library's file list (after create-folder / import).
  const refreshFiles = useCallback(async () => {
    const f = currentFolderRef.current
    if (!f) return
    const list = await window.api.listMarkdown(f)
    setFiles(list)
    filesRef.current = list
    void buildLibraryIndex(f)
  }, [buildLibraryIndex])

  const createFolder = useCallback(
    async (name: string) => {
      if (!name.trim()) return
      const p = await window.api.createFolder(name.trim())
      const folderName = p ? p.split(/[\\/]/).pop() : null
      if (folderName) setExtraFolders((prev) => [...new Set([...prev, folderName])])
      await refreshFiles()
    },
    [refreshFiles]
  )

  const importFiles = useCallback(
    async (subdir: string) => {
      await window.api.importFiles(subdir || '')
      await refreshFiles()
    },
    [refreshFiles]
  )

  const importFolder = useCallback(async () => {
    await window.api.importFolder()
    await refreshFiles()
  }, [refreshFiles])

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((s) => ({ ...s, ...patch }))
    void window.api.setSettings(patch)
  }, [])

  const onPositionChange = useCallback(
    (pos: ReadingPosition) => {
      const cur = currentRef.current
      if (!cur) return
      saveSidecar(cur.absolutePath, { position: pos })
    },
    [saveSidecar]
  )

  const onBookmarksChange = useCallback(
    (next: Bookmark[]) => {
      const cur = currentRef.current
      if (!cur) return
      setBookmarks((prev) => ({ ...prev, [cur.absolutePath]: next }))
      saveSidecar(cur.absolutePath, { bookmarks: next })
    },
    [saveSidecar]
  )

  const onAnnotationsChange = useCallback(
    (next: Annotation[]) => {
      const cur = currentRef.current
      if (!cur) return
      setAnnotations((prev) => ({ ...prev, [cur.absolutePath]: next }))
      saveSidecar(cur.absolutePath, { annotations: next })
    },
    [saveSidecar]
  )

  const rateCard = useCallback(
    (fileAbs: string, annId: string, rating: number) => {
      const list = annotationsRef.current[fileAbs] ?? []
      const updatedList = list.map((a) =>
        a.id === annId && a.card ? { ...a, card: scheduleCard(a.card, rating) } : a
      )
      setAnnotations((prev) => ({ ...prev, [fileAbs]: updatedList }))
      saveSidecar(fileAbs, { annotations: updatedList })
    },
    [saveSidecar]
  )

  const getLibraryContext = useCallback((query: string): string => {
    const idx = indexRef.current
    if (!idx || !query.trim()) return ''
    const hits = idx.index.search(query).slice(0, 4)
    const parts: string[] = []
    let budget = 120_000
    for (const h of hits) {
      const d = allDocsRef.current.find((f) => f.absolutePath === (h.id as string))
      if (!d) continue
      const piece = `## ${d.title || d.name}\n\n${d.content}`.slice(0, 40_000)
      if (budget - piece.length < 0) break
      parts.push(piece)
      budget -= piece.length
    }
    return parts.join('\n\n---\n\n')
  }, [])

  const onAddAiCard = useCallback(
    (q: string, a: string) => {
      const cur = currentRef.current
      if (!cur) return
      const list = annotationsRef.current[cur.absolutePath] ?? []
      const ann: Annotation = {
        id: uid(),
        start: 0,
        end: 0,
        color: 'yellow',
        text: a,
        card: newCard(q),
        createdAt: Date.now()
      }
      const updatedList = [...list, ann]
      setAnnotations((prev) => ({ ...prev, [cur.absolutePath]: updatedList }))
      saveSidecar(cur.absolutePath, { annotations: updatedList })
    },
    [saveSidecar]
  )

  const onAiExplain = useCallback((text: string) => {
    if (!text.trim()) return
    setAiOpen(true)
    setAiSeed({ action: 'explain', selection: text })
  }, [])

  const onOpenRelative = useCallback(
    (href: string) => {
      const cur = currentRef.current
      if (!cur) return
      const clean = href.split('#')[0].split('?')[0]
      if (!clean) return
      const parts = cur.relativePath.split('/').slice(0, -1)
      for (const seg of clean.split('/')) {
        if (seg === '..') parts.pop()
        else if (seg !== '.' && seg !== '') parts.push(seg)
      }
      const targetRel = parts.join('/')
      const meta =
        filesRef.current.find((f) => f.relativePath === targetRel) ??
        filesRef.current.find((f) => f.relativePath === targetRel + '.md')
      if (meta) void doOpen(meta)
      else if (/^https?:/i.test(href)) window.api.openExternal(href)
    },
    [doOpen]
  )

  const openWiki = useCallback(
    (name: string) => {
      const key = name.trim().toLowerCase().replace(NAME_EXT, '')
      const meta = filesRef.current.find((f) => {
        const t = (titlesRef.current[f.absolutePath] || titleOf(f.name)).toLowerCase()
        const base = f.name.replace(NAME_EXT, '').toLowerCase()
        const rel = f.relativePath.replace(NAME_EXT, '').toLowerCase()
        return t === key || base === key || rel === key
      })
      if (meta) void doOpen(meta)
    },
    [doOpen]
  )

  const backToLibrary = useCallback(() => {
    setCurrent(null)
    setDoc(null)
    setDocQuery('')
    setEditing(false)
    setAiOpen(false)
  }, [])

  const cycleTheme = useCallback(() => {
    const order: ThemeName[] = ['light', 'sepia', 'dark', 'nord', 'contrast']
    const i = order.indexOf(settings.theme)
    updateSettings({ theme: order[(i + 1) % order.length] })
  }, [settings.theme, updateSettings])

  const reopenClosed = useCallback(() => {
    const stack = closedTabsRef.current
    while (stack.length) {
      const meta = stack.pop()
      if (meta && filesRef.current.some((f) => f.absolutePath === meta.absolutePath)) {
        void doOpen(meta)
        return
      }
    }
  }, [doOpen])

  // Global shortcuts: command palette + help + reopen-closed-tab.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault()
        reopenClosed()
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        if (filesRef.current.length > 0) {
          e.preventDefault()
          setPaletteOpen((o) => !o)
        }
        return
      }
      const el = document.activeElement
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
      if (e.key === '?' && !typing) {
        e.preventDefault()
        setHelpOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setPaletteOpen(false)
        setHelpOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reopenClosed])

  const titleFor = useCallback(
    (meta: MarkdownFileMeta): string => titles[meta.absolutePath] || titleOf(meta.name),
    [titles]
  )

  const exportHtml = useCallback(async () => {
    setExportOpen(false)
    const cur = currentRef.current
    if (!cur || !doc) return
    const t = titleFor(cur)
    try {
      const content = await renderDocHtml(doc.content, t, settings.theme)
      await window.api.exportSave({
        defaultName: t + '.html',
        content,
        filters: [{ name: 'HTML', extensions: ['html'] }]
      })
    } catch {
      setNotice('Couldn’t export this document to HTML.')
    }
  }, [doc, titleFor, settings.theme])

  const exportDocx = useCallback(async () => {
    setExportOpen(false)
    const cur = currentRef.current
    if (!cur || !doc) return
    try {
      const html = await renderBodyHtml(doc.content, settings.theme)
      await window.api.exportDocx({ defaultName: titleFor(cur) + '.docx', html })
    } catch {
      setNotice('Couldn’t export this document to Word.')
    }
  }, [doc, titleFor, settings.theme])

  const exportNotes = useCallback(() => {
    setExportOpen(false)
    const cur = currentRef.current
    if (!cur) return
    void window.api.exportSave({
      defaultName: titleFor(cur) + '-notes.md',
      content: annotationsToMarkdown(titleFor(cur), annotations[cur.absolutePath] ?? []),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
  }, [annotations, titleFor])

  const exportDeck = useCallback(() => {
    const cards = Object.entries(annotations).flatMap(([abs, list]) =>
      list
        .filter((a) => a.card)
        .map((a) => ({
          q: a.card!.question,
          a: a.text,
          source: titles[abs] || abs.split(/[\\/]/).pop() || abs
        }))
    )
    void window.api.exportSave({
      defaultName: 'flashcards.csv',
      content: deckToCsv(cards),
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
  }, [annotations, titles])

  const sortedFiles = useMemo(() => {
    const arr = [...files]
    const pos = positionsRef.current
    if (sortMode === 'modified') arr.sort((a, b) => b.mtimeMs - a.mtimeMs)
    else if (sortMode === 'recent')
      arr.sort(
        (a, b) => (pos[b.absolutePath]?.updatedAt ?? 0) - (pos[a.absolutePath]?.updatedAt ?? 0)
      )
    else
      arr.sort((a, b) =>
        titleFor(a).localeCompare(titleFor(b), undefined, { numeric: true, sensitivity: 'base' })
      )
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, sortMode, titles, current])

  const continueReading = useMemo(() => {
    const pos = positionsRef.current
    const h = new Set(hidden)
    return files
      .filter((f) => pos[f.absolutePath]?.updatedAt && !h.has(f.absolutePath))
      .sort((a, b) => (pos[b.absolutePath]!.updatedAt ?? 0) - (pos[a.absolutePath]!.updatedAt ?? 0))
      .slice(0, 6)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, current, hidden])

  const folders = useMemo(() => {
    const set = new Set<string>()
    for (const f of files) {
      const i = f.relativePath.indexOf('/')
      if (i > 0) set.add(f.relativePath.slice(0, i))
    }
    for (const x of extraFolders) set.add(x)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [files, extraFolders])

  const displayFiles = useMemo(() => {
    let arr = sortedFiles
    if (hidden.length) {
      const h = new Set(hidden)
      arr = arr.filter((f) => !h.has(f.absolutePath))
    }
    if (activeTag && graph) {
      const set = new Set(graph.tagIndex[activeTag] ?? [])
      arr = arr.filter((f) => set.has(f.absolutePath))
    }
    if (activeFolder) arr = arr.filter((f) => f.relativePath.startsWith(activeFolder + '/'))
    return arr
  }, [sortedFiles, activeTag, graph, activeFolder, hidden])

  const currentBacklinks = useMemo(() => {
    if (!current || !graph) return []
    return (graph.backlinks[current.absolutePath] ?? []).map((id) => ({
      id,
      title: graph.titleOf[id] || id
    }))
  }, [current, graph])

  const dueCards = useMemo(() => {
    const now = Date.now()
    const out: { fileAbs: string; title: string; annotation: Annotation }[] = []
    for (const [abs, list] of Object.entries(annotations)) {
      for (const a of list) {
        if (a.card && a.card.due <= now) {
          const meta = filesRef.current.find((f) => f.absolutePath === abs)
          out.push({
            fileAbs: abs,
            title: meta ? titleFor(meta) : abs.split(/[\\/]/).pop() || abs,
            annotation: a
          })
        }
      }
    }
    return out
  }, [annotations, titleFor])

  const totalCards = useMemo(
    () => Object.values(annotations).reduce((n, l) => n + l.filter((a) => a.card).length, 0),
    [annotations]
  )

  const allHighlights = useMemo(() => {
    const out: { fileAbs: string; title: string; annotation: Annotation }[] = []
    for (const [abs, list] of Object.entries(annotations)) {
      for (const a of list) {
        if (a.text && a.text.trim()) {
          const meta = filesRef.current.find((f) => f.absolutePath === abs)
          out.push({
            fileAbs: abs,
            title: meta ? titleFor(meta) : abs.split(/[\\/]/).pop() || abs,
            annotation: a
          })
        }
      }
    }
    return out
  }, [annotations, titleFor])

  const tagList = useMemo(() => (graph ? Object.keys(graph.tagIndex).sort() : []), [graph])
  const wikiTargets = useMemo(() => files.map((f) => titleFor(f)), [files, titleFor])

  const docInfo = useMemo(() => {
    if (!docInfoOpen || !doc) return null
    return {
      stats: computeDocStats(doc.raw),
      broken: findBrokenWikiLinks(doc.raw, wikiTargets)
    }
  }, [docInfoOpen, doc, wikiTargets])

  const currentTitle = doc?.title || (current ? titleFor(current) : 'MD Reader')

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          {current && (
            <button
              type="button"
              className="btn-icon"
              onClick={backToLibrary}
              title="Back to library"
            >
              ←
            </button>
          )}
          <span className="app-title">{currentTitle}</span>
          {indexing && !current && <span className="badge">indexing…</span>}
        </div>
        <div className="topbar-center">
          {folder && (
            <input
              className="search-input"
              type="search"
              spellCheck={false}
              placeholder={current ? 'Find in page…' : 'Search library…'}
              value={current ? docQuery : libQuery}
              onChange={(e) =>
                current ? setDocQuery(e.target.value) : setLibQuery(e.target.value)
              }
            />
          )}
        </div>
        <div className="topbar-right">
          {current && (
            <button
              type="button"
              className={'btn-icon' + (editing ? ' is-active' : '')}
              onClick={() => setEditing((e) => !e)}
              title={editing ? 'Done editing' : 'Edit'}
              aria-pressed={editing}
            >
              ✎
            </button>
          )}
          {current && !editing && (
            <button
              type="button"
              className={'btn-icon' + (tocOpen ? ' is-active' : '')}
              onClick={() => setTocOpen((o) => !o)}
              title="Table of contents"
              aria-pressed={tocOpen}
            >
              ☰
            </button>
          )}
          {current && (
            <button
              type="button"
              className={'btn-icon' + (aiOpen ? ' is-active' : '')}
              onClick={() => setAiOpen((o) => !o)}
              title="Study assistant (AI)"
              aria-pressed={aiOpen}
            >
              ✨
            </button>
          )}
          {current && !editing && (
            <button
              type="button"
              className={'btn-icon' + (createOpen ? ' is-active' : '')}
              onClick={() => setCreateOpen(true)}
              title="Repurpose with AI"
              aria-pressed={createOpen}
            >
              ✦
            </button>
          )}
          {current && !editing && (
            <div className="export-wrap">
              <button
                type="button"
                className={'btn-icon' + (exportOpen ? ' is-active' : '')}
                onClick={() => setExportOpen((o) => !o)}
                title="Export"
                aria-pressed={exportOpen}
              >
                ⇩
              </button>
              {exportOpen && (
                <>
                  <div
                    className="panel-backdrop"
                    onClick={() => setExportOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="export-menu">
                    <button type="button" onClick={() => void exportHtml()}>
                      Export HTML
                    </button>
                    <button type="button" onClick={() => void exportDocx()}>
                      Export Word (.docx)
                    </button>
                    <button type="button" onClick={exportNotes}>
                      Export highlights (.md)
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {current && !editing && (
            <button
              type="button"
              className="btn-icon"
              onClick={() => setSlidesOpen(true)}
              title="Present (slides)"
            >
              ▦
            </button>
          )}
          {current && !editing && (
            <button
              type="button"
              className={'btn-icon' + (docInfoOpen ? ' is-active' : '')}
              onClick={() => setDocInfoOpen(true)}
              title="Document info"
              aria-pressed={docInfoOpen}
            >
              ⓘ
            </button>
          )}
          <button type="button" className="btn-icon" onClick={cycleTheme} title="Switch theme">
            ◑
          </button>
          <button type="button" className="btn-icon" onClick={pickFolder} title="Open folder">
            📂
          </button>
          <button
            type="button"
            className={'btn-icon' + (settingsOpen ? ' is-active' : '')}
            onClick={() => setSettingsOpen((o) => !o)}
            title="Reading settings"
            aria-pressed={settingsOpen}
          >
            Aa
          </button>
          {settingsOpen && (
            <SettingsPanel
              settings={settings}
              onChange={updateSettings}
              onClose={() => setSettingsOpen(false)}
              onOpenAll={() => {
                setSettingsOpen(false)
                setSettingsCat('Appearance')
                setSettingsViewOpen(true)
              }}
            />
          )}
        </div>
      </header>

      {tabs.length > 0 && (
        <div className="tab-bar">
          {tabs.map((t) => (
            <div
              key={t.absolutePath}
              className={'tab' + (current?.absolutePath === t.absolutePath ? ' is-active' : '')}
              onClick={() => switchTab(t.absolutePath)}
              title={t.relativePath}
            >
              <span className="tab-title">{titleFor(t)}</span>
              <button
                type="button"
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(t.absolutePath)
                }}
                aria-label="Close tab"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <main className="content-area">
        {!ready ? (
          <div className="loading">Loading…</div>
        ) : current ? (
          doc ? (
            editing ? (
              <Editor
                raw={doc.raw}
                baseDir={doc.baseDir}
                fileKey={current.absolutePath}
                settings={settings}
                onSave={saveDoc}
                wikiTargets={wikiTargets}
                onNotice={setNotice}
              />
            ) : (
              <Reader
                content={doc.content}
                baseDir={doc.baseDir}
                fileKey={current.absolutePath}
                settings={settings}
                initialPosition={positionsRef.current[current.absolutePath] ?? null}
                searchQuery={docQuery}
                tocOpen={tocOpen}
                bookmarks={bookmarks[current.absolutePath] ?? []}
                backlinks={currentBacklinks}
                annotations={annotations[current.absolutePath] ?? []}
                onPositionChange={onPositionChange}
                onOpenRelative={onOpenRelative}
                onOpenWiki={openWiki}
                onOpenPath={openByPath}
                onBookmarksChange={onBookmarksChange}
                onAnnotationsChange={onAnnotationsChange}
                onAiExplain={onAiExplain}
              />
            )
          ) : (
            <div className="loading">Opening…</div>
          )
        ) : (
          <Library
            files={displayFiles}
            continueReading={continueReading}
            titles={titles}
            positions={positionsRef.current}
            query={libQuery}
            results={libResults}
            hasFolder={!!folder}
            sortMode={sortMode}
            onSortChange={setSortMode}
            onOpen={openByPath}
            onPickFolder={pickFolder}
            onOpenVault={openVault}
            recentFolders={recentFolders.filter((f) => f !== folder)}
            onOpenRecent={openLibrary}
            onCreateFolder={createFolder}
            onImportFiles={() => importFiles(activeFolder ?? '')}
            onImportFolder={importFolder}
            onNewNote={newNote}
            onNewFromTemplate={() => setTemplateOpen(true)}
            onNewCourse={() => setCourseOpen(true)}
            onReadme={() => setReadmeOpen(true)}
            tags={tagList}
            activeTag={activeTag}
            onTagClick={(tag) => setActiveTag((t) => (t === tag ? null : tag))}
            onOpenGraph={() => setGraphOpen(true)}
            hasGraph={!!graph && graph.links.length > 0}
            hasCards={totalCards > 0}
            dueCount={dueCards.length}
            onReview={() => setReviewOpen(true)}
            onExportDeck={exportDeck}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
            onRequestDelete={setDeleteTarget}
            onDeleteFolder={setFolderDeleteTarget}
            missingCount={missing.length}
            onCleanupMissing={cleanupMissing}
            taskCount={tasks.length}
            openTaskCount={tasks.filter((t) => !t.checked).length}
            onOpenTasks={() => setTasksOpen(true)}
            highlightCount={allHighlights.length}
            onOpenHighlights={() => setHighlightsOpen(true)}
            folders={folders}
            activeFolder={activeFolder}
            onFolderClick={(f) => setActiveFolder((cur) => (cur === f ? null : f))}
          />
        )}
      </main>

      {graphOpen && graph && (
        <GraphView
          graph={graph}
          onOpen={(abs) => {
            setGraphOpen(false)
            openByPath(abs)
          }}
          onClose={() => setGraphOpen(false)}
        />
      )}
      {reviewOpen && (
        <FlashcardReview
          cards={dueCards}
          total={totalCards}
          onRate={rateCard}
          onOpenFile={(abs) => {
            setReviewOpen(false)
            openByPath(abs)
          }}
          onClose={() => setReviewOpen(false)}
        />
      )}
      {current && doc && (
        <AiPanel
          open={aiOpen}
          doc={doc.content}
          provider={settings.aiProvider}
          model={settings.aiModel}
          baseUrl={settings.aiBaseUrl}
          fileKey={current.absolutePath}
          libraryTitles={wikiTargets}
          initialTurns={aiChats[current.absolutePath] ?? []}
          getSelection={() => window.getSelection()?.toString() ?? ''}
          getLibraryContext={getLibraryContext}
          seed={aiSeed}
          onSeedConsumed={() => setAiSeed(null)}
          onAddCard={onAddAiCard}
          onTurnsChange={onChatChange}
          onConfigure={() => {
            setAiOpen(false)
            setSettingsCat('AI')
            setSettingsViewOpen(true)
          }}
          onClose={() => setAiOpen(false)}
        />
      )}

      {createOpen && current && doc && (
        <CreatePanel
          docContent={doc.content}
          docTitle={currentTitle}
          provider={settings.aiProvider}
          model={settings.aiModel}
          baseUrl={settings.aiBaseUrl}
          onConfigure={() => {
            setCreateOpen(false)
            setSettingsCat('AI')
            setSettingsViewOpen(true)
          }}
          onOpenInEditor={(content, name) => {
            setCreateOpen(false)
            void newNoteWith(content, name).then((ok) => {
              if (!ok) setNotice('Couldn’t open the generated note in the editor.')
            })
          }}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {templateOpen && (
        <TemplatePicker
          onChoose={(t) => {
            setTemplateOpen(false)
            void newFromTemplate(t)
          }}
          onClose={() => setTemplateOpen(false)}
        />
      )}

      {docInfo && (
        <DocInfoPanel
          title={currentTitle}
          stats={docInfo.stats}
          brokenLinks={docInfo.broken}
          onClose={() => setDocInfoOpen(false)}
        />
      )}

      {courseOpen && (
        <CoursePanel
          provider={settings.aiProvider}
          model={settings.aiModel}
          baseUrl={settings.aiBaseUrl}
          onConfigure={() => {
            setCourseOpen(false)
            setSettingsCat('AI')
            setSettingsViewOpen(true)
          }}
          onOpenCourse={(overviewPath) => {
            setCourseOpen(false)
            void openCourseResult(overviewPath)
          }}
          onClose={() => setCourseOpen(false)}
        />
      )}

      {readmeOpen && (
        <ReadmePanel
          provider={settings.aiProvider}
          model={settings.aiModel}
          baseUrl={settings.aiBaseUrl}
          onConfigure={() => {
            setReadmeOpen(false)
            setSettingsCat('AI')
            setSettingsViewOpen(true)
          }}
          onOpenInEditor={(content, name) => {
            setReadmeOpen(false)
            void newNoteWith(content, name).then((ok) => {
              if (!ok) setNotice('Couldn’t open the generated note in the editor.')
            })
          }}
          onClose={() => setReadmeOpen(false)}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          fileName={titleFor(deleteTarget)}
          filePath={deleteTarget.absolutePath}
          hasUnsavedEdits={editing && current?.absolutePath === deleteTarget.absolutePath}
          onRemove={() => removeFromLibrary(deleteTarget.absolutePath)}
          onDelete={() => deleteFileToTrash(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {folderDeleteTarget && (
        <ConfirmDeleteModal
          folderMode
          fileName={folderDeleteTarget}
          filePath={`${folder ?? ''}${(folder ?? '').includes('\\') ? '\\' : '/'}${folderDeleteTarget}`}
          folderFileCount={
            filesRef.current.filter((f) => f.relativePath.startsWith(folderDeleteTarget + '/'))
              .length
          }
          onDelete={() => deleteFolder(folderDeleteTarget)}
          onClose={() => setFolderDeleteTarget(null)}
        />
      )}

      {undoHidden && (
        <div className="undo-toast" role="status">
          <span>Removed from library.</span>
          <button type="button" className="link-btn" onClick={undoRemove}>
            Undo
          </button>
        </div>
      )}

      {notice && (
        <div className="undo-toast" role="status">
          <span>{notice}</span>
          <button type="button" className="link-btn" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      {expandedMath && (
        <div
          className="math-modal-backdrop"
          onClick={() => setExpandedMath(null)}
          role="dialog"
          aria-label="Expanded equation"
        >
          <button type="button" className="btn-icon math-modal-close" aria-label="Close">
            ×
          </button>
          <div
            className="math-modal markdown-body"
            // KaTeX output we generated ourselves — safe to inject.
            dangerouslySetInnerHTML={{ __html: expandedMath }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {slidesOpen && current && doc && (
        <SlidesView
          content={doc.content}
          baseDir={doc.baseDir}
          title={currentTitle}
          settings={settings}
          onClose={() => setSlidesOpen(false)}
        />
      )}

      {tasksOpen && (
        <TasksView
          tasks={tasks}
          onToggle={toggleTask}
          onOpen={(abs) => {
            setTasksOpen(false)
            openByPath(abs)
          }}
          onClose={() => setTasksOpen(false)}
        />
      )}

      {settingsViewOpen && (
        <SettingsView
          settings={settings}
          onChange={updateSettings}
          onReset={() => updateSettings(DEFAULT_SETTINGS)}
          initialCategory={settingsCat}
          onClose={() => setSettingsViewOpen(false)}
        />
      )}

      {highlightsOpen && (
        <HighlightsView
          items={allHighlights}
          onOpen={(abs) => {
            setHighlightsOpen(false)
            openByPath(abs)
          }}
          onClose={() => setHighlightsOpen(false)}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        files={files}
        titleFor={titleFor}
        onClose={() => setPaletteOpen(false)}
        onOpen={(abs) => {
          setPaletteOpen(false)
          openByPath(abs)
        }}
      />
      <ShortcutsOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}

export default App
