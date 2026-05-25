import { describe, it, expect } from 'vitest'
import { resolveBaseUrl } from './ai-endpoints'

describe('resolveBaseUrl - provider config + SSRF pin', () => {
  it('pins OpenAI to the official host and IGNORES any supplied base URL (SSRF guard)', () => {
    expect(resolveBaseUrl('openai')).toBe('https://api.openai.com/v1')
    expect(resolveBaseUrl('openai', 'http://evil.example.com/v1')).toBe('https://api.openai.com/v1')
    expect(resolveBaseUrl('openai', 'https://attacker/v1/')).toBe('https://api.openai.com/v1')
    expect(resolveBaseUrl('openai', '')).toBe('https://api.openai.com/v1')
  })

  it('defaults Ollama to localhost when no base URL is given', () => {
    expect(resolveBaseUrl('ollama')).toBe('http://localhost:11434/v1')
    expect(resolveBaseUrl('ollama', '')).toBe('http://localhost:11434/v1')
  })

  it('uses (and trims) a supplied Ollama base URL', () => {
    expect(resolveBaseUrl('ollama', 'http://192.168.1.5:11434/v1')).toBe(
      'http://192.168.1.5:11434/v1'
    )
    expect(resolveBaseUrl('ollama', 'http://host:1234/v1/')).toBe('http://host:1234/v1')
  })

  it('uses a caller-supplied base URL for the custom provider', () => {
    expect(resolveBaseUrl('custom', 'https://proxy.internal/v1')).toBe('https://proxy.internal/v1')
  })

  it('returns empty for a custom provider with no base URL (bad config - caller must validate)', () => {
    expect(resolveBaseUrl('custom', '')).toBe('')
    expect(resolveBaseUrl('custom')).toBe('')
  })
})
