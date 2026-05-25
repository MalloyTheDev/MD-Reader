import type { AiProvider } from './types'

// Offline / no-key fallback model lists. The live `/models` fetch in the main process
// (src/main/ai.ts) supersedes these whenever a key is configured, so the picker stays current
// (e.g. new GPT models appear automatically) without this list being edited.
export const FALLBACK_MODELS: Record<AiProvider, string[]> = {
  anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini'],
  ollama: [],
  custom: []
}

// Non-chat OpenAI models we never want cluttering the picker.
const OPENAI_EXCLUDE =
  /(embedding|whisper|tts|audio|realtime|image|dall-?e|moderation|transcribe|search|davinci|babbage|ada|curie)/i
// Chat-capable id shapes: gpt-*, o1/o3/o4… reasoning models, chatgpt-*.
const OPENAI_CHAT = /^(gpt-|o\d|chatgpt)/i

interface ModelEntry {
  id?: unknown
}
function idsFrom(json: unknown): string[] {
  const data = (json as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) return []
  return data
    .map((m) => ((m as ModelEntry)?.id))
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

// Parse OpenAI's GET /v1/models response into a deduped, chat-only, newest-first id list.
export function parseOpenAiModels(json: unknown): string[] {
  const ids = idsFrom(json).filter((id) => OPENAI_CHAT.test(id) && !OPENAI_EXCLUDE.test(id))
  return Array.from(new Set(ids)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
}

// Parse Anthropic's GET /v1/models response into a deduped id list (already newest-first).
export function parseAnthropicModels(json: unknown): string[] {
  return Array.from(new Set(idsFrom(json)))
}
