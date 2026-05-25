interface Props {
  open: boolean
  onClose: () => void
}

const SHORTCUTS: [string, string][] = [
  ['→  ·  Page Down  ·  Space', 'Next page'],
  ['←  ·  Page Up', 'Previous page'],
  ['Home  ·  End', 'First / last page'],
  ['Ctrl / ⌘ + P', 'Quick-open a file'],
  ['Search box', 'Find in page / search the library'],
  ['☰', 'Table of contents'],
  ['▦', 'Present as slides ( --- splits slides )'],
  ['🏷', 'Bookmark the current page'],
  ['Aa', 'Theme, font size, width, two-page'],
  ['⎙', 'Print / Save as PDF'],
  ['Editor: / ', 'Slash menu — insert headings, tables, code, diagrams'],
  ['Editor: Ctrl / ⌘ + H', 'Find & replace'],
  ['Editor: paste / drop image', 'Saves into the library and links it'],
  ['?', 'Show this help'],
  ['Esc', 'Close overlays']
]

export function ShortcutsOverlay({ open, onClose }: Props): React.JSX.Element | null {
  if (!open) return null
  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="shortcuts" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard &amp; shortcuts</h2>
        <dl className="sc-list">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="sc-row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
