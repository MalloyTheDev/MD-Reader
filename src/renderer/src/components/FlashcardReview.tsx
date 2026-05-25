import { useState } from 'react'
import type { Annotation } from '@shared/types'

export interface ReviewCard {
  fileAbs: string
  title: string
  annotation: Annotation
}

interface Props {
  cards: ReviewCard[]
  total?: number
  onRate: (fileAbs: string, annId: string, rating: number) => void
  onOpenFile: (absolutePath: string) => void
  onClose: () => void
}

const RATINGS: { label: string; value: number }[] = [
  { label: 'Again', value: 0 },
  { label: 'Hard', value: 1 },
  { label: 'Good', value: 2 },
  { label: 'Easy', value: 3 }
]

export function FlashcardReview({
  cards,
  total,
  onRate,
  onOpenFile,
  onClose
}: Props): React.JSX.Element {
  // Snapshot the due queue once so rating doesn't reshuffle mid-session.
  const [queue] = useState(cards)
  const [i, setI] = useState(0)
  const [show, setShow] = useState(false)

  const done = queue.length === 0 || i >= queue.length
  const reviewed = Math.min(i, queue.length)

  const rate = (r: number): void => {
    const c = queue[i]
    onRate(c.fileAbs, c.annotation.id, r)
    setShow(false)
    setI((n) => n + 1)
  }

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="review" onClick={(e) => e.stopPropagation()}>
        <div className="review-stats">
          {reviewed} reviewed · {Math.max(0, queue.length - reviewed)} left
          {typeof total === 'number' ? ` · ${total} card${total === 1 ? '' : 's'} total` : ''}
        </div>
        {done ? (
          <>
            <h2>{queue.length === 0 ? 'No cards due' : 'Review complete 🎉'}</h2>
            <p className="review-sub">
              {queue.length === 0
                ? 'Make flashcards from your highlights, then come back.'
                : `You reviewed ${queue.length} card${queue.length === 1 ? '' : 's'}.`}
            </p>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <>
            <div className="review-meta">
              Card {i + 1} of {queue.length} ·{' '}
              <button
                type="button"
                className="link-btn"
                onClick={() => onOpenFile(queue[i].fileAbs)}
              >
                {queue[i].title}
              </button>
            </div>
            <div className="review-q">
              {queue[i].annotation.card?.question || 'Recall this passage'}
            </div>
            {show ? (
              <>
                <div className="review-a">{queue[i].annotation.text}</div>
                {queue[i].annotation.note && (
                  <div className="review-note">{queue[i].annotation.note}</div>
                )}
                <div className="review-ratings">
                  {RATINGS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      className="btn"
                      onClick={() => rate(r.value)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary review-reveal"
                onClick={() => setShow(true)}
              >
                Show answer
              </button>
            )}
            <button type="button" className="link-btn review-close" onClick={onClose}>
              Close
            </button>
          </>
        )}
      </div>
    </div>
  )
}
