import { memo, useState } from 'react'
import type { MarkdownFileMeta, ReadingPosition } from '@shared/types'
import type { LibSearchResult } from '../lib/search'
import type { SortMode } from '../App'
import { Ico } from './Icons'

const NAME_EXT = /\.(md|markdown|mdown|mkd|mdx)$/i

function fallbackTitle(name: string): string {
  return name.replace(NAME_EXT, '').replace(/[-_]+/g, ' ')
}

function baseName(p: string): string {
  return (
    p
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() || p
  )
}

// Deterministic warm-palette spine gradient per file (OKLCH so it sits inside the v2 identity).
function spineStyle(seed: string): React.CSSProperties {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return {
    background: `linear-gradient(135deg, oklch(0.42 0.10 ${h}), oklch(0.32 0.09 ${h}))`
  }
}

interface BookCardProps {
  file: MarkdownFileMeta
  title: string
  progress: number
  isFav: boolean
  folderPath: string | null
  onOpen: (absolutePath: string) => void
  onToggleFavorite: (absolutePath: string) => void
  onRequestDelete: (file: MarkdownFileMeta) => void
}

const BookCard = memo(function BookCard({
  file,
  title,
  progress,
  isFav,
  folderPath,
  onOpen,
  onToggleFavorite,
  onRequestDelete
}: BookCardProps): React.JSX.Element {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100)
  const done = progress >= 0.995
  return (
    <div
      role="button"
      tabIndex={0}
      className={'book2' + (done ? ' read' : '')}
      onClick={() => onOpen(file.absolutePath)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(file.absolutePath)
        }
      }}
      title={file.relativePath}
    >
      <div className="cover2" style={spineStyle(file.name)}>
        <button
          type="button"
          className={'pin' + (isFav ? ' on' : '')}
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite(file.absolutePath)
          }}
          title={isFav ? 'Unfavorite' : 'Favorite'}
          aria-label={isFav ? 'Unfavorite' : 'Favorite'}
        >
          <Ico.bookmark />
        </button>
        <button
          type="button"
          className="pin"
          style={{ right: 36 }}
          onClick={(e) => {
            e.stopPropagation()
            onRequestDelete(file)
          }}
          title="Remove from library or delete file…"
          aria-label="Remove or delete"
        >
          <Ico.more />
        </button>
        <div className="cover2-title">{title}</div>
        {folderPath && <div className="cover2-meta">{folderPath}</div>}
      </div>
      <div>
        <div className="b-title">{title}</div>
        <div className="b-sub">
          <span>{done ? 'Finished' : pct > 0 ? `${pct}% read` : 'Unread'}</span>
          {folderPath && (
            <>
              <span className="dot" />
              <span>{folderPath}</span>
            </>
          )}
        </div>
        <div className="b-bar">
          <i style={{ width: `${Math.max(pct, 3)}%` }} />
        </div>
      </div>
    </div>
  )
})

interface LibraryProps {
  files: MarkdownFileMeta[]
  continueReading: MarkdownFileMeta[]
  titles: Record<string, string>
  positions: Record<string, ReadingPosition>
  query: string
  results: LibSearchResult[]
  hasFolder: boolean
  sortMode: SortMode
  onSortChange: (m: SortMode) => void
  onOpen: (absolutePath: string) => void
  onPickFolder: () => void
  onOpenVault: () => void
  recentFolders: string[]
  onOpenRecent: (path: string) => void
  onCreateFolder: (name: string) => void
  onImportFiles: () => void
  onImportFolder: () => void
  onNewNote: () => void
  onNewFromTemplate: () => void
  onNewCourse: () => void
  onReadme: () => void
  tags: string[]
  activeTag: string | null
  onTagClick: (tag: string) => void
  onOpenGraph: () => void
  hasGraph: boolean
  hasCards: boolean
  dueCount: number
  onReview: () => void
  onExportDeck: () => void
  favorites: string[]
  onToggleFavorite: (absolutePath: string) => void
  onRequestDelete: (file: MarkdownFileMeta) => void
  onDeleteFolder: (folderName: string) => void
  missingCount: number
  onCleanupMissing: () => void
  taskCount: number
  openTaskCount: number
  onOpenTasks: () => void
  highlightCount: number
  onOpenHighlights: () => void
  folders: string[]
  activeFolder: string | null
  onFolderClick: (folder: string) => void
}

