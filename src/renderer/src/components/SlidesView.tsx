import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { AppSettings } from '@shared/types'
import { makeComponents, rehypePlugins, remarkPlugins, urlTransform } from '../lib/markdown'

interface SlidesViewProps {
  content: string
  baseDir: string
  title: string
  settings: AppSettings
  onClose: () => void
}

function splitByHeadings(md: string): string[] {
  const lines = md.split('\n')
  const slides: string[] = []
  let cur: string[] = []
  for (const line of lines) {
    if (/^#{1,2}\s/.test(line) && cur.some((l) => l.trim())) {
      slides.push(cur.join('\n'))
      cur = []
    }
    cur.push(line)
  }
  if (cur.length) slides.push(cur.join('\n'))
  return slides.map((s) => s.trim()).filter(Boolean)
}

export function toSlides(md: string): string[] {
  const lines = md.split('\n')
  const slides: string[] = []
  let cur: string[] = []
  let breaks = 0
  for (const line of lines) {
    if (/^-{3,}\s*$/.test(line.trim())) {
      slides.push(cur.join('\n'))
      cur = []
      breaks++
      continue
    }
    cur.push(line)
  }
  slides.push(cur.join('\n'))
  const cleaned = slides.map((s) => s.trim()).filter(Boolean)
  if (breaks === 0) {
    const byHeading = splitByHeadings(md)
    if (byHeading.length > 1) return byHeading
  }
  return cleaned.length ? cleaned : [md]
}

export function SlidesView({
  content,
  baseDir,
  title,
  settings,
  onClose
}: SlidesViewProps): React.JSX.Element {
  const slides = useMemo(() => toSlides(content), [content])
  const [i, setI] = useState(0)
  const idx = Math.min(i, slides.length - 1)

  const components = useMemo(
    () =>
      makeComponents(
        baseDir,
        (href) => {
          if (/^https?:/i.test(href)) window.api.openExternal(href)
        },
        () => {},
        settings.allowRemoteImages,
        settings.theme
      ),
    [baseDir, settings.allowRemoteImages, settings.theme]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault()
        setI((n) => Math.min(slides.length - 1, n + 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        setI((n) => Math.max(0, n - 1))
      } else if (e.key === 'Home') {
        setI(0)
      } else if (e.key === 'End') {
        setI(slides.length - 1)
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slides.length, onClose])

  return (
    <div className="slides-overlay" role="dialog" aria-label="Presentation">
      <div className="slides-topbar">
        <span className="slides-title">{title}</span>
        <span className="slides-counter">
          {idx + 1} / {slides.length}
        </span>
        <button
          type="button"
          className="btn-icon"
          onClick={onClose}
          title="Exit presentation (Esc)"
        >
          ×
        </button>
      </div>
      <div className="slide-stage" onClick={() => setI((n) => Math.min(slides.length - 1, n + 1))}>
        <div className="slide markdown-body" onClick={(e) => e.stopPropagation()}>
          <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={components}
            urlTransform={urlTransform}
          >
            {slides[idx]}
          </ReactMarkdown>
        </div>
      </div>
      <div className="slides-nav">
        <button
          type="button"
          className="btn btn-small"
          onClick={() => setI((n) => Math.max(0, n - 1))}
          disabled={idx === 0}
        >
          ‹ Prev
        </button>
        <div className="slides-dots">
          {slides.map((_, n) => (
            <button
              key={n}
              type="button"
              className={'slide-dot' + (n === idx ? ' is-active' : '')}
              onClick={() => setI(n)}
              aria-label={`Slide ${n + 1}`}
            />
          ))}
        </div>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => setI((n) => Math.min(slides.length - 1, n + 1))}
          disabled={idx === slides.length - 1}
        >
          Next ›
        </button>
      </div>
    </div>
  )
}
