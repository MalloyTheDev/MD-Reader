import { useEffect, useMemo, useRef, useState } from 'react'
import type { MarkdownFileMeta } from '@shared/types'

interface Props {
  open: boolean
  files: MarkdownFileMeta[]
  titleFor: (m: MarkdownFileMeta) => string
  onClose: () => void
  onOpen: (abs: string) => void
}

export function CommandPalette({
  open,
  files,
  titleFor,
  onClose,
  onOpen
}: Props): React.JSX.Element | null {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
      const t = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
    return undefined
  }, [open])

  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    return files
      .map((f) => ({ f, title: titleFor(f) }))
      .filter(({ f, title }) =>
        !query ? true : (title + ' ' + f.relativePath).toLowerCase().includes(query)
      )
      .slice(0, 50)
  }, [q, files, titleFor])

  useEffect(() => {
    setSel(0)
  }, [q])

  if (!open) return null

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(results.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const r = results[sel]
      if (r) onOpen(r.f.absolutePath)
    }
  }

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Jump to a file…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          spellCheck={false}
        />
        <ul className="palette-list">
          {results.length === 0 ? (
            <li className="palette-empty">No matches</li>
          ) : (
            results.map((r, i) => (
              <li key={r.f.absolutePath}>
                <button
                  type="button"
                  className={'palette-item' + (i === sel ? ' is-sel' : '')}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => onOpen(r.f.absolutePath)}
                >
                  <span className="palette-title">{r.title}</span>
                  <span className="palette-path">{r.f.relativePath}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
