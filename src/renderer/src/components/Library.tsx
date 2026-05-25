import { memo, useState } from 'react'
import type { MarkdownFileMeta, ReadingPosition } from '@shared/types'
import type { LibSearchResult } from '../lib/search'
import type { SortMode } from '../App'

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

function coverHue(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return h
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

// Memoized so re-rendering the library (sort, filter, a single favorite toggle)
// only re-renders the cards whose props actually changed.
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
  const hue = coverHue(file.name)
  return (
    <div
      role="button"
      tabIndex={0}
      className="book"
      onClick={() => onOpen(file.absolutePath)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(file.absolutePath)
        }
      }}
      title={file.relativePath}
      style={
        {
          '--cover-a': `hsl(${hue} 45% 42%)`,
          '--cover-b': `hsl(${(hue + 28) % 360} 50% 30%)`
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        className={'fav-star' + (isFav ? ' is-fav' : '')}
        onClick={(e) => {
          e.stopPropagation()
          onToggleFavorite(file.absolutePath)
        }}
        title={isFav ? 'Unfavorite' : 'Favorite'}
      >
        {isFav ? '★' : '☆'}
      </button>
      <button
        type="button"
        className="book-menu"
        onClick={(e) => {
          e.stopPropagation()
          onRequestDelete(file)
        }}
        title="Remove from library or delete file…"
        aria-label="Remove or delete"
      >
        ⋯
      </button>
      <span className="book-cover">
        <span className="book-cover-title">{title}</span>
        {progress > 0.01 && (
          <span className="cover-progress">
            <span style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </span>
        )}
      </span>
      <span className="book-label">{title}</span>
      {progress > 0.01 ? (
        <span className="book-pct">{Math.round(progress * 100)}% read</span>
      ) : (
        folderPath && <span className="book-folder">{folderPath}</span>
      )}
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

  if (!hasFolder) {
    return (
      <div className="empty-state">
        <div className="empty-emoji">📚</div>
        <h1>Welcome to MD Reader</h1>
        <p>Choose a folder of Markdown files to build your bookshelf.</p>
        <button type="button" className="btn btn-primary" onClick={onPickFolder}>
          Open a folder
        </button>
      </div>
    )
  }

  if (query.trim()) {
    return (
      <div className="library">
        <h2 className="library-heading">
          {results.length} result{results.length === 1 ? '' : 's'} for “{query.trim()}”
        </h2>
        <p className="search-help">
          Filters: <code>tag:</code> <code>title:</code> <code>path:</code> <code>content:</code>{' '}
          <code>has:math|mermaid|chart|table|todo|image|code</code>
        </p>
        {results.length === 0 ? (
          <p className="library-empty">Nothing matched. Try a different word or filter.</p>
        ) : (
          <ul className="result-list">
            {results.map((r) => (
              <li key={r.id}>
                <button type="button" className="result-item" onClick={() => onOpen(r.id)}>
                  <span className="result-title">{r.title}</span>
                  <span className="result-path">{r.relativePath}</span>
                  {r.matches.length > 0 ? (
                    <span className="result-lines">
                      {r.matches.map((m, i) => (
                        <span key={i} className="result-line">
                          {m}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="result-snippet">{r.snippet}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // Only show the whole-library empty state when nothing is filtered — otherwise an empty
  // tag/folder filter would strand the user with no folder bar / no way back.
  if (files.length === 0 && !activeFolder && !activeTag) {
    return (
      <div className="empty-state">
        <div className="empty-emoji">🗂️</div>
        <h1>No Markdown files here</h1>
        <p>This folder has no .md files yet. Create a note, import some, or open another folder.</p>
        <div className="empty-actions">
          {recentFolders.length > 0 && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onOpenRecent(recentFolders[0])}
              title={recentFolders[0]}
            >
              ↩ Back to {baseName(recentFolders[0])}
            </button>
          )}
          <button type="button" className="btn" onClick={onNewNote}>
            + New note
          </button>
          <button type="button" className="btn" onClick={onNewFromTemplate}>
            📄 New from template
          </button>
          <button type="button" className="btn" onClick={onPickFolder}>
            Open another folder
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="library">
      {missingCount > 0 && (
        <div className="missing-banner">
          <span>
            ⚠ {missingCount} referenced file{missingCount === 1 ? '' : 's'} no longer on disk.
          </span>
          <button type="button" className="link-btn" onClick={onCleanupMissing}>
            Clean up
          </button>
        </div>
      )}
      {tags.length > 0 && (
        <div className="tag-bar">
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              className={'tag-chip' + (activeTag === t ? ' is-active' : '')}
              onClick={() => onTagClick(t)}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {folders.length > 0 && (
        <div className="tag-bar folder-bar">
          <button
            type="button"
            className={'tag-chip' + (!activeFolder ? ' is-active' : '')}
            onClick={() => activeFolder && onFolderClick(activeFolder)}
          >
            ⌂ All
          </button>
          {folders.map((f) => (
            <button
              key={f}
              type="button"
              className={'tag-chip' + (activeFolder === f ? ' is-active' : '')}
              onClick={() => onFolderClick(f)}
            >
              🗂 {f}
            </button>
          ))}
        </div>
      )}

      {activeFolder && (
        <p className="filter-note">
          📂 Folder <strong>{activeFolder}</strong> ·{' '}
          <button type="button" className="link-btn" onClick={() => onFolderClick(activeFolder)}>
            ← All books
          </button>{' '}
          ·{' '}
          <button
            type="button"
            className="link-btn link-danger"
            onClick={() => onDeleteFolder(activeFolder)}
          >
            Delete folder
          </button>
        </p>
      )}

      {activeTag && (
        <p className="filter-note">
          Showing notes tagged <strong>#{activeTag}</strong> ·{' '}
          <button type="button" className="link-btn" onClick={() => onTagClick(activeTag)}>
            clear
          </button>
        </p>
      )}

      {!activeTag && !activeFolder && favoriteFiles.length > 0 && (
        <section className="shelf-section">
          <h2 className="library-heading">★ Favorites</h2>
          <div className="shelf">{favoriteFiles.map(renderBook)}</div>
        </section>
      )}

      {!activeTag && !activeFolder && continueReading.length > 0 && (
        <section className="shelf-section">
          <h2 className="library-heading">Continue reading</h2>
          <div className="shelf">{continueReading.map(renderBook)}</div>
        </section>
      )}

      <section className="shelf-section">
        <div className="shelf-header">
          <h2 className="library-heading">
            All books · {files.length} file{files.length === 1 ? '' : 's'}
          </h2>
          <div className="shelf-actions">
            {hasCards && (
              <button type="button" className="btn btn-small" onClick={onReview}>
                🃏 Review{dueCount > 0 ? ` (${dueCount})` : ''}
              </button>
            )}
            {hasCards && (
              <button type="button" className="btn btn-small" onClick={onExportDeck}>
                Export deck
              </button>
            )}
            {hasGraph && (
              <button type="button" className="btn btn-small" onClick={onOpenGraph}>
                ◉ Graph
              </button>
            )}
            {taskCount > 0 && (
              <button type="button" className="btn btn-small" onClick={onOpenTasks}>
                ✓ Tasks{openTaskCount > 0 ? ` (${openTaskCount})` : ''}
              </button>
            )}
            {highlightCount > 0 && (
              <button type="button" className="btn btn-small" onClick={onOpenHighlights}>
                🖍 Highlights ({highlightCount})
              </button>
            )}
            <button
              type="button"
              className="btn btn-small"
              onClick={onOpenVault}
              title="Open your MD Reader vault (Documents/MD Reader)"
            >
              ⌂ Vault
            </button>
            <div className="recent-wrap">
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setRecentOpen((o) => !o)}
                title="Open another folder, or switch back to a recent one"
              >
                📂 Folders ▾
              </button>
              {recentOpen && (
                <>
                  <div
                    className="menu-backdrop"
                    onClick={() => setRecentOpen(false)}
                    aria-hidden="true"
                  />
                  <ul className="recent-menu">
                    <li>
                      <button
                        type="button"
                        className="recent-item"
                        onClick={() => {
                          setRecentOpen(false)
                          onPickFolder()
                        }}
                      >
                        <span className="recent-name">📂 Open another folder…</span>
                        <span className="recent-path">
                          Browse your computer for a folder of notes
                        </span>
                      </button>
                    </li>
                    {recentFolders.length > 0 && (
                      <li className="recent-divider" aria-hidden="true" />
                    )}
                    {recentFolders.map((p) => (
                      <li key={p}>
                        <button
                          type="button"
                          className="recent-item"
                          title={p}
                          onClick={() => {
                            setRecentOpen(false)
                            onOpenRecent(p)
                          }}
                        >
                          <span className="recent-name">📁 {baseName(p)}</span>
                          <span className="recent-path">{p}</span>
                        </button>
                      </li>
                    ))}
                    {recentFolders.length === 0 && (
                      <li>
                        <span className="recent-empty">
                          No other folders yet — open one above and it’ll appear here.
                        </span>
                      </li>
                    )}
                  </ul>
                </>
              )}
            </div>
            {hasFolder &&
              (newFolderOpen ? (
                <span className="newfolder-inline">
                  <input
                    className="newfolder-input"
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
                  />
                  <button type="button" className="btn btn-small" onClick={submitFolder}>
                    Create
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => setNewFolderOpen(true)}
                  title="Create a new collection folder"
                >
                  + New folder
                </button>
              ))}
            {hasFolder && (
              <span className="import-wrap">
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => setImportOpen((o) => !o)}
                  title="Import existing Markdown into your vault"
                >
                  ⬇ Import ▾
                </button>
                {importOpen && (
                  <>
                    <div
                      className="menu-backdrop"
                      onClick={() => setImportOpen(false)}
                      aria-hidden="true"
                    />
                    <div className="import-menu">
                      <button
                        type="button"
                        onClick={() => {
                          setImportOpen(false)
                          onImportFiles()
                        }}
                      >
                        Markdown files…
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setImportOpen(false)
                          onImportFolder()
                        }}
                      >
                        A folder…
                      </button>
                    </div>
                  </>
                )}
              </span>
            )}
            {hasFolder && (
              <button
                type="button"
                className="btn btn-small"
                onClick={onNewCourse}
                title="Generate a course from a topic with AI"
              >
                ✦ New course
              </button>
            )}
            {hasFolder && (
              <button
                type="button"
                className="btn btn-small"
                onClick={onReadme}
                title="Generate a README by studying a project's source code"
              >
                ✦ README
              </button>
            )}
            <button type="button" className="btn btn-small" onClick={onNewNote}>
              + New note
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={onNewFromTemplate}
              title="Start a new note from a template"
            >
              📄 Template
            </button>
            <label className="sort-control">
              Sort
              <select value={sortMode} onChange={(e) => onSortChange(e.target.value as SortMode)}>
                <option value="name">Title</option>
                <option value="modified">Recently modified</option>
                <option value="recent">Recently read</option>
              </select>
            </label>
          </div>
        </div>
        <div className="shelf">{files.map(renderBook)}</div>
      </section>
    </div>
  )
}
