import { describe, it, expect } from 'vitest'
import {
  TEMPLATES,
  TEMPLATE_CATEGORIES,
  getTemplate,
  templatesByCategory
} from './templates'

const ctx = { date: '2026-05-25' }

describe('document templates', () => {
  it('has unique ids', () => {
    const ids = TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every template builds a non-empty body with front-matter and a heading', () => {
    for (const t of TEMPLATES) {
      const body = t.build(ctx)
      expect(body.length).toBeGreaterThan(20)
      expect(body.startsWith('---\n')).toBe(true)
      expect(body).toMatch(/^#\s+/m)
    }
  })

  it('leaves no unsubstituted template expressions in built output', () => {
    for (const t of TEMPLATES) {
      expect(t.build(ctx).includes('${')).toBe(false)
    }
  })

  it('produces safe file names (no path separators or traversal)', () => {
    for (const t of TEMPLATES) {
      const name = t.fileName(ctx)
      expect(name.length).toBeGreaterThan(0)
      expect(/[/\\]/.test(name)).toBe(false)
      expect(name.includes('..')).toBe(false)
    }
  })

  it('embeds the context date in dated templates', () => {
    const dated = ['design-doc', 'lab-experiment', 'lecture-notes', 'meeting-notes', 'daily-journal']
    for (const id of dated) {
      const t = getTemplate(id)
      expect(t).toBeTruthy()
      expect(t!.fileName(ctx).includes(ctx.date)).toBe(true)
    }
  })

  it('assigns every template a known category, and every category has templates', () => {
    for (const t of TEMPLATES) expect(TEMPLATE_CATEGORIES).toContain(t.category)
    for (const cat of TEMPLATE_CATEGORIES) expect(templatesByCategory(cat).length).toBeGreaterThan(0)
  })

  it('getTemplate returns undefined for an unknown id', () => {
    expect(getTemplate('does-not-exist')).toBeUndefined()
  })
})
