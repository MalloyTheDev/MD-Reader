// Pure path-safety helpers for the main process — no Electron / module state, so they can be
// unit-tested directly. Used by ipc.ts to confine file access to the open library root and to
// sanitize user/AI-supplied file & folder names.
import { relative, isAbsolute } from 'node:path'

// True if `abs` is inside (or equal to) `root`. Purely lexical: it rejects `..` traversal and
// absolute escapes, but does NOT resolve symlinks — callers that must defend against symlinked
// escapes (e.g. the mdimg:// protocol) additionally realpath-check before reading bytes.
export function isInside(root: string | null, abs: string): boolean {
  if (!root) return false
  const rel = relative(root, abs)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const ILLEGAL = new Set('\\/:*?"<>|')

// Sanitize a user/AI-supplied base file or folder name to a single safe path segment: strips
// control characters, path separators & illegal filename chars, neutralizes ".." traversal and
// leading/trailing dots/spaces, and avoids reserved Windows device names. Never returns empty.
export function safeSeg(name: string, fallback = 'Untitled'): string {
  let s = Array.from(name || '')
    .filter((ch) => ch.codePointAt(0)! >= 0x20 && !ILLEGAL.has(ch))
    .join('')
    .replace(/^[. ]+/, '')
    .replace(/[. ]+$/, '')
    .replace(/\.{2,}/g, '.')
    .trim()
  if (!s) return fallback
  if (WIN_RESERVED.test(s.split('.')[0])) s = '_' + s
  return s.slice(0, 120)
}
