import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { AiProvider, RepurposeFormat } from '@shared/types'
import { makeComponents, rehypePlugins, remarkPlugins, urlTransform } from '../lib/markdown'
import { runAiOnce, type AiOnceHandle } from '../lib/aiClient'

interface Props {
  docContent: string
  docTitle: string
  provider: AiProvider
  model: string
  baseUrl: string
  onConfigure: () => void
  onOpenInEditor: (content: string, name: string) => void
  onClose: () => void
}

const FORMATS: { id: RepurposeFormat; label: string; desc: string; icon: string }[] = [
  {
    id: 'onepager',
    label: 'Marketing one-pager',
    desc: 'Headline, value props, and a call to action',
    icon: '📣'
  },
  { id: 'blog', label: 'Blog post', desc: 'An engaging, readable article with a hook', icon: '✍️' },
  { id: 'exec', label: 'Executive summary', desc: 'Tight, decision-focused overview', icon: '📋' },
  {
    id: 'slides',
    label: 'Slide deck',
    desc: 'Title slide plus bullet slides, ready to present',
    icon: '▦'
  },
  {
    id: 'lesson',
    label: 'Lesson plan',
    desc: 'Objectives, activities, and review questions',
    icon: '🎓'
  }
]

export function CreatePanel({
  docContent,
  docTitle,
  provider,
  model,
  baseUrl,
  onConfigure,
  onOpenInEditor,
  onClose
}: Props): React.JSX.Element {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [format, setFormat] = useState<RepurposeFormat | null>(null)
  const [output, setOutput] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const handleRef = useRef<AiOnceHandle | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.aiStatus(provider).then((s) => {
      if (!cancelled) setConfigured(s.configured)
    })
    return () => {
      cancelled = true
    }
  }, [provider])

  useEffect(() => () => handleRef.current?.cancel(), [])

  const components = useMemo(
    () =>
      makeComponents(
        '',
        (href) => {
          if (/^https?:/i.test(href)) window.api.openExternal(href)
        },
        () => {},
        true,
        document.documentElement.dataset.theme || 'light'
      ),
    []
  )

  const start = (fmt: RepurposeFormat): void => {
    setFormat(fmt)
    setOutput('')
    setError(null)
    setRunning(true)
    const handle = runAiOnce(
      { action: 'repurpose', repurposeFormat: fmt, provider, model, baseUrl, doc: docContent },
      (full) => setOutput(full)
    )
    handleRef.current = handle
    handle.promise
      .then((r) => {
        setOutput(r.text)
        setRunning(false)
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message)
        setRunning(false)
      })
  }

  const cancel = (): void => {
    handleRef.current?.cancel()
    setRunning(false)
  }

  const fmtMeta = FORMATS.find((f) => f.id === format)
  const suggestedName = `${docTitle || 'Untitled'} — ${fmtMeta?.label ?? 'Repurposed'}`

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="create-panel" role="dialog" aria-label="Create with AI">
        <div className="sv-head">
          <h2>✦ Repurpose document</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {configured === false ? (
          <div className="ai-setup">
            <p className="ai-hint">
              No AI provider is set up yet. Choose a provider and add a key — or point at a local
              Ollama server — in Settings → AI.
            </p>
            <button type="button" className="btn btn-primary" onClick={onConfigure}>
              Open AI settings
            </button>
          </div>
        ) : !format ? (
          <div className="create-body">
            <p className="sv-hint">
              Turn “{docTitle || 'this document'}” into a new piece. The result opens in a new
              editor tab so you can review and save it.
            </p>
            <div className="create-grid">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="create-card"
                  onClick={() => start(f.id)}
                  disabled={configured === null}
                >
                  <span className="create-card-icon">{f.icon}</span>
                  <span className="create-card-label">{f.label}</span>
                  <span className="create-card-desc">{f.desc}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="create-body">
            <div className="create-result-head">
              <span className="create-result-title">
                {fmtMeta?.icon} {fmtMeta?.label}
              </span>
              {running && <span className="create-status">Generating…</span>}
            </div>
            {error ? (
              <p className="ai-error">{error}</p>
            ) : (
              <div className="create-preview markdown-body">
                {output ? (
                  <ReactMarkdown
                    remarkPlugins={remarkPlugins}
                    rehypePlugins={rehypePlugins}
                    urlTransform={urlTransform}
                    components={components}
                  >
                    {output}
                  </ReactMarkdown>
                ) : (
                  <p className="sv-hint">Working…</p>
                )}
              </div>
            )}
            <div className="create-actions">
              {running ? (
                <button type="button" className="btn btn-small" onClick={cancel}>
                  Stop
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!output || !!error}
                    onClick={() => onOpenInEditor(output, suggestedName)}
                  >
                    Open in editor
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => start(format)}>
                    Regenerate
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={!output || !!error}
                    onClick={() => void navigator.clipboard.writeText(output)}
                  >
                    Copy
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => setFormat(null)}>
                    Choose another
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