export function Library({
  files,
  continueReading,
  titles,
  positions,
  query,
  results,
  hasFolder,
  sortMode,
  onSortChange,
  onOpen,
  onPickFolder,
  onOpenVault,
  recentFolders,
  onOpenRecent,
  onCreateFolder,
  onImportFiles,
  onImportFolder,
  onNewNote,
  onNewFromTemplate,
  onNewCourse,
  onReadme,
  tags,
  activeTag,
  onTagClick,
  onOpenGraph,
  hasGraph,
  hasCards,
  dueCount,
  onReview,
  onExportDeck,
  favorites,
  onToggleFavorite,
  onRequestDelete,
  onDeleteFolder,
  missingCount,
  onCleanupMissing,
  taskCount,
  openTaskCount,
  onOpenTasks,
  highlightCount,
  onOpenHighlights,
  folders,
  activeFolder,
  onFolderClick
}: LibraryProps): React.JSX.Element {
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [recentOpen, setRecentOpen] = useState(false)

  const submitFolder = (): void => {
    const n = folderName.trim()
    if (n) onCreateFolder(n)
    setFolderName('')
    setNewFolderOpen(false)
  }

  const titleOf = (f: MarkdownFileMeta): string => titles[f.absolutePath] || fallbackTitle(f.name)

  const renderBook = (f: MarkdownFileMeta): React.JSX.Element => (
    <BookCard
      key={f.absolutePath}
      file={f}
      title={titleOf(f)}
      progress={positions[f.absolutePath]?.progress ?? 0}
      isFav={favorites.includes(f.absolutePath)}
      folderPath={
        f.relativePath.includes('/') ? f.relativePath.split('/').slice(0, -1).join(' / ') : null
      }
      onOpen={onOpen}
      onToggleFavorite={onToggleFavorite}
      onRequestDelete={onRequestDelete}
    />
  )

  const favoriteFiles = files.filter((f) => favorites.includes(f.absolutePath))

  // ── No folder open: welcome / pick ──────────────────────────────
  if (!hasFolder) {
    return (
      <div className="lib2 fade-in">
        <div className="empty" style={{ marginTop: '12vh' }}>
          <h1 style={{ fontFamily: 'var(--font-read)', fontWeight: 600, marginTop: 0 }}>
            Welcome to MD Reader
          </h1>
          <p>Choose a folder of Markdown files to build your bookshelf.</p>
          <button
            type="button"
            className="btn primary"
            style={{ marginTop: 12 }}
            onClick={onPickFolder}
          >
            <Ico.folder /> Open a folder
          </button>
        </div>
      </div>
    )
  }

  // ── Search results view ─────────────────────────────────────────
  if (query.trim()) {
    return (
      <div className="lib2 fade-in">
        <div className="sec-label">
          <h2>
            {results.length} result{results.length === 1 ? '' : 's'} for &ldquo;{query.trim()}&rdquo;
          </h2>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: -4 }}>
          Filters: <code>tag:</code> <code>title:</code> <code>path:</code> <code>content:</code>{' '}
          <code>has:math|mermaid|chart|table|todo|image|code</code>
        </p>
        {results.length === 0 ? (
          <div className="empty">
            <strong>Nothing matched.</strong> Try a different word or filter.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0' }}>
            {results.map((r) => (
              <li key={r.id} style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => onOpen(r.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: 'var(--surface)',
                    border: '1px solid var(--line-2)',
                    borderRadius: 'var(--r)',
                    padding: '12px 14px',
                    color: 'var(--ink)',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{r.title}</div>
                  <div style={{ color: 'var(--faint)', fontSize: 11.5, marginBottom: 6 }}>
                    {r.relativePath}
                  </div>
                  {r.matches.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {r.matches.map((m, i) => (
                        <span key={i} style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>
                          {m}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>{r.snippet}</div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // ── Empty library (no files and no active filter) ───────────────
  if (files.length === 0 && !activeFolder && !activeTag) {
    return (
      <div className="lib2 fade-in">
        <div className="empty" style={{ marginTop: '10vh' }}>
          <h1 style={{ fontFamily: 'var(--font-read)', fontWeight: 600, marginTop: 0 }}>
            No Markdown files here
          </h1>
          <p>This folder has no .md files yet. Create a note, import some, or open another folder.</p>
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              justifyContent: 'center',
              marginTop: 14
            }}
          >
            {recentFolders.length > 0 && (
              <button
                type="button"
                className="btn primary"
                onClick={() => onOpenRecent(recentFolders[0])}
                title={recentFolders[0]}
              >
                <Ico.arrLeft /> Back to {baseName(recentFolders[0])}
              </button>
            )}
            <button type="button" className="btn" onClick={onNewNote}>
              <Ico.plus /> New note
            </button>
            <button type="button" className="btn" onClick={onNewFromTemplate}>
              <Ico.layers /> New from template
            </button>
            <button type="button" className="btn" onClick={onPickFolder}>
              <Ico.folder /> Open another folder
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main library ────────────────────────────────────────────────
  return (
    <div className="lib2 fade-in">
      {missingCount > 0 && (
        <div
          className="empty"
          style={{
            padding: '10px 14px',
            textAlign: 'left',
            borderColor: 'color-mix(in oklch, var(--warn) 35%, var(--line))',
            background: 'color-mix(in oklch, var(--warn) 12%, var(--surface))',
            color: 'var(--warn)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            margin: '0 0 14px'
          }}
        >
          <span>
            ⚠ {missingCount} referenced file{missingCount === 1 ? '' : 's'} no longer on disk.
          </span>
          <button
            type="button"
            className="btn"
            style={{ height: 26, padding: '0 10px', marginLeft: 'auto' }}
            onClick={onCleanupMissing}
          >
            Clean up
          </button>
        </div>
      )}

      {tags.length > 0 && (
        <div className="chips">
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              className={'chip' + (activeTag === t ? ' on' : '')}
              onClick={() => onTagClick(t)}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {folders.length > 0 && (
        <div className="chips" style={{ marginTop: tags.length ? -12 : undefined }}>
          <button
            type="button"
            className={'chip' + (!activeFolder ? ' on' : '')}
            onClick={() => activeFolder && onFolderClick(activeFolder)}
          >
            All folders
          </button>
          {folders.map((f) => (
            <button
              key={f}
              type="button"
              className={'chip' + (activeFolder === f ? ' on' : '')}
              onClick={() => onFolderClick(f)}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {activeFolder && (
        <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 14px' }}>
          Folder <strong style={{ color: 'var(--ink)' }}>{activeFolder}</strong> &middot;{' '}
          <button
            type="button"
            className="link-btn"
            style={{ background: 'none', border: 'none', color: 'var(--accent-ink)', cursor: 'pointer', padding: 0 }}
            onClick={() => onFolderClick(activeFolder)}
          >
            All books
          </button>{' '}
          &middot;{' '}
          <button
            type="button"
            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0 }}
            onClick={() => onDeleteFolder(activeFolder)}
          >
            Delete folder
          </button>
        </p>
      )}

      {activeTag && (
        <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 14px' }}>
          Showing notes tagged <strong style={{ color: 'var(--ink)' }}>#{activeTag}</strong>{' '}
          &middot;{' '}
          <button
            type="button"
            style={{ background: 'none', border: 'none', color: 'var(--accent-ink)', cursor: 'pointer', padding: 0 }}
            onClick={() => onTagClick(activeTag)}
          >
            clear
          </button>
        </p>
      )}

      {!activeTag && !activeFolder && favoriteFiles.length > 0 && (
        <>
          <div className="sec-label">
            <h2>
              Favorites <span className="count">&middot; {favoriteFiles.length}</span>
            </h2>
          </div>
          <div className="cont2">{favoriteFiles.map(renderBook)}</div>
        </>
      )}

      {!activeTag && !activeFolder && continueReading.length > 0 && (
        <>
          <div className="sec-label">
            <h2>
              Continue reading <span className="count">&middot; {continueReading.length}</span>
            </h2>
          </div>
          <div className="cont2">{continueReading.map(renderBook)}</div>
        </>
      )}

      <div className="all-bar">
        <h2>
          All books{' '}
          <span className="count">
            &middot; {files.length} file{files.length === 1 ? '' : 's'}
          </span>
        </h2>
        <div className="all-actions">
          {hasCards && (
            <button type="button" className="act" onClick={onReview}>
              <Ico.card /> Review
              {dueCount > 0 && <span className="badge">({dueCount})</span>}
            </button>
          )}
          {hasCards && (
            <button type="button" className="act" onClick={onExportDeck}>
              <Ico.download /> Export deck
            </button>
          )}
          {hasGraph && (
            <button type="button" className="act" onClick={onOpenGraph}>
              <Ico.graph /> Graph
            </button>
          )}
          {taskCount > 0 && (
            <button type="button" className="act" onClick={onOpenTasks}>
              <Ico.check /> Tasks
              {openTaskCount > 0 && <span className="badge">({openTaskCount})</span>}
            </button>
          )}
          {highlightCount > 0 && (
            <button type="button" className="act" onClick={onOpenHighlights}>
              <Ico.highlight /> Highlights <span className="badge">({highlightCount})</span>
            </button>
          )}
          <button
            type="button"
            className="act"
            onClick={onOpenVault}
            title="Open your MD Reader vault (Documents/MD Reader)"
          >
            <Ico.shelf /> Vault
          </button>
          <div className="recent-wrap" style={{ position: 'relative' }}>
            <button
              type="button"
              className="act"
              onClick={() => setRecentOpen((o) => !o)}
              title="Open another folder, or switch back to a recent one"
            >
              <Ico.folder /> Folders <span className="caret">▾</span>
            </button>
            {recentOpen && (
              <>
                <div
                  className="menu-backdrop"
                  style={{ position: 'fixed', inset: 0, zIndex: 39 }}
                  onClick={() => setRecentOpen(false)}
                  aria-hidden="true"
                />
                <div className="folder-menu" style={{ right: 'auto', top: 36 }}>
                  <div className="folder-menu-h">Open</div>
                  <button
                    type="button"
                    className="folder-item"
                    onClick={() => {
                      setRecentOpen(false)
                      onPickFolder()
                    }}
                  >
                    <Ico.folder className="icon" /> Open another folder…
                  </button>
                  {recentFolders.length > 0 && (
                    <>
                      <div className="folder-divider" aria-hidden="true" />
                      <div className="folder-menu-h">Recent</div>
                      {recentFolders.map((p) => (
                        <button
                          key={p}
                          type="button"
                          className="folder-item"
                          title={p}
                          onClick={() => {
                            setRecentOpen(false)
                            onOpenRecent(p)
                          }}
                        >
                          <Ico.folder className="icon" /> {baseName(p)}
                        </button>
                      ))}
                    </>
                  )}
                  {recentFolders.length === 0 && (
                    <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--faint)' }}>
                      No other folders yet - open one above and it&apos;ll appear here.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          {hasFolder &&
            (newFolderOpen ? (
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <input
                  className="lang-row"
                  value={folderName}
                  placeholder="Folder name"
                  autoFocus
                  spellCheck={false}
                  onChange={(e) => setFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitFolder()
                    else if (e.key === 'Escape') {
                      setFolderName('')
                      setNewFolderOpen(false)
                    }
                  }}
                  style={{
                    height: 30,
                    padding: '0 10px',
                    borderRadius: 8,
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                    fontFamily: 'var(--font-ui)',
                    fontSize: 12.5,
                    color: 'var(--ink)',
                    outline: 'none'
                  }}
                />
                <button type="button" className="act primary" onClick={submitFolder}>
                  Create
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="act"
                onClick={() => setNewFolderOpen(true)}
                title="Create a new collection folder"
              >
                <Ico.plus /> New folder
              </button>
            ))}
          {hasFolder && (
            <div className="import-wrap" style={{ position: 'relative' }}>
              <button
                type="button"
                className="act"
                onClick={() => setImportOpen((o) => !o)}
                title="Import existing Markdown into your vault"
              >
                <Ico.download /> Import <span className="caret">▾</span>
              </button>
              {importOpen && (
                <>
                  <div
                    className="menu-backdrop"
                    style={{ position: 'fixed', inset: 0, zIndex: 39 }}
                    onClick={() => setImportOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="folder-menu" style={{ right: 'auto', top: 36, width: 220 }}>
                    <button
                      type="button"
                      className="folder-item"
                      onClick={() => {
                        setImportOpen(false)
                        onImportFiles()
                      }}
                    >
                      <Ico.download className="icon" /> Markdown files…
                    </button>
                    <button
                      type="button"
                      className="folder-item"
                      onClick={() => {
                        setImportOpen(false)
                        onImportFolder()
                      }}
                    >
                      <Ico.folder className="icon" /> A folder…
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {hasFolder && (
            <button
              type="button"
              className="act"
              onClick={onNewCourse}
              title="Generate a course from a topic with AI"
            >
              <Ico.sparkle /> New course
            </button>
          )}
          {hasFolder && (
            <button
              type="button"
              className="act"
              onClick={onReadme}
              title="Generate a README by studying a project's source code"
            >
              <Ico.sparkle /> README
            </button>
          )}
          <button type="button" className="act primary" onClick={onNewNote}>
            <Ico.plus /> New note
          </button>
          <button
            type="button"
            className="act"
            onClick={onNewFromTemplate}
            title="Start a new note from a template"
          >
            <Ico.layers /> Template
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
            <span
              style={{
                fontSize: 11,
                color: 'var(--faint)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                fontWeight: 600
              }}
            >
              Sort
            </span>
            <select
              className="sort-select"
              value={sortMode}
              onChange={(e) => onSortChange(e.target.value as SortMode)}
            >
              <option value="name">Title</option>
              <option value="modified">Recently modified</option>
              <option value="recent">Recently read</option>
            </select>
          </div>
        </div>
      </div>

      <div className="shelf2">
        {files.map(renderBook)}
        {files.length === 0 && (
          <div className="empty">
            <strong>No matches.</strong> Try clearing the filter.
          </div>
        )}
      </div>
    </div>
  )
}
