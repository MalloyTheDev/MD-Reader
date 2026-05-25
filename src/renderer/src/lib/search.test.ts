import { describe, it, expect } from 'vitest'
import { buildIndex, runLibrarySearch, parseQuery } from './search'
import type { MarkdownFileContent } from '@shared/types'

function doc(absolutePath: string, name: string, content: string): MarkdownFileContent {
  return {
    absolutePath,
    relativePath: absolutePath.replace(/^\//, ''),
    name,
    content,
    title: null,
    author: null
  }
}

const files = [
  doc(
    '/lib/photosynthesis.md',
    'photosynthesis.md',
    '---\ntags: [biology, plants]\n---\n# Photosynthesis\n\nPlants convert sunlight into glucose using chlorophyll.\n\n$$E = mc^2$$'
  ),
  doc(
    '/lib/mitosis.md',
    'mitosis.md',
    '---\ntags:\n  - biology\n  - cells\n---\n# Mitosis\n\nCell division produces two identical daughter cells.\n\n- [ ] review later'
  ),
  doc('/notes/charts.md', 'charts.md', '# Charts\n\n```chart\ntype: bar\ny: [1,2,3]\n```')
]

describe('library search', () => {
  it('finds a document by a body term', () => {
    const store = buildIndex(files)
    const results = runLibrarySearch(store, 'chlorophyll')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe('/lib/photosynthesis.md')
  })

  it('ranks a title match first', () => {
    const store = buildIndex(files)
    const results = runLibrarySearch(store, 'mitosis')
    expect(results[0].id).toBe('/lib/mitosis.md')
  })

  it('returns a snippet containing the term', () => {
    const store = buildIndex(files)
    const results = runLibrarySearch(store, 'glucose')
    expect(results[0].snippet.toLowerCase()).toContain('glucose')
  })

  it('returns matched lines for a body term', () => {
    const store = buildIndex(files)
    const results = runLibrarySearch(store, 'glucose')
    expect(results[0].matches.some((m) => m.toLowerCase().includes('glucose'))).toBe(true)
  })

  it('returns nothing for an empty query', () => {
    const store = buildIndex(files)
    expect(runLibrarySearch(store, '   ')).toHaveLength(0)
  })
})

describe('search query operators', () => {
  it('parses operators and free text', () => {
    const q = parseQuery('cell tag:biology has:todo')
    expect(q.text).toBe('cell')
    expect(q.filters).toContainEqual({ kind: 'tag', value: 'biology' })
    expect(q.filters).toContainEqual({ kind: 'has', value: 'todo' })
  })

  it('supports quoted operator values', () => {
    const q = parseQuery('title:"my long note" body words')
    expect(q.filters).toContainEqual({ kind: 'title', value: 'my long note' })
    expect(q.text).toBe('body words')
  })

  it('filters by tag (front-matter list or inline array)', () => {
    const store = buildIndex(files)
    const ids = runLibrarySearch(store, 'tag:cells').map((r) => r.id)
    expect(ids).toEqual(['/lib/mitosis.md'])
  })

  it('filters by has:chart', () => {
    const store = buildIndex(files)
    const ids = runLibrarySearch(store, 'has:chart').map((r) => r.id)
    expect(ids).toEqual(['/notes/charts.md'])
  })

  it('filters by has:math and has:todo', () => {
    const store = buildIndex(files)
    expect(runLibrarySearch(store, 'has:math').map((r) => r.id)).toEqual(['/lib/photosynthesis.md'])
    expect(runLibrarySearch(store, 'has:todo').map((r) => r.id)).toEqual(['/lib/mitosis.md'])
  })

  it('filters by path', () => {
    const store = buildIndex(files)
    const ids = runLibrarySearch(store, 'path:notes').map((r) => r.id)
    expect(ids).toEqual(['/notes/charts.md'])
  })

  it('combines free text with a filter (AND)', () => {
    const store = buildIndex(files)
    // "biology" tag matches two docs, but the text "glucose" narrows to one.
    const ids = runLibrarySearch(store, 'glucose tag:biology').map((r) => r.id)
    expect(ids).toEqual(['/lib/photosynthesis.md'])
  })

  it('matches tags exactly, not by prefix', () => {
    const store = buildIndex(files)
    expect(runLibrarySearch(store, 'tag:cell').map((r) => r.id)).toEqual([])
    expect(runLibrarySearch(store, 'tag:cells').map((r) => r.id)).toEqual(['/lib/mitosis.md'])
  })

  it('treats an unknown has: value as free text, not a filter', () => {
    const q = parseQuery('has:bogus')
    expect(q.filters).toHaveLength(0)
    expect(q.text).toBe('bogus')
  })

  it('parses indented front-matter tags', () => {
    const store = buildIndex([doc('/x.md', 'x.md', '---\n  tags: [alpha, beta]\n---\n# X\n\nbody')])
    expect(runLibrarySearch(store, 'tag:alpha').map((r) => r.id)).toEqual(['/x.md'])
  })
})

describe('feature detection edge cases', () => {
  const fx = [
    doc('/a.md', 'a.md', '# A\n\nI paid $5 and $10 for lunch.'),
    doc('/b.md', 'b.md', '# B\n\nEuler famously wrote $e^{i\\pi}+1=0$ here.'),
    doc('/c.md', 'c.md', '# C\n\n| x | y |\n| --- | --- |\n| 1 | 2 |'),
    doc('/d.md', 'd.md', '# D\n\n| a | b |\n|---|\n\nplain text')
  ]

  it('does not flag currency text as math (has:math)', () => {
    const store = buildIndex(fx)
    expect(runLibrarySearch(store, 'has:math').map((r) => r.id)).toEqual(['/b.md'])
  })

  it('detects a real table but not a stray single-column separator (has:table)', () => {
    const store = buildIndex(fx)
    expect(runLibrarySearch(store, 'has:table').map((r) => r.id)).toEqual(['/c.md'])
  })
})
