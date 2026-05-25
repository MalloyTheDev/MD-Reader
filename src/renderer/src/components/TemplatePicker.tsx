import { useEffect } from 'react'
import { TEMPLATE_CATEGORIES, templatesByCategory, type DocTemplate } from '../lib/templates'

interface Props {
  onChoose: (t: DocTemplate) => void
  onClose: () => void
}

export function TemplatePicker({ onChoose, onClose }: Props): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="template-modal" role="dialog" aria-label="New from template">
        <div className="template-head">
          <h2 className="confirm-title">New from template</h2>
          <button type="button" className="template-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="template-sub">
          Pick a starting point - it opens in the editor, ready to fill in.
        </p>
        <div className="template-scroll">
          {TEMPLATE_CATEGORIES.map((cat) => (
            <section key={cat} className="template-cat">
              <h3 className="template-cat-title">{cat}</h3>
              <div className="template-grid">
                {templatesByCategory(cat).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="template-card"
                    onClick={() => onChoose(t)}
                    title={t.description}
                  >
                    <span className="template-icon" aria-hidden="true">
                      {t.icon}
                    </span>
                    <span className="template-label">{t.label}</span>
                    <span className="template-desc">{t.description}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
