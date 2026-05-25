import { describe, it, expect } from 'vitest'
import { sanitizeImported } from './SettingsView'

describe('sanitizeImported (settings import hardening)', () => {
  it('clamps out-of-range numbers to valid ranges', () => {
    const out = sanitizeImported({ fontSizePx: 9999, lineHeight: 0, margins: -50 })
    expect(out.fontSizePx).toBe(30)
    expect(out.lineHeight).toBe(1.2)
    expect(out.margins).toBe(50)
  })

  it('drops invalid enum values but keeps valid ones', () => {
    const out = sanitizeImported({ theme: 'evil', fontFamily: 'sans', pageAnimation: 'nope' })
    expect('theme' in out).toBe(false)
    expect(out.fontFamily).toBe('sans')
    expect('pageAnimation' in out).toBe(false)
  })

  it('accepts only color-shaped or empty accent strings', () => {
    expect(sanitizeImported({ accent: '#1f6feb' }).accent).toBe('#1f6feb')
    expect(sanitizeImported({ accent: '' }).accent).toBe('')
    expect('accent' in sanitizeImported({ accent: 'red; } body {}' })).toBe(false)
  })

  it('ignores unknown keys and prototype-pollution attempts', () => {
    const out = sanitizeImported({ __proto__: { polluted: 1 }, evilKey: 1, autosave: true })
    expect(out.autosave).toBe(true)
    expect((out as Record<string, unknown>).evilKey).toBeUndefined()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('rejects non-boolean for boolean fields and non-object input', () => {
    expect('twoPage' in sanitizeImported({ twoPage: 'yes' })).toBe(false)
    expect(sanitizeImported(null)).toEqual({})
    expect(sanitizeImported('nope')).toEqual({})
  })
})
