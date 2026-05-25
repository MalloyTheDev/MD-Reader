import { describe, it, expect } from 'vitest'
import { computeDocStats, extractWikiNames, findBrokenWikiLinks } from './docinfo'

const sample = `---
title: Demo
tags: [x]
---

# Heading One

Some prose with a [[Known Note]] link and a [external](https://example.com) link.

## Heading Two

$$E = mc^2$$

Inline math $a^2 + b^2$ here.

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

\`\`\`chart
type: bar
y: [1,2,3]
\`\`\`

\`\`\`js
const x = 1
\`\`\`

| a | b |
| --- | --- |
| 1 | 2 |

![alt](pic.png)

![[embedded-note]]

- [x] done task
- [ ] pending task
`

describe('computeDocStats', () => {
  const s = computeDocStats(sample)

  it('counts headings', () => expect(s.headings).toBe(2))
  it('counts equations (display + inline)', () => expect(s.equations).toBe(2))
  it('counts mermaid diagrams', () => expect(s.diagrams).toBe(1))
  it('counts charts', () => expect(s.charts).toBe(1))
  it('counts only non-diagram code blocks', () => expect(s.codeBlocks).toBe(1))
  it('counts tables', () => expect(s.tables).toBe(1))
  it('counts images (not embeds)', () => expect(s.images).toBe(1))
  it('counts embeds', () => expect(s.embeds).toBe(1))
  it('counts markdown links (not images)', () => expect(s.links).toBe(1))
  it('counts wiki links (not embeds)', () => expect(s.wikiLinks).toBe(1))
  it('counts tasks total and done', () => {
    expect(s.tasksTotal).toBe(2)
    expect(s.tasksDone).toBe(1)
  })
  it('computes a positive word count and reading time', () => {
    expect(s.words).toBeGreaterThan(0)
    expect(s.readingMin).toBeGreaterThanOrEqual(1)
  })
})

describe('computeDocStats accuracy fixes', () => {
  it('counts simple inline math like $x$ (matches the renderer)', () => {
    expect(computeDocStats('The variable $x$ and $y$ both matter.').equations).toBe(2)
  })

  it('does not count currency text as math', () => {
    expect(computeDocStats('I paid $5 and $10 today.').equations).toBe(0)
  })

  it('does not count tables/headings shown inside a code block', () => {
    const c = '# Real heading\n\n```md\n# Fake heading\n| a | b |\n| --- | --- |\n| 1 | 2 |\n```\n'
    const s = computeDocStats(c)
    expect(s.headings).toBe(1)
    expect(s.tables).toBe(0)
    expect(s.codeBlocks).toBe(1)
  })

  it('classifies mermaid / chart / code fences separately', () => {
    const c = '```mermaid\na\n```\n\n```chart\nb\n```\n\n```js\nc\n```\n'
    const s = computeDocStats(c)
    expect(s.diagrams).toBe(1)
    expect(s.charts).toBe(1)
    expect(s.codeBlocks).toBe(1)
  })
})

describe('wiki-link health', () => {
  it('extracts wiki names without alias/heading and excludes embeds', () => {
    const names = extractWikiNames('see [[Note A|alias]] and [[Note B#section]] and ![[embed]]')
    expect(names).toEqual(['Note A', 'Note B'])
  })

  it('flags wiki links with no matching known title (case-insensitive, deduped)', () => {
    const content = 'Link [[Alpha]], [[alpha]] again, and [[Missing One]].'
    const broken = findBrokenWikiLinks(content, ['Alpha', 'Beta'])
    expect(broken).toEqual(['Missing One'])
  })

  it('returns no broken links when all resolve', () => {
    expect(findBrokenWikiLinks('[[Alpha]] [[Beta]]', ['alpha', 'beta'])).toEqual([])
  })

  it('handles a pathological "[" run without catastrophic backtracking (ReDoS guard)', () => {
    const evil = '['.repeat(100000)
    const t0 = Date.now()
    computeDocStats(evil)
    extractWikiNames(evil)
    findBrokenWikiLinks(evil, [])
    expect(Date.now() - t0).toBeLessThan(1000)
  })
})
