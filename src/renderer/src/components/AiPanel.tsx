import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type {
  AiAction,
  AiEvent,
  AiProvider,
  AiStatus,
  AiTurn,
  AiUsage,
  DiagramKind
} from '@shared/types'
import { makeComponents, rehypePlugins, remarkPlugins, urlTransform } from '../lib/markdown'

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

interface Card {
  q: string
  a: string
}

interface Turn {
  role: 'user' | 'assistant'
  text: string
  cards?: Card[]
  usage?: AiUsage
}

function parseCards(text: string): Card[] | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
  try {
    const data = JSON.parse(cleaned)
    if (
      Array.isArray(data) &&
      data.every((c) => c && typeof c.q === 'string' && typeof c.a === 'string')
    ) {
      return data as Card[]
    }
  } catch {
    /* not valid JSON */
  }
  return null
}

function strictInstruction(
  action: AiAction,
  question: string,
  selection: string,
  titles: string[],
  diagramKind?: DiagramKind
): string {
  switch (action) {
    case 'summarize':
      return 'Summarize the document above in a few clear paragraphs, then list the key takeaways as concise bullet points.'
    case 'explain':
      return `Explain the following excerpt in simple, clear terms. Define any jargon.\n\n"""${selection}"""`
    case 'flashcards':
      return 'Create 6-10 study flashcards from the document above. Respond with ONLY a JSON array of objects shaped {"q": "question", "a": "answer"} - no prose, no code fences.'
    case 'studyguide':
      return 'Create a structured study guide for the document above: key concepts, definitions, and a few review questions. Use Markdown headings and bullet points.'
    case 'quiz':
      return 'Write a 5-question quiz based on the document above (mix of multiple-choice and short-answer), then an answer key at the end. Use Markdown.'
    case 'suggestlinks':
      return `From the document above, suggest cross-links to related notes. Available note titles: ${titles.join(' | ')}. Recommend 3-8 as a Markdown list, each "[[Title]] - one-line reason". Only use titles from the list.`
    case 'keyterms':
      return 'Extract the key terms and vocabulary from the document above. Return a Markdown list where each item is "**term** - a concise definition".'
    case 'eli5':
      return 'Explain the document above simply, as if to a curious beginner (ELI5). Use short paragraphs, plain language, and a helpful analogy where it fits.'
    case 'critique':
      return 'Critically analyze the document above. Cover its key claims, possible weaknesses or counter-arguments, and open questions. Use Markdown bullet points grouped under short headings.'
    case 'tasks':
      return 'Extract every action item, task, decision, and follow-up from the document above. Return a Markdown checklist using "- [ ] " for each open item, grouped under short "## " headings (for example Action items, Decisions, Open questions) where it helps. If there are none, say so briefly.'
    case 'diagram':
      return diagramKind === 'table'
        ? 'Turn the key information in the document above into a clear Markdown table. Choose sensible columns, include a header row, and keep cells concise. Output only the table.'
        : 'Create a Mermaid diagram capturing the main structure or flow in the document above. Pick the most fitting diagram type (flowchart, sequence, etc.). Output ONLY a single fenced ```mermaid code block - no prose.'
    default:
      return question
  }
}

function friendlyLabel(
  action: AiAction,
  question: string,
  selection: string,
  diagramKind?: DiagramKind
): string {
  switch (action) {
    case 'summarize':
      return 'Summarize this document'
    case 'explain':
      return `Explain: “${selection.slice(0, 80)}${selection.length > 80 ? '…' : ''}”`
    case 'flashcards':
      return 'Make flashcards'
    case 'studyguide':
      return 'Generate a study guide'
    case 'quiz':
      return 'Make a quiz'
    case 'suggestlinks':
      return 'Suggest links to other notes'
    case 'keyterms':
      return 'Key terms & glossary'
    case 'eli5':
      return 'Explain simply (ELI5)'
    case 'critique':
      return 'Critique & counter-points'
    case 'tasks':
      return 'Extract action items'
    case 'diagram':
      return diagramKind === 'table' ? 'Make a table' : 'Make a diagram'
    default:
      return question
  }
}

const ONE_SHOT: AiAction[] = [
  'summarize',
  'explain',
  'flashcards',
  'studyguide',
  'quiz',
  'suggestlinks',
  'keyterms',
  'eli5',
  'critique',
  'tasks',
  'diagram'
]

interface Props {
  open: boolean
  doc: string
  provider: AiProvider
  model: string
  baseUrl: string
  fileKey: string
  libraryTitles: string[]
  initialTurns: AiTurn[]
  getSelection: () => string
  getLibraryContext: (q: string) => string
  seed: { action: AiAction; selection?: string } | null
  onSeedConsumed: () => void
  onAddCard: (q: string, a: string) => void
  onTurnsChange: (turns: AiTurn[]) => void
  onConfigure: () => void
  onClose: () => void
}

