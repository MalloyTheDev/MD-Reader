import { useEffect, useRef, useState } from 'react'
import type { AiProvider } from '@shared/types'
import { runAiOnce, parseJsonLoose, type AiOnceHandle } from '../lib/aiClient'

interface Props {
  provider: AiProvider
  model: string
  baseUrl: string
  onConfigure: () => void
  onOpenCourse: (overviewPath: string) => void
  onClose: () => void
}

interface Lesson {
  title: string
  summary: string
}
interface Outline {
  title: string
  lessons: Lesson[]
}

type Phase = 'topic' | 'outline' | 'building' | 'done'

const pad = (n: number): string => String(n).padStart(2, '0')

export function CoursePanel({
  provider,
  model,
  baseUrl,
  onConfigure,
  onOpenCourse,
  onClose
}: Props): React.JSX.Element {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [phase, setPhase] = useState<Phase>('topic')
  const [topic, setTopic] = useState('')
  const [outline, setOutline] = useState<Outline | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const overviewPathRef = useRef<string | null>(null)
  const handleRef = useRef<AiOnceHandle | null>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void window.api.aiStatus(provider).then((s) => {
      if (!cancelled) setConfigured(s.configured)
    })
    return () => {
      cancelled = true
    }
  }, [provider])

  useEffect(
    () => () => {
      cancelledRef.current = true
      handleRef.current?.cancel()
    },
    []
  )

  const aiCfg = { provider, model, baseUrl }

  const genOutline = async (): Promise<void> => {
    const t = topic.trim()
    if (!t || busy) return
    setBusy(true)
    setError(null)
    setOutline(null)
    try {
      const h = runAiOnce({ action: 'courseoutline', question: t, doc: '', ...aiCfg })
      handleRef.current = h
      const r = await h.promise
      const parsed = parseJsonLoose<Outline>(r.text)
      const lessons = Array.isArray(parsed?.lessons)
        ? parsed!.lessons
            .filter((l) => l && typeof l.title === 'string')
            .map((l) => ({ title: l.title.trim(), summary: String(l.summary ?? '').trim() }))
        : []
      if (!parsed || lessons.length === 0) {
        setError('Could not generate an outline. Try rephrasing the topic.')
      } else {
        setOutline({ title: (parsed.title || t).trim(), lessons })
        setPhase('outline')
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const buildOverview = (o: Outline): string => {
    const lessons = o.lessons
      .map((L, i) => `${i + 1}. [[${pad(i + 1)} - ${L.title}]] - ${L.summary}`)
      .join('\n')
    return `# ${o.title}\n\nA self-study course on **${topic.trim()}**, generated lesson by lesson.\n\n## Lessons\n${lessons}\n\n## Study\n- [[Quiz]]\n- [[Flashcards]]\n`
  }

  const runStep = async (req: Parameters<typeof runAiOnce>[0], label: string): Promise<string> => {
    setProgress(label)
    const h = runAiOnce(req)
    handleRef.current = h
    return (await h.promise).text
  }

  const build = async (): Promise<void> => {
    if (!outline) return
    cancelledRef.current = false
    setError(null)
    setPhase('building')
    try {
      const lessonsMd: string[] = []
      for (let i = 0; i < outline.lessons.length; i++) {
        if (cancelledRef.current) return
        const L = outline.lessons[i]
        const md = await runStep(
          {
            action: 'courselesson',
            question: topic.trim(),
            selection: `${L.title} - ${L.summary}`,
            doc: '',
            ...aiCfg
          },
          `Writing lesson ${i + 1} of ${outline.lessons.length}: ${L.title}`
        )
        lessonsMd.push(md)
      }
      if (cancelledRef.current) return
      const assembled = lessonsMd.join('\n\n---\n\n').slice(0, 200_000)
      const quiz = await runStep({ action: 'quiz', doc: assembled, ...aiCfg }, 'Building a quiz…')
      if (cancelledRef.current) return
      const cardsRaw = await runStep(
        { action: 'flashcards', doc: assembled, ...aiCfg },
        'Building flashcards…'
      )
      const cards = parseJsonLoose<{ q: string; a: string }[]>(cardsRaw)
      const cardsMd =
        Array.isArray(cards) && cards.length
          ? `# Flashcards: ${outline.title}\n\n` +
            cards.map((c, i) => `**${i + 1}. ${c.q}**\n\n${c.a}\n`).join('\n')
          : `# Flashcards: ${outline.title}\n\n${cardsRaw}`
      if (cancelledRef.current) return
      setProgress('Saving course…')
      const files = [
        { name: '00 - Overview', content: buildOverview(outline) },
        ...outline.lessons.map((L, i) => ({
          name: `${pad(i + 1)} - ${L.title}`,
          content: lessonsMd[i]
        })),
        { name: 'Quiz', content: quiz },
        { name: 'Flashcards', content: cardsMd }
      ]
      const path = await window.api.createCourse({ folderName: outline.title, files })
      overviewPathRef.current = path
      setPhase('done')
    } catch (e) {
      if (!cancelledRef.current && (e as Error).name !== 'AbortError') {
        setError((e as Error).message)
        setPhase('outline')
      }
    }
  }

  const cancelBuild = (): void => {
    cancelledRef.current = true
    handleRef.current?.cancel()
    setPhase('outline')
  }

  return (
    <>
      <div
        className="panel-backdrop"
        onClick={phase === 'building' ? undefined : onClose}
        aria-hidden="true"
      />
      <div className="create-panel" role="dialog" aria-label="New course from a topic">
        <div className="sv-head">
          <h2>✦ New course</h2>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            disabled={phase === 'building'}
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
            {phase === 'topic' && (
              <>
                <p className="sv-hint">
                  Enter a topic and AI will design a short course - lessons, a quiz, and a flashcard
                  deck - saved as a new folder of notes.
                </p>
                <input
                  className="sv-text"
                  value={topic}
                  placeholder="e.g. Introduction to photosynthesis"
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void genOutline()
                  }}
                  autoFocus
                  spellCheck={false}
                />
                {error && <p className="ai-error">{error}</p>}
                <div className="create-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!topic.trim() || busy || configured === null}
                    onClick={() => void genOutline()}
                  >
                    {busy ? 'Designing…' : 'Generate outline'}
                  </button>
                </div>
              </>
            )}

            {phase === 'outline' && outline && (
              <>
                <h3 className="course-title">{outline.title}</h3>
                <p className="sv-hint">Review the outline, then create the course.</p>
                <ol className="course-outline">
                  {outline.lessons.map((L, i) => (
                    <li key={i}>
                      <span className="course-lesson-title">{L.title}</span>
                      {L.summary && <span className="course-lesson-sum"> - {L.summary}</span>}
                    </li>
                  ))}
                </ol>
                {error && <p className="ai-error">{error}</p>}
                <div className="create-actions">
                  <button type="button" className="btn btn-primary" onClick={() => void build()}>
                    Create course ({outline.lessons.length} lessons + quiz + cards)
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => {
                      setPhase('topic')
                      setOutline(null)
                    }}
                  >
                    Edit topic
                  </button>
                </div>
              </>
            )}

            {phase === 'building' && (
              <div className="course-building">
                <div className="spinner" aria-hidden="true" />
                <p className="course-progress">{progress}</p>
                <p className="sv-hint">This can take a minute for longer courses.</p>
                <div className="create-actions">
                  <button type="button" className="btn btn-small" onClick={cancelBuild}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {phase === 'done' && (
              <div className="course-done">
                <p className="course-progress">✓ Course created: {outline?.title}</p>
                <div className="create-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => overviewPathRef.current && onOpenCourse(overviewPathRef.current)}
                  >
                    Open course
                  </button>
                  <button type="button" className="btn btn-small" onClick={onClose}>
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
