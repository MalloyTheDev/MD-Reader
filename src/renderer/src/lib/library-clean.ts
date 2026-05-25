import type { PersistedState } from '@shared/types'

/**
 * Return a new PersistedState with every reference to `path` removed — used when a file is
 * deleted or removed from the library so it doesn't linger in favorites, recents, annotations, etc.
 * Pure (no mutation) so it's easy to test and safe to feed straight into `setState`.
 */
export function purgeState(state: PersistedState, path: string): PersistedState {
  const omit = <T>(rec: Record<string, T>): Record<string, T> => {
    if (!rec || !(path in rec)) return rec ?? {}
    const next = { ...rec }
    delete next[path]
    return next
  }
  return {
    ...state,
    lastFile: state.lastFile === path ? null : state.lastFile,
    positions: omit(state.positions),
    bookmarks: omit(state.bookmarks),
    annotations: omit(state.annotations),
    aiChats: omit(state.aiChats),
    favorites: (state.favorites ?? []).filter((p) => p !== path),
    hidden: (state.hidden ?? []).filter((p) => p !== path)
  }
}

/** Of `refs`, return the unique paths that are NOT present in `existing` (i.e. missing from disk). */
export function missingRefs(refs: string[], existing: Set<string>): string[] {
  return [...new Set(refs)].filter((p) => !existing.has(p))
}
