export interface TocItem {
  id: string
  level: number
  text: string
}

interface TocProps {
  items: TocItem[]
  activeId: string | null
  onSelect: (id: string) => void
  backlinks: { id: string; title: string }[]
  onOpenBacklink: (absolutePath: string) => void
}

export function Toc({
  items,
  activeId,
  onSelect,
  backlinks,
  onOpenBacklink
}: TocProps): React.JSX.Element {
  return (
    <nav className="toc" aria-label="Table of contents">
      <div className="toc-title">Contents</div>
      {items.length === 0 ? (
        <p className="toc-empty">No headings in this document.</p>
      ) : (
        <ul className="toc-list">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                className={
                  'toc-item toc-level-' + it.level + (it.id === activeId ? ' is-active' : '')
                }
                onClick={() => onSelect(it.id)}
                title={it.text}
              >
                {it.text}
              </button>
            </li>
          ))}
        </ul>
      )}

      {backlinks.length > 0 && (
        <>
          <div className="toc-title toc-backlinks-title">Linked from ({backlinks.length})</div>
          <ul className="toc-list">
            {backlinks.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className="toc-item backlink-item"
                  onClick={() => onOpenBacklink(b.id)}
                  title={b.title}
                >
                  ↩ {b.title}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </nav>
  )
}
