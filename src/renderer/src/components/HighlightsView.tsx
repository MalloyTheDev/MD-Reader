import type { Annotation } from '@shared/types'

interface Props {
  items: { fileAbs: string; title: string; annotation: Annotation }[]
  onOpen: (fileAbs: string) => void
  onClose: () => void
}

export function HighlightsView({ items, onOpen, onClose }: Props): React.JSX.Element {
  const byFile = new Map<string, { title: string; anns: Annotation[] }>()
  for (const it of items) {
    const g = byFile.get(it.fileAbs) ?? { title: it.title, anns: [] }
    g.anns.push(it.annotation)
    byFile.set(it.fileAbs, g)
  }
  const groups = [...byFile.entries()].sort((a, b) => a[1].title.localeCompare(b[1].title))

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="tasks-overlay" role="dialog" aria-label="All highlights">
        <div className="tasks-header">
          <h2>Highlights</h2>
          <span className="tasks-summary">
            {items.length} across {groups.length} note{groups.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            aria-label="Close"
            style={{ marginLeft: 'auto' }}
          >
            ×
          </button>
        </div>
        <div className="tasks-body">
          {groups.length === 0 ? (
            <p className="tasks-empty">
              No highlights yet. Select text in the reader to highlight it.
            </p>
          ) : (
            groups.map(([abs, g]) => (
              <section key={abs} className="tasks-group">
                <button type="button" className="tasks-file" onClick={() => onOpen(abs)}>
                  {g.title}
                </button>
                <ul className="hl-list">
                  {[...g.anns]
                    .sort((a, b) => a.start - b.start)
                    .map((a) => (
                      <li key={a.id} className="hl-item">
                        <span className={'hl-dot hl-' + a.color} aria-hidden="true" />
                        <span className="hl-body">
                          <span className="hl-quote">{a.text}</span>
                          {a.note && <span className="hl-note">{a.note}</span>}
                          {a.card && <span className="hl-card">🃏 flashcard</span>}
                        </span>
                      </li>
                    ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </>
  )
}
