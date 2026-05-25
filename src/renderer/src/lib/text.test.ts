import { describe, it, expect } from 'vitest'
import { countWords, readTimeMinutes } from './text'

describe('countWords', () => {
  it('counts plain words', () => {
    expect(countWords('one two three')).toBe(3)
  })
  it('ignores markdown punctuation and keeps link text', () => {
    expect(countWords('# Heading with [a link](http://x) and **bold**')).toBe(6)
  })
  it('skips fenced and inline code', () => {
    expect(countWords('text ```\nignored code here\n``` `also ignored` end')).toBe(2)
  })
  it('returns 0 for empty/whitespace', () => {
    expect(countWords('   \n  ')).toBe(0)
  })
})

describe('readTimeMinutes', () => {
  it('is 0 for no words', () => {
    expect(readTimeMinutes(0)).toBe(0)
  })
  it('rounds up to at least 1 minute', () => {
    expect(readTimeMinutes(50)).toBe(1)
  })
  it('scales with word count', () => {
    expect(readTimeMinutes(660)).toBe(3)
  })
})
