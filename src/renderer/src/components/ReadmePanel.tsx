import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { AiProvider } from '@shared/types'
import { makeComponents, rehypePlugins, remarkPlugins, urlTransform } from '../lib/markdown'
import { runAiOnce, type AiOnceHandle } from '../lib/aiClient'

interface Props {
  provider: AiProvider
  model: string
  baseUrl: string
  onConfigure: () => void
  onOpenInEditor: (content: string, name: string) => void
  onClose: () => void
}

export function ReadmePanel({
  provider,
  model,
  baseUrl,
  onConfigure,
  onOpenInEditor,
  onClose
}: Props): React.JSX.Element {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [projectName, setProjectName] = useState<string | null>(null)
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

  const generate = async (): Promise<void> => {
    setError(null)
    const project = await window.api.digestProject().catch(() => null)
    if (!project) return // user cancelled the folder picker
    if (!project.digest) {
      setProjectName(project.name)
      setError('No source files found in that folder.')
      return
    }
    setProjectName(project.name)
    setOutput('')
    setRunning(true)
    const handle = runAiOnce(
      { action: 'readme', provider, model, baseUrl, doc: project.digest },
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

  const stop = (): void => {
    handleRef.current?.cancel()
    setRunning(false)
  }

  return (
    <>
      <div className="panel-backdrop" onClick={running ? undefined : onClose} aria-hidden="true" />
      <div className="create-panel" role="dialog" aria-label="Generate README from code">
        <div className="sv-head">
          <h2>✦ README from code</h2>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            disabled={running}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {configured === false ? (
          <div className="ai-setup">
            <p className="ai-hint">
              No AI provider is set up yet. Choose a provider and add a key - or point at a local
              Ollama server - in Settings → AI.
            </p>
            <button type="button" className="btn btn-primary" onClick={onConfigure}>
              Open AI settings
            </button>
          </div>
        ) : (
          <div className="create-body">
            {!projectName && !running ? (
              <>
                <p className="sv-hint">
                  Pick a project folder and AI will study its source code (skipping
                  node_modules/build output) and write a README.md you can review and save.
                </p>
                <div className="create-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={configured === null}
                    onClick={() => void generate()}
                  >
                    Choose project folder…
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="create-result-head">
                  <span className="create-result-title">README · {projectName}</span>
                  {running && <span className="create-status">Reading code &amp; writing…</span>}
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
                    <button type="button" className="btn btn-small" onClick={stop}>
                      Stop
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!output || !!error}
                        onClick={() => onOpenInEditor(output, `${projectName ?? 'Project'} README`)}
                      >
                        Open in editor
                      </button>
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={() => void generate()}
                      >
                        Pick another…
                      </button>
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={!output || !!error}
                        onClick={() => void navigator.clipboard.writeText(output)}
                      >
                        Copy
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
