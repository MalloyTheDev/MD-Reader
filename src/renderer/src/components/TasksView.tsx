import { useMemo, useState } from 'react'
import type { TaskItem } from '../lib/tasks'

interface TasksViewProps {
  tasks: TaskItem[]
  onToggle: (task: TaskItem) => void
  onOpen: (fileAbs: string) => void
  onClose: () => void
}

type Filter = 'open' | 'done' | 'all'

export function TasksView({ tasks, onToggle, onOpen, onClose }: TasksViewProps): React.JSX.Element {
  const [filter, setFilter] = useState<Filter>('open')

  const total = tasks.length
  const done = tasks.filter((t) => t.checked).length

  const groups = useMemo(() => {
    const filtered = tasks.filter((t) =>
      filter === 'all' ? true : filter === 'done' ? t.checked : !t.checked
    )
    const byFile = new Map<string, { title: string; items: TaskItem[] }>()
    for (const t of filtered) {
      const g = byFile.get(t.fileAbs) ?? { title: t.title, items: [] }
      g.items.push(t)
      byFile.set(t.fileAbs, g)
    }
    return [...byFile.entries()].sort((a, b) => a[1].title.localeCompare(b[1].title))
  }, [tasks, filter])

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="tasks-overlay" role="dialog" aria-label="Tasks dashboard">
        <div className="tasks-header">
          <h2>Tasks</h2>
          <span className="tasks-summary">
            {done} / {total} done
          </span>
          <div className="seg tasks-filter">
            {(
              [
                ['open', 'Open'],
                ['done', 'Done'],
                ['all', 'All']
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                className={'seg-btn' + (filter === k ? ' is-active' : '')}
                onClick={() => setFilter(k)}
              >
                {l}
              </button>
            ))}
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="tasks-body">
          {groups.length === 0 ? (
            <p className="tasks-empty">
              {total === 0
                ? 'No checkboxes found. Add "- [ ] something" to any note.'
                : 'Nothing here — try a different filter.'}
            </p>
          ) : (
            groups.map(([fileAbs, g]) => (
              <section key={fileAbs} className="tasks-group">
                <button type="button" className="tasks-file" onClick={() => onOpen(fileAbs)}>
                  {g.title}
                </button>
                <ul className="tasks-list">
                  {g.items.map((t) => (
                    <li key={t.index} className={'task-row' + (t.checked ? ' is-done' : '')}>
                      <label className="task-check">
                        <input type="checkbox" checked={t.checked} onChange={() => onToggle(t)} />
                        <span className="task-text">{t.text}</span>
                      </label>
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
