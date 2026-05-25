import { describe, it, expect } from 'vitest'
import { scanTasks, countTasks, toggleInRaw } from './tasks'
import type { MarkdownFileContent } from '@shared/types'

function doc(absolutePath: string, content: string): MarkdownFileContent {
  return { absolutePath, relativePath: 'n.md', name: 'n.md', content, title: null, author: null }
}

describe('scanTasks', () => {
  it('extracts checkbox items with state and order', () => {
    const items = scanTasks([
      doc('/a.md', '# A\n\n- [ ] first\n- [x] second\n  - [ ] nested third\nplain text')
    ])
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ text: 'first', checked: false, index: 0 })
    expect(items[1]).toMatchObject({ text: 'second', checked: true, index: 1 })
    expect(items[2]).toMatchObject({ text: 'nested third', checked: false, index: 2 })
  })

  it('counts tasks across files', () => {
    expect(countTasks([doc('/a.md', '- [ ] a\n- [x] b'), doc('/b.md', '- [ ] c')])).toBe(3)
  })
})

describe('toggleInRaw', () => {
  it('flips the targeted checkbox only', () => {
    const raw = '- [ ] a\n- [ ] b\n- [ ] c'
    const next = toggleInRaw(raw, 1)
    expect(next).toBe('- [ ] a\n- [x] b\n- [ ] c')
  })

  it('toggles a checked box back off', () => {
    expect(toggleInRaw('- [x] done', 0)).toBe('- [ ] done')
  })

  it('aligns indices past a front-matter block', () => {
    const raw = '---\ntitle: T\n---\n# H\n\n- [ ] real task'
    expect(toggleInRaw(raw, 0)).toContain('- [x] real task')
  })
})
