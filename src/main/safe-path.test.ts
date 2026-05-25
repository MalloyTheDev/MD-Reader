import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { isInside, safeSeg } from './safe-path'

// Build paths with the platform separator so these assertions hold on Windows and POSIX CI alike.
const root = join('/srv', 'vault')

describe('isInside — library-root confinement (path traversal / delete-outside-root)', () => {
  it('accepts a file directly inside the root', () => {
    expect(isInside(root, join(root, 'note.md'))).toBe(true)
  })

  it('accepts a deeply nested file', () => {
    expect(isInside(root, join(root, 'a', 'b', 'c.md'))).toBe(true)
  })

  it('accepts the root itself', () => {
    expect(isInside(root, root)).toBe(true)
  })

  it('rejects a parent-directory ("..") escape', () => {
    expect(isInside(root, join(root, '..', 'secret.md'))).toBe(false)
    expect(isInside(root, join(root, '..', '..', 'etc', 'passwd'))).toBe(false)
  })

  it('rejects a sibling folder that shares a prefix', () => {
    expect(isInside(join('/srv', 'vault'), join('/srv', 'vault-evil', 'x.md'))).toBe(false)
  })

  it('rejects an unrelated absolute path (e.g. a delete target outside the library)', () => {
    expect(isInside(root, join('/etc', 'passwd'))).toBe(false)
    expect(isInside(root, join('/srv', 'other', 'x.md'))).toBe(false)
  })

  it('rejects everything when no root is set', () => {
    expect(isInside(null, join(root, 'note.md'))).toBe(false)
  })
})

describe('safeSeg — filename sanitization', () => {
  it('preserves an ordinary name (including spaces)', () => {
    expect(safeSeg('My Study Note')).toBe('My Study Note')
  })

  it('strips path separators so a name can never become a sub-path', () => {
    expect(safeSeg('a/b\\c')).toBe('abc')
    expect(safeSeg('docs/secret')).toBe('docssecret')
  })

  it('neutralizes ".." traversal into a single safe segment (no separators, no "..")', () => {
    const out = safeSeg('../../etc/passwd')
    expect(out.includes('/')).toBe(false)
    expect(out.includes('\\')).toBe(false)
    expect(out.includes('..')).toBe(false)
  })

  it('strips Windows-illegal characters', () => {
    expect(safeSeg('a:b*c?d"e<f>g|h')).toBe('abcdefgh')
  })

  it('strips control characters', () => {
    const input = 'a' + String.fromCharCode(1) + 'b' + String.fromCharCode(31) + 'cd'
    expect(safeSeg(input)).toBe('abcd')
  })

  it('trims leading/trailing dots and spaces', () => {
    expect(safeSeg('  ..hidden..  ')).toBe('hidden')
  })

  it('prefixes reserved Windows device names', () => {
    expect(safeSeg('con')).toBe('_con')
    expect(safeSeg('LPT1.txt')).toBe('_LPT1.txt')
    expect(safeSeg('nul')).toBe('_nul')
  })

  it('falls back for empty / all-stripped input', () => {
    expect(safeSeg('')).toBe('Untitled')
    expect(safeSeg('   ')).toBe('Untitled')
    expect(safeSeg('/\\:*?')).toBe('Untitled')
    expect(safeSeg('', 'fallback-name')).toBe('fallback-name')
  })

  it('caps the length at 120 characters', () => {
    expect(safeSeg('x'.repeat(500)).length).toBe(120)
  })
})
