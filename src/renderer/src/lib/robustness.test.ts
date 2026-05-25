import { describe, it, expect } from 'vitest'
import { parseChart } from './chart'
import { extractMermaidSources } from './export'
import { computeDocStats, findBrokenWikiLinks } from './docinfo'
import { buildIndex, runLibrarySearch } from './search'
import type { MarkdownFileContent } from '@shared/types'

// Exercises the "dangerous"/adversarial input surfaces: malformed embedded blocks, broken links,
// and very large / binary-ish documents. Correctness is asserted; a genuine hang would trip
// vitest's per-test timeout and fail the suite.

function doc(p: string, content: string): MarkdownFileContent {
  return {
    absolutePath: p,
    relativePath: p.replace(/^\//, ''),
    name: p.split('/').pop() as string,
    content,
    title: null,
    author: null
  }
}

describe('robustness: malformed chart blocks', () => {
  it('never throws and reports an error for assorted malformed specs', () => {
    for (const bad of ['', '   ', '}{[', '{"type":', 'not a chart at all', '[]']) {
      expect(() => parseChart(bad)).not.toThrow()
    }
    expect('error' in parseChart('{ not valid json')).toBe(true)
    expect('error' in parseChart('type: line\ntitle: no data')).toBe(true)
  })

  it('caps a pathological huge data array instead of hanging or exhausting memory', () => {
    const big = 'type: line\ny: [' + Array.from({ length: 200000 }, (_, i) => i).join(',') + ']'
    const r = parseChart(big)
    if ('spec' in r) expect(r.spec.series[0].data.length).toBeLessThanOrEqual(2000)
    else throw new Error('expected a capped spec')
  })
})

describe('robustness: malformed mermaid', () => {
  it('extracts nothing (never throws) from malformed/empty mermaid input', () => {
    expect(() => extractMermaidSources('')).not.toThrow()
    expect(extractMermaidSources('```mermaid\nno closing fence here')).toEqual([])
    expect(extractMermaidSources('not mermaid at all')).toEqual([])
    expect(extractMermaidSources('```mermaid\n\n```')).toEqual([])
  })
})

describe('robustness: broken wiki-links', () => {
  it('flags only unresolved targets (deduped, case-insensitive, excluding embeds)', () => {
    const content = 'See [[Alpha]], [[alpha]] again, [[Missing One]], and ![[an-embed]].'
    expect(findBrokenWikiLinks(content, ['Alpha'])).toEqual(['Missing One'])
  })

  it('handles a document with thousands of wiki-links without hanging', () => {
    const many = Array.from({ length: 5000 }, (_, i) => `[[Note ${i}]]`).join(' ')
    expect(() => findBrokenWikiLinks(many, [])).not.toThrow()
    expect(findBrokenWikiLinks(many, []).length).toBe(5000)
  })
})

describe('robustness: giant Markdown files', () => {
  it('computeDocStats handles a multi-MB document', () => {
    const giant = '# Heading\n\nLorem ipsum dolor sit amet, consectetur. '.repeat(50000) // ~2.5MB
    const s = computeDocStats(giant)
    expect(s.words).toBeGreaterThan(0)
    expect(s.headings).toBeGreaterThan(0)
  })

  it('search indexes and queries a giant document without hanging', () => {
    const giant = 'magicword '.repeat(300000) // ~3MB
    const store = buildIndex([doc('/giant.md', '# Giant\n\n' + giant)])
    const res = runLibrarySearch(store, 'magicword')
    expect(res.length).toBe(1)
    expect(res[0].id).toBe('/giant.md')
  })
})

describe('robustness: binary / image-heavy vaults', () => {
  it('indexes binary-ish content and image-heavy docs without crashing', () => {
    const binary = String.fromCharCode(...Array.from({ length: 2000 }, (_, i) => i % 256))
    const images = Array.from({ length: 500 }, (_, i) => `![img${i}](pic${i}.png)`).join('\n')
    const files = [doc('/bin.md', '# Bin\n\n' + binary), doc('/imgs.md', '# Images\n\n' + images)]
    expect(() => buildIndex(files)).not.toThrow()
    const store = buildIndex(files)
    expect(() => runLibrarySearch(store, 'Images')).not.toThrow()
    // The image-heavy doc is detected by the has:image feature filter.
    expect(runLibrarySearch(store, 'has:image').map((x) => x.id)).toContain('/imgs.md')
  })
})
