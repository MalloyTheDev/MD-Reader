import { describe, it, expect } from 'vitest'
import { parseOpenAiModels, parseAnthropicModels, FALLBACK_MODELS } from './ai-models'

describe('parseOpenAiModels', () => {
  it('keeps chat models, drops non-chat models, dedupes, and sorts newest-first', () => {
    const json = {
      data: [
        { id: 'gpt-4o' },
        { id: 'gpt-4o' }, // duplicate
        { id: 'gpt-5.1' },
        { id: 'o4-mini' },
        { id: 'chatgpt-4o-latest' },
        { id: 'text-embedding-3-large' }, // excluded
        { id: 'whisper-1' }, // excluded
        { id: 'dall-e-3' }, // excluded
        { id: 'gpt-4o-mini-tts' } // excluded (tts)
      ]
    }
    const out = parseOpenAiModels(json)
    expect(out).toContain('gpt-5.1')
    expect(out).toContain('gpt-4o')
    expect(out).toContain('o4-mini')
    expect(out).toContain('chatgpt-4o-latest')
    expect(out).not.toContain('text-embedding-3-large')
    expect(out).not.toContain('whisper-1')
    expect(out).not.toContain('dall-e-3')
    expect(out).not.toContain('gpt-4o-mini-tts')
    // no duplicates
    expect(out.filter((m) => m === 'gpt-4o')).toHaveLength(1)
    // newest-first: gpt-5.x sorts above gpt-4.x
    expect(out.indexOf('gpt-5.1')).toBeLessThan(out.indexOf('gpt-4o'))
  })

  it('returns [] for malformed input', () => {
    expect(parseOpenAiModels(null)).toEqual([])
    expect(parseOpenAiModels({})).toEqual([])
    expect(parseOpenAiModels({ data: 'nope' })).toEqual([])
    expect(parseOpenAiModels({ data: [{}, { id: 42 }, { id: '' }] })).toEqual([])
  })
})

describe('parseAnthropicModels', () => {
  it('maps ids and dedupes', () => {
    const out = parseAnthropicModels({
      data: [{ id: 'claude-opus-4-7' }, { id: 'claude-sonnet-4-6' }, { id: 'claude-opus-4-7' }]
    })
    expect(out).toEqual(['claude-opus-4-7', 'claude-sonnet-4-6'])
  })

  it('returns [] for malformed input', () => {
    expect(parseAnthropicModels(null)).toEqual([])
    expect(parseAnthropicModels({ data: {} })).toEqual([])
  })
})

describe('FALLBACK_MODELS', () => {
  it('has an entry for every provider', () => {
    expect(Object.keys(FALLBACK_MODELS).sort()).toEqual(
      ['anthropic', 'custom', 'ollama', 'openai'].sort()
    )
    expect(FALLBACK_MODELS.anthropic.length).toBeGreaterThan(0)
    expect(FALLBACK_MODELS.openai.length).toBeGreaterThan(0)
  })
})
