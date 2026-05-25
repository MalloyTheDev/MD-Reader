import { describe, it, expect } from 'vitest'
import { purgeState, missingRefs } from './library-clean'
import type { PersistedState } from '@shared/types'

function makeState(): PersistedState {
  return {
    lastFolder: '/lib',
    lastFile: '/lib/a.md',
    positions: {
      '/lib/a.md': { page: 2, anchorId: null },
      '/lib/b.md': { page: 0, anchorId: null }
    },
    bookmarks: { '/lib/a.md': [], '/lib/b.md': [] },
    annotations: { '/lib/a.md': [], '/lib/b.md': [] },
    aiChats: { '/lib/a.md': [{ role: 'user', text: 'hi' }] },
    favorites: ['/lib/a.md', '/lib/b.md'],
    hidden: ['/lib/a.md'],
    recentFolders: ['/lib', '/other']
  }
}

describe('purgeState', () => {
  it('removes the path from every collection but keeps others', () => {
    const next = purgeState(makeState(), '/lib/a.md')
    expect(next.lastFile).toBeNull()
    expect('/lib/a.md' in next.positions).toBe(false)
    expect('/lib/b.md' in next.positions).toBe(true)
    expect('/lib/a.md' in next.bookmarks).toBe(false)
    expect('/lib/a.md' in next.annotations).toBe(false)
    expect('/lib/a.md' in next.aiChats).toBe(false)
    expect(next.favorites).toEqual(['/lib/b.md'])
    expect(next.hidden).toEqual([])
    // Recent folders are library roots, not files - they must survive a file purge.
    expect(next.recentFolders).toEqual(['/lib', '/other'])
  })

  it('is a no-op for an unknown path and does not mutate the input', () => {
    const state = makeState()
    const next = purgeState(state, '/lib/zzz.md')
    expect(next.favorites).toEqual(['/lib/a.md', '/lib/b.md'])
    expect(state.favorites).toEqual(['/lib/a.md', '/lib/b.md']) // input untouched
    expect(next.lastFile).toBe('/lib/a.md')
  })
})

describe('missingRefs', () => {
  it('returns only paths absent from the existing set, de-duplicated', () => {
    const refs = ['/lib/a.md', '/lib/b.md', '/lib/a.md', '/lib/c.md']
    const existing = new Set(['/lib/b.md'])
    expect(missingRefs(refs, existing).sort()).toEqual(['/lib/a.md', '/lib/c.md'])
  })

  it('returns empty when all refs exist', () => {
    expect(missingRefs(['/x'], new Set(['/x']))).toEqual([])
  })
})