export function AiPanel({
  open,
  doc,
  provider,
  model,
  baseUrl,
  fileKey,
  libraryTitles,
  initialTurns,
  getSelection,
  getLibraryContext,
  seed,
  onSeedConsumed,
  onAddCard,
  onTurnsChange,
  onConfigure,
  onClose
}: Props): React.JSX.Element | null {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [question, setQuestion] = useState('')
  const [scope, setScope] = useState<'doc' | 'library'>('doc')
  const [turns, setTurns] = useState<Turn[]>([])
  const [streaming, setStreaming] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const runRef = useRef('')
  const actionRef = useRef<AiAction>('ask')
  const streamingRef = useRef('')
  const skipEchoRef = useRef(false)

  useEffect(() => {
    if (open) void window.api.aiStatus(provider).then(setStatus)
  }, [open, provider])

  useEffect(() => {
    const unsub = window.api.onAiEvent((ev: AiEvent) => {
      if (ev.runId !== runRef.current) return
      if (ev.kind === 'chunk') {
        streamingRef.current += ev.text ?? ''
        setStreaming(streamingRef.current)
      } else if (ev.kind === 'error') {
        setError(ev.error ?? 'Something went wrong.')
        setRunning(false)
        streamingRef.current = ''
        setStreaming('')
      } else {
        const finalText = ev.text ?? streamingRef.current
        const cards =
          actionRef.current === 'flashcards' ? (parseCards(finalText) ?? undefined) : undefined
        if (finalText.trim() || cards) {
          setTurns((t) => [...t, { role: 'assistant', text: finalText, cards, usage: ev.usage }])
        }
        setRunning(false)
        streamingRef.current = ''
        setStreaming('')
      }
    })
    return unsub
  }, [])

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

  const run = (action: AiAction, explicitSelection?: string, diagramKind?: DiagramKind): void => {
    const selection = action === 'explain' ? (explicitSelection ?? getSelection()) : ''
    if (action === 'explain' && !selection.trim()) {
      setError('Select some text in the page first, then click Explain.')
      return
    }
    if ((action === 'ask' || action === 'library') && !question.trim()) {
      setError('Type a question first.')
      return
    }
    const userText = friendlyLabel(action, question, selection, diagramKind)
    const realText = strictInstruction(action, question, selection, libraryTitles, diagramKind)
    const priorTurns = ONE_SHOT.includes(action) ? [] : turns
    const history: AiTurn[] = [
      ...priorTurns.map((t) => ({ role: t.role, text: t.text })),
      { role: 'user', text: realText }
    ]
    const context = action === 'library' ? getLibraryContext(question) : undefined

    const runId = uid()
    runRef.current = runId
    actionRef.current = action
    streamingRef.current = ''
    setError(null)
    setStreaming('')
    setRunning(true)
    // Always keep the visible transcript; one-shot actions only omit prior turns from the
    // API request (via `priorTurns`/`history`), not from the on-screen conversation.
    setTurns((t) => [...t, { role: 'user', text: userText }])
    if (action === 'ask' || action === 'library') setQuestion('')
    void window.api.aiRun({
      runId,
      action,
      provider,
      model,
      baseUrl,
      doc,
      question,
      selection,
      history,
      context,
      diagramKind
    })
  }

  const stop = (): void => {
    void window.api.aiCancel(runRef.current)
  }

  const clear = (): void => {
    setTurns([])
    setStreaming('')
    setError(null)
    setAdded(new Set())
  }

  // Seeded action (e.g. Explain-from-selection, or summarize-on-open).
  useEffect(() => {
    if (!open || !seed || status == null) return
    // Only consume the seed once we can actually run it; otherwise leave it pending
    // so it fires after the user saves an API key.
    if (status.configured) {
      run(seed.action, seed.selection)
      onSeedConsumed()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seed, status])

  // Load / persist the per-document chat transcript.
  const onTurnsChangeRef = useRef(onTurnsChange)
  useEffect(() => {
    onTurnsChangeRef.current = onTurnsChange
  }, [onTurnsChange])
  useEffect(() => {
    skipEchoRef.current = true
    setTurns(initialTurns.map((t) => ({ role: t.role, text: t.text })))
    setStreaming('')
    setError(null)
    setAdded(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey])
  useEffect(() => {
    // Don't echo the transcript we just loaded for this file back to the parent.
    if (skipEchoRef.current) {
      skipEchoRef.current = false
      return
    }
    onTurnsChangeRef.current(turns.map((t) => ({ role: t.role, text: t.text })))
  }, [turns])

  if (!open) return null

  return (
    <aside className="ai-panel">
      <div className="ai-header">
        <span className="ai-title">✨ Study assistant</span>
        <button type="button" className="btn-icon" onClick={onClose} title="Close">
          ×
        </button>
      </div>

      {status == null ? (
        <p className="ai-hint">Loading…</p>
      ) : !status.configured ? (
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
        <>
          <div className="ai-controls">
            <div className="ai-row">
              <button
                type="button"
                className="ai-model-chip"
                onClick={onConfigure}
                title="Change provider / model in Settings → AI"
              >
                {provider} · {model}
              </button>
              <div className="seg ai-scope">
                <button
                  type="button"
                  className={'seg-btn' + (scope === 'doc' ? ' is-active' : '')}
                  onClick={() => setScope('doc')}
                >
                  This doc
                </button>
                <button
                  type="button"
                  className={'seg-btn' + (scope === 'library' ? ' is-active' : '')}
                  onClick={() => setScope('library')}
                >
                  Library
                </button>
              </div>
            </div>
            <div className="ai-actions">
              <button
                type="button"
                className="btn btn-small"
                disabled={running}
                onClick={() => run('summarize')}
              >
                Summarize
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={running}
                onClick={() => run('explain')}
              >
                Explain selection
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={running}
                onClick={() => run('flashcards')}
              >
                Flashcards
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={running}
                onClick={() => run('studyguide')}
              >
                Study guide
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={running}
                onClick={() => run('quiz')}
              >
                Quiz
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={running}
                onClick={() => run('suggestlinks')}
              >
                Suggest links
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={running}
                onClick={() => run('keyterms')}
              >
                Key terms
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={running}
                onClick={() => run('eli5')}
              >
                ELI5
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={running}
                onClick={() => run('critique')}
              >
                Critique
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={running}
                onClick={() => run('tasks')}
              >
                Action items
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={running}
                onClick={() => run('diagram', undefined, 'mermaid')}
              >
                Diagram
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={running}
                onClick={() => run('diagram', undefined, 'table')}
              >
                Table
              </button>
              {turns.length > 0 && (
                <button type="button" className="btn btn-small" onClick={clear}>
                  Clear
                </button>
              )}
            </div>
            <div className="ai-ask">
              <input
                className="ai-q"
                type="text"
                placeholder={
                  scope === 'library' ? 'Ask across your library…' : 'Ask about this document…'
                }
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !running) run(scope === 'library' ? 'library' : 'ask')
                }}
              />
              {running ? (
                <button type="button" className="btn btn-small" onClick={stop}>
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => run(scope === 'library' ? 'library' : 'ask')}
                >
                  Ask
                </button>
              )}
            </div>
          </div>

          <div className="ai-output">
            {error && <p className="ai-error">{error}</p>}
            {turns.map((t, i) =>
              t.role === 'user' ? (
                <div key={i} className="ai-turn ai-user">
                  {t.text}
                </div>
              ) : (
                <div key={i} className="ai-turn ai-assistant markdown-body">
                  {t.cards ? (
                    <ol className="ai-cards">
                      {t.cards.map((c, j) => {
                        const id = `${i}-${j}`
                        return (
                          <li key={j} className="ai-card">
                            <div className="ai-card-q">{c.q}</div>
                            <div className="ai-card-a">{c.a}</div>
                            <button
                              type="button"
                              className="link-btn"
                              disabled={added.has(id)}
                              onClick={() => {
                                onAddCard(c.q, c.a)
                                setAdded((s) => new Set(s).add(id))
                              }}
                            >
                              {added.has(id) ? '✓ added to deck' : '+ add to deck'}
                            </button>
                          </li>
                        )
                      })}
                    </ol>
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={remarkPlugins}
                      rehypePlugins={rehypePlugins}
                      components={components}
                      urlTransform={urlTransform}
                    >
                      {t.text}
                    </ReactMarkdown>
                  )}
                  {t.usage && (
                    <div className="ai-usage">
                      {t.usage.inputTokens + t.usage.cachedTokens}→{t.usage.outputTokens} tokens · $
                      {t.usage.costUsd.toFixed(4)}
                    </div>
                  )}
                </div>
              )
            )}
            {running && (
              <div className="ai-turn ai-assistant markdown-body">
                {streaming ? (
                  <ReactMarkdown
                    remarkPlugins={remarkPlugins}
                    rehypePlugins={rehypePlugins}
                    components={components}
                    urlTransform={urlTransform}
                  >
                    {streaming}
                  </ReactMarkdown>
                ) : (
                  <span className="ai-hint">Thinking…</span>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  )
}
