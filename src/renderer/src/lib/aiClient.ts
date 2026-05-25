import type { AiRequest, AiUsage } from '@shared/types'

export interface AiOnceResult {
  text: string
  usage?: AiUsage
}

export interface AiOnceHandle {
  promise: Promise<AiOnceResult>
  cancel: () => void
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

/**
 * Run a single AI generation (no chat history) and resolve with the full text.
 * Streams partial text to `onChunk` so callers can show live progress.
 * Used by the generative features (repurpose, writing assistant, organize, course pack).
 */
export function runAiOnce(
  req: Omit<AiRequest, 'runId'>,
  onChunk?: (full: string) => void
): AiOnceHandle {
  const runId = uid()
  let full = ''
  let unsub: (() => void) | null = null
  let rejectFn: ((e: Error) => void) | null = null
  const cleanup = (): void => {
    if (unsub) {
      unsub()
      unsub = null
    }
  }
  const promise = new Promise<AiOnceResult>((resolve, reject) => {
    rejectFn = reject
    unsub = window.api.onAiEvent((ev) => {
      if (ev.runId !== runId) return
      if (ev.kind === 'chunk') {
        full += ev.text ?? ''
        onChunk?.(full)
      } else if (ev.kind === 'error') {
        cleanup()
        reject(new Error(ev.error ?? 'The AI request failed.'))
      } else {
        cleanup()
        resolve({ text: (ev.text ?? full).trim(), usage: ev.usage })
      }
    })
    void window.api.aiRun({ ...req, runId } as AiRequest)
  })
  return {
    promise,
    cancel: () => {
      void window.api.aiCancel(runId)
      cleanup()
      // Reject any awaiters so sequential pipelines (e.g. course build) unwind instead of hanging.
      rejectFn?.(new DOMException('Cancelled', 'AbortError'))
    }
  }
}

/** Strip ```json / ``` fences and parse, returning null on failure. */
export function parseJsonLoose<T>(text: string): T | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  try {
    return JSON.parse(cleaned) as T
  } catch {
    // Fall back to the first {...} or [...] block in the text.
    const match = cleaned.match(/[{[][\s\S]*[}\]]/)
    if (match) {
      try {
        return JSON.parse(match[0]) as T
      } catch {
        /* give up */
      }
    }
    return null
  }
}
