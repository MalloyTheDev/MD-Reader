import { useEffect } from 'react'
import type { DocStats } from '../lib/docinfo'

interface Props {
  title: string
  stats: DocStats
  brokenLinks: string[]
  onClose: () => void
}

const TILES: { key: keyof DocStats; label: string; icon: string }[] = [
  { key: 'words', label: 'Words', icon: '✍️' },
  { key: 'readingMin', label: 'Min read', icon: '⏱️' },
  { key: 'headings', label: 'Headings', icon: '🔖' },
  { key: 'equations', label: 'Equations', icon: '🧮' },
  { key: 'diagrams', label: 'Diagrams', icon: '📊' },
  { key: 'charts', label: 'Charts', icon: '📈' },
  { key: 'codeBlocks', label: 'Code blocks', icon: '💻' },
  { key: 'tables', label: 'Tables', icon: '🗒️' },
  { key: 'images', label: 'Images', icon: '🖼️' },
  { key: 'links', label: 'Links', icon: '🔗' },
  { key: 'wikiLinks', label: 'Wiki-links', icon: '🔵' },
  { key: 'embeds', label: 'Embeds', icon: '📎' }
]

export function DocInfoPanel({ title, stats, brokenLinks, onClose }: Props): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const taskPct =
    stats.tasksTotal > 0 ? Math.round((stats.tasksDone / stats.tasksTotal) * 100) : 0

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="docinfo-modal" role="dialog" aria-label="Document info">
        <div className="template-head">
          <h2 className="confirm-title">Document info</h2>
          <button type="button" className="template-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="template-sub" title={title}>
          {title}
        </p>

        <div className="docinfo-grid">
          {TILES.map((t) => (
            <div key={t.key} className="docinfo-tile">
              <span className="docinfo-icon" aria-hidden="true">
                {t.icon}
              </span>
              <span className="docinfo-value">{stats[t.key]}</span>
              <span className="docinfo-label">{t.label}</span>
            </div>
          ))}
          <div className="docinfo-tile">
            <span className="docinfo-icon" aria-hidden="true">
              ☑️
            </span>
            <span className="docinfo-value">
              {stats.tasksDone}/{stats.tasksTotal}
            </span>
            <span className="docinfo-label">Tasks {stats.tasksTotal > 0 ? `(${taskPct}%)` : ''}</span>
          </div>
        </div>

        <div className="docinfo-health">
          <h3 className="docinfo-health-title">Health</h3>
          {brokenLinks.length === 0 ? (
            <p className="docinfo-ok">✓ No broken wiki-links found.</p>
          ) : (
            <>
              <p className="docinfo-warn">
                ⚠ {brokenLinks.length} wiki-link{brokenLinks.length === 1 ? '' : 's'} point to a note
                that doesn’t exist:
              </p>
              <ul className="docinfo-broken">
                {brokenLinks.map((b) => (
                  <li key={b}>
                    <code>[[{b}]]</code>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </>
  )
}
