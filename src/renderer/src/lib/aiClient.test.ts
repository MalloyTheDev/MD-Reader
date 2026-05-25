import { describe, it, expect } from 'vitest'
import { parseJsonLoose } from './aiClient'

describe('parseJsonLoose', () => {
  it('parses plain JSON', () => {
    expect(parseJsonLoose<{ a: number }>('{"a":1}')).toEqual({ a: 1 })
  })

  it('strips a ```json fence', () => {
    const text = '```json\n{"title":"X","tags":["a"]}\n```'
    expect(parseJsonLoose(text)).toEqual({ title: 'X', tags: ['a'] })
  })

  it('strips a bare ``` fence', () => {
    expect(parseJsonLoose('```\n[1,2,3]\n```')).toEqual([1, 2, 3])
  })

  it('extracts a JSON object embedded in prose', () => {
    const text = 'Here you go:\n{"q":"why","a":"because"}\nHope that helps!'
    expect(parseJsonLoose<{ q: string; a: string }>(text)).toEqual({ q: 'why', a: 'because' })
  })

  it('returns null for non-JSON', () => {
    expect(parseJsonLoose('not json at all')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(parseJsonLoose('')).toBeNull()
  })
})
