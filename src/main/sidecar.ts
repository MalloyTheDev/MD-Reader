import { promises as fs } from 'fs'
import { join, relative, sep, isAbsolute } from 'path'
import type { FileSidecar } from '../shared/types'
import * as store from './store'

interface SidecarShape {
  version: number
  files: Record<string, FileSidecar> // keyed by POSIX relative path within the library
}

const SIDECAR_DIR = '.mdreader'
const SIDECAR_FILE = 'data.json'

const caches = new Map<string, SidecarShape>()
const writeTimers = new Map<string, NodeJS.Timeout>()

function sidecarPath(root: string): string {
  return join(root, SIDECAR_DIR, SIDECAR_FILE)
}

function relKey(root: string, abs: string): string {
  return relative(root, abs).split(sep).join('/')
}

function isInside(root: string, abs: string): boolean {
  const rel = relative(root, abs)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

async function readRaw(root: string): Promise<SidecarShape | null> {
  try {
    const raw = await fs.readFile(sidecarPath(root), 'utf8')
    const parsed = JSON.parse(raw, (k, v) => (k === '__proto__' ? undefined : v))
    if (parsed && typeof parsed === 'object' && parsed.files && typeof parsed.files === 'object') {
      return {
        version: typeof parsed.version === 'number' ? parsed.version : 1,
        files: parsed.files
      }
    }
  } catch {
    /* missing or unparseable — treat as absent */
  }
  return null
}

/** One-time migration of notes from the central config (keyed by absolute path). */
async function migrateFromConfig(root: string): Promise<SidecarShape> {
  const shape: SidecarShape = { version: 1, files: {} }
  try {
    const state = await store.getState()
    const ensure = (abs: string): FileSidecar => (shape.files[relKey(root, abs)] ??= {})
    for (const [abs, list] of Object.entries(state.annotations ?? {})) {
      if (isInside(root, abs) && Array.isArray(list) && list.length) ensure(abs).annotations = list
    }
    for (const [abs, list] of Object.entries(state.bookmarks ?? {})) {
      if (isInside(root, abs) && Array.isArray(list) && list.length) ensure(abs).bookmarks = list
    }
    for (const [abs, pos] of Object.entries(state.positions ?? {})) {
      if (isInside(root, abs) && pos) ensure(abs).position = pos
    }
  } catch {
    /* no prior config — fine */
  }
  return shape
}

async function flush(root: string): Promise<void> {
  const shape = caches.get(root)
  if (!shape) return
  try {
    await fs.mkdir(join(root, SIDECAR_DIR), { recursive: true })
    await fs.writeFile(sidecarPath(root), JSON.stringify(shape, null, 2), 'utf8')
  } catch {
    /* disk may be read-only; notes still live in memory this session */
  }
}

function scheduleFlush(root: string): void {
  const existing = writeTimers.get(root)
  if (existing) clearTimeout(existing)
  writeTimers.set(
    root,
    setTimeout(() => {
      writeTimers.delete(root)
      void flush(root)
    }, 300)
  )
}

/** Load all per-file notes for a library, re-keyed to absolute paths for the renderer. */
export async function loadSidecar(root: string): Promise<Record<string, FileSidecar>> {
  let shape = caches.get(root)
  if (!shape) {
    const existing = await readRaw(root)
    if (existing) {
      shape = existing
      caches.set(root, shape)
    } else {
      shape = await migrateFromConfig(root)
      caches.set(root, shape)
      if (Object.keys(shape.files).length > 0) await flush(root)
    }
  }
  const out: Record<string, FileSidecar> = {}
  for (const [rel, data] of Object.entries(shape.files)) {
    out[join(root, rel.split('/').join(sep))] = data
  }
  return out
}

/** Persist the notes for a single file (annotations, bookmarks, reading position). */
export async function saveSidecarFile(root: string, abs: string, data: FileSidecar): Promise<void> {
  if (!isInside(root, abs)) return
  let shape = caches.get(root)
  if (!shape) {
    shape = (await readRaw(root)) ?? { version: 1, files: {} }
    caches.set(root, shape)
  }
  const key = relKey(root, abs)
  const entry: FileSidecar = {}
  if (data.annotations && data.annotations.length) entry.annotations = data.annotations
  if (data.bookmarks && data.bookmarks.length) entry.bookmarks = data.bookmarks
  if (data.position) entry.position = data.position
  if (Object.keys(entry).length === 0) delete shape.files[key]
  else shape.files[key] = entry
  scheduleFlush(root)
}
