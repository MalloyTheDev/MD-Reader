import { describe, it, expect } from 'vitest'
import { deckToCsv, annotationsToMarkdown, renderBodyHtml, extractMermaidSources } from './export'
import type { Annotation } from '@shared/types'

describe('deckToCsv', () => {
  it('writes a header and escapes embedded quotes and commas', () => {
    const csv = deckToCsv([{ q: 'What is "X"?', a: 'A,B', source: 'note.md' }])
    const lines = csv.split('\n')
    expect(lines[0]).toBe('question,answer,source')
    expect(lines[1]).toContain('"What is ""X""?"')
    expect(lines[1]).toContain('"A,B"')
  })
})

describe('annotationsToMarkdown', () => {
  it('includes highlight text and notes', () => {
    const anns: Annotation[] = [
      {
        id: '1',
        start: 0,
        end: 5,
        color: 'yellow',
        text: 'key idea',
        note: 'remember this',
        createdAt: 0
      }
    ]
    const md = annotationsToMarkdown('My Doc', anns)
    expect(md).toContain('My Doc')
    expect(md).toContain('> key idea')
    expect(md).toContain('remember this')
  })

  it('handles the empty case', () => {
    expect(annotationsToMarkdown('Empty', [])).toContain('No highlights yet')
  })
})

describe('renderBodyHtml', () => {
  it('renders markdown to static HTML', async () => {
    const html = await renderBodyHtml('# Title\n\nSome **bold** text.')
    expect(html).toContain('<h1')
    expect(html).toContain('Title')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('renders a chart block as inline SVG', async () => {
    const html = await renderBodyHtml('```chart\ntype: bar\ny: [1, 2, 3]\n```')
    expect(html).toContain('chart-export')
    expect(html).toContain('<svg')
  })

  it('renders math via KaTeX', async () => {
    const html = await renderBodyHtml('$$E = mc^2$$')
    expect(html).toContain('katex')
  })

  it('keeps a plain code block as preformatted text', async () => {
    const html = await renderBodyHtml('```js\nconst x = 1\n```')
    expect(html).toContain('<pre')
    expect(html).toContain('language-js')
  })

  it('handles a mermaid block without crashing (renders SVG or falls back to source)', async () => {
    const html = await renderBodyHtml('```mermaid\nflowchart LR\n  A-->B\n```')
    expect(html.includes('<svg') || html.includes('A--')).toBe(true)
  })
})

describe('extractMermaidSources', () => {
  it('extracts a normal block body', () => {
    expect(extractMermaidSources('```mermaid\nflowchart LR\n  A-->B\n```')).toEqual([
      'flowchart LR\n  A-->B'
    ])
  })

  it('extracts an info-string fence body (e.g. ```mermaid {init:…})', () => {
    expect(extractMermaidSources('```mermaid {init: {"theme":"dark"}}\nA-->B\n```')).toEqual([
      'A-->B'
    ])
  })

  it('normalizes CRLF so the key matches the renderer lookup', () => {
    expect(extractMermaidSources('```mermaid\r\nflowchart LR\r\n  A-->B\r\n```')).toEqual([
      'flowchart LR\n  A-->B'
    ])
  })

  it('extracts multiple blocks', () => {
    const sources = extractMermaidSources('```mermaid\nA-->B\n```\n\n```mermaid\nC-->D\n```')
    expect(sources).toEqual(['A-->B', 'C-->D'])
  })
})
