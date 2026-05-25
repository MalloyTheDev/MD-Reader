import { describe, it, expect } from 'vitest'
import { buildGraph } from './graph'
import type { MarkdownFileContent } from '@shared/types'

function doc(
  absolutePath: string,
  relativePath: string,
  content: string,
  title: string | null = null
): MarkdownFileContent {
  return {
    absolutePath,
    relativePath,
    name: relativePath.split('/').pop()!,
    content,
    title,
    author: null
  }
}

describe('buildGraph', () => {
  it('records wiki-link backlinks and outlinks', () => {
    const files = [
      doc('/lib/a.md', 'a.md', 'See [[B]] for details.'),
      doc('/lib/b.md', 'b.md', '# B')
    ]
    const g = buildGraph(files)
    expect(g.outlinks['/lib/a.md']).toContain('/lib/b.md')
    expect(g.backlinks['/lib/b.md']).toContain('/lib/a.md')
    expect(g.links).toContainEqual({ source: '/lib/a.md', target: '/lib/b.md' })
  })

  it('indexes hashtags', () => {
    const files = [doc('/lib/a.md', 'a.md', 'Topics: #biology #cells')]
    const g = buildGraph(files)
    expect(Object.keys(g.tagIndex).sort()).toEqual(['biology', 'cells'])
    expect(g.tagIndex['biology']).toContain('/lib/a.md')
  })

  it('resolves relative markdown links', () => {
    const files = [
      doc('/lib/a.md', 'folder/a.md', 'Link to [other](./b.md)'),
      doc('/lib/b.md', 'folder/b.md', '# B')
    ]
    const g = buildGraph(files)
    expect(g.outlinks['/lib/a.md']).toContain('/lib/b.md')
  })

  it('does not link a note to itself', () => {
    const files = [doc('/lib/a.md', 'a.md', '# A\n\n[[A]]')]
    const g = buildGraph(files)
    expect(g.outlinks['/lib/a.md']).toHaveLength(0)
  })

  it('resolves a duplicated title to the first file (deterministic)', () => {
    const files = [
      doc('/lib/first.md', 'first.md', 'x', 'Shared Title'),
      doc('/lib/second.md', 'second.md', 'y', 'Shared Title'),
      doc('/lib/c.md', 'c.md', 'See [[Shared Title]]')
    ]
    const g = buildGraph(files)
    expect(g.outlinks['/lib/c.md']).toEqual(['/lib/first.md'])
  })
})
