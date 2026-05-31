// Tauri implementation of the MdReaderApi (window.api) contract.
//
// The Electron build provides window.api through the preload bridge (src/preload/index.ts).
// Under Tauri there is no preload, so this module implements the SAME typed interface by
// mapping each method onto a single named Tauri `invoke` (request/reply) or `listen` (the
// three event subscriptions). Importing this module installs window.api.
//
// Conventions (Tauri 2): invoke args are passed as a camelCase object and Tauri maps the
// keys onto the command's snake_case Rust params. `listen` from @tauri-apps/api/event is
// async and resolves to an unlisten function; the MdReaderApi event methods are synchronous
// and return an unsubscribe closure, so each one bridges the async listen behind a sync
// unsubscribe (see `bridge`). This is the ONLY backend surface exposed to the renderer:
// every method is one named command, with no generic invoke passthrough.

import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { AiEvent, AiRequest, MdReaderApi } from '@shared/types'

// Bridge an async Tauri event subscription behind the synchronous unsubscribe closure that
// MdReaderApi callers expect. If the caller unsubscribes before `listen` resolves, the real
// unlisten runs as soon as it arrives.
function bridge<T>(event: string, cb: (payload: T) => void): () => void {
  let unlisten: UnlistenFn | null = null
  let cancelled = false
  listen<T>(event, (e) => cb(e.payload))
    .then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    })
    .catch(() => {
      /* listen failed (backend not ready); nothing to clean up */
    })
  return () => {
    cancelled = true
    unlisten?.()
    unlisten = null
  }
}

const api: MdReaderApi = {
  // Files / vault / folders
  pickFolder: () => invoke('pick_folder'),
  openVault: () => invoke('open_vault'),
  createFolder: (name) => invoke('create_folder', { name }),
  importFiles: (subdir) => invoke('import_files', { subdir }),
  importFolder: () => invoke('import_folder'),
  digestProject: () => invoke('digest_project'),
  listMarkdown: (folderPath) => invoke('list_markdown', { folderPath }),
  readAll: (folderPath) => invoke('read_all', { folderPath }),
  readFile: (filePath) => invoke('read_file', { filePath }),
  writeFile: (filePath, content) => invoke('write_file', { filePath, content }),
  newFile: (folderPath, name) => invoke('new_file', { folderPath, name }),
  trashFile: (filePath) => invoke('trash_file', { filePath }),
  trashFolder: (folderRel) => invoke('trash_folder', { folderRel }),
  checkMissing: (paths) => invoke('check_missing', { paths }),
  createCourse: (opts) => invoke('create_course', { opts }),
  // bytes are sent as a plain number array so they survive JSON arg encoding into a Rust Vec<u8>.
  saveImage: (opts) =>
    invoke('save_image', {
      opts: { baseDir: opts.baseDir, name: opts.name, data: Array.from(opts.data) }
    }),

  // Settings / state / sidecars
  getSettings: () => invoke('get_settings'),
  setSettings: (patch) => invoke('set_settings', { patch }),
  getState: () => invoke('get_state'),
  setState: (patch) => invoke('set_state', { patch }),
  sidecarLoad: (folderPath) => invoke('sidecar_load', { folderPath }),
  sidecarSave: (filePath, data) => invoke('sidecar_save', { filePath, data }),

  // Shell / window / app
  openExternal: (url) => invoke('open_external', { url }),
  showItem: (base, p) => invoke('show_item', { base, p }),
  onLibraryChanged: (cb) => bridge<unknown>('library:changed', () => cb()),
  onOpenPath: (cb) => bridge<string>('app:openPath', (filePath) => cb(filePath)),
  getPendingOpenPath: () => invoke('get_pending_open_path'),

  // AI
  aiStatus: (provider) => invoke('ai_status', { provider }),
  aiSetKey: (provider, key) => invoke('ai_set_key', { provider, key }),
  aiClearKey: (provider) => invoke('ai_clear_key', { provider }),
  aiListModels: (provider, baseUrl, refresh) =>
    invoke('ai_list_models', { provider, baseUrl, refresh }),
  aiRun: (request: AiRequest) => invoke('ai_run', { request }),
  aiCancel: (runId) => invoke('ai_cancel', { runId }),
  onAiEvent: (cb) => bridge<AiEvent>('ai:event', (ev) => cb(ev)),

  // Export
  exportSave: (opts) => invoke('export_save', { opts }),
  exportDocx: (opts) => invoke('export_docx', { opts })
}

export const tauriApi = api

// Install as window.api so the entire renderer (App + components) talks to the Tauri backend
// through the exact same surface it used under Electron - no component code changes.
window.api = api
