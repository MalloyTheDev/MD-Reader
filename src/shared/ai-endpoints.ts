import type { AiProvider } from './types'

// Resolve the base URL an AI request should use for a given provider.
//
// SECURITY (SSRF pin): the OpenAI API key is only ever sent to OpenAI's official host. Any
// renderer-supplied base URL is IGNORED for the "openai" provider, so a compromised/malicious
// renderer can't redirect the key to an arbitrary endpoint. OpenAI-compatible proxies must use
// the "custom" provider (where the base URL is intentionally caller-supplied).
export function resolveBaseUrl(provider: AiProvider, given?: string): string {
  const trimmed = (given ?? '').trim().replace(/\/$/, '')
  if (provider === 'openai') return 'https://api.openai.com/v1'
  if (provider === 'ollama') return trimmed || 'http://localhost:11434/v1'
  return trimmed // custom: caller-supplied (empty string if not provided)
}
