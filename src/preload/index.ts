import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AiEvent,
  AiProvider,
  AiRequest,
  AiStatus,
  AppSettings,
  FileSidecar,
  MarkdownFileContent,
  MarkdownFileMeta,
  MdReaderApi,
  PersistedState,
  ReadFileResult
} from '../shared/types'

const api: MdReaderApi = {
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('library:pickFolder'),
  openVault: (): Promise<string> => ipcRenderer.invoke('library:openVault'),
  createFolder: (name: string): Promise<string | null> => ipcRenderer.invoke('folder:create', name),
  importFiles: (subdir: string): Promise<number> =>
    ipcRenderer.invoke('library:importFiles', subdir),
  importFolder: (): Promise<number> => ipcRenderer.invoke('library:importFolder'),
  digestProject: (): Promise<{ name: string; digest: string; fileCount: number } | null> =>
    ipcRenderer.invoke('project:digest'),
  listMarkdown: (folderPath: string): Promise<MarkdownFileMeta[]> =>
    ipcRenderer.invoke('library:listMarkdown', folderPath),
  readAll: (folderPath: string): Promise<MarkdownFileContent[]> =>
    ipcRenderer.invoke('library:readAll', folderPath),
  readFile: (filePath: string): Promise<ReadFileResult> =>
    ipcRenderer.invoke('file:read', filePath),
  writeFile: (filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke('file:write', filePath, content),
  newFile: (folderPath: string, name: string): Promise<string | null> =>
    ipcRenderer.invoke('file:newFile', folderPath, name),
  trashFile: (filePath: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('file:trash', filePath),
  trashFolder: (folderRel: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('folder:trash', folderRel),
  checkMissing: (paths: string[]): Promise<string[]> =>
    ipcRenderer.invoke('library:checkMissing', paths),
  createCourse: (opts: {
    folderName: string
    files: { name: string; content: string }[]
  }): Promise<string | null> => ipcRenderer.invoke('course:create', opts),
  saveImage: (opts: { baseDir: string; name: string; data: Uint8Array }): Promise<string> =>
    ipcRenderer.invoke('file:saveImage', opts),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:set', patch),
  getState: (): Promise<PersistedState> => ipcRenderer.invoke('state:get'),
  setState: (patch: Partial<PersistedState>): Promise<PersistedState> =>
    ipcRenderer.invoke('state:set', patch),
  sidecarLoad: (folderPath: string): Promise<Record<string, FileSidecar>> =>
    ipcRenderer.invoke('sidecar:load', folderPath),
  sidecarSave: (filePath: string, data: FileSidecar): Promise<void> =>
    ipcRenderer.invoke('sidecar:save', filePath, data),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  showItem: (base: string, p: string): Promise<boolean> =>
    ipcRenderer.invoke('shell:showItem', base, p),
  onLibraryChanged: (callback: () => void): (() => void) => {
    const listener = (_e: IpcRendererEvent): void => callback()
    ipcRenderer.on('library:changed', listener)
    return () => ipcRenderer.removeListener('library:changed', listener)
  },
  onOpenPath: (callback: (filePath: string) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, filePath: string): void => callback(filePath)
    ipcRenderer.on('app:openPath', listener)
    return () => ipcRenderer.removeListener('app:openPath', listener)
  },
  getPendingOpenPath: (): Promise<string | null> => ipcRenderer.invoke('app:getPendingOpenPath'),
  aiStatus: (provider: AiProvider): Promise<AiStatus> => ipcRenderer.invoke('ai:status', provider),
  aiSetKey: (provider: AiProvider, key: string): Promise<boolean> =>
    ipcRenderer.invoke('ai:setKey', provider, key),
  aiClearKey: (provider: AiProvider): Promise<void> => ipcRenderer.invoke('ai:clearKey', provider),
  aiListModels: (provider: AiProvider, baseUrl?: string): Promise<string[]> =>
    ipcRenderer.invoke('ai:listModels', provider, baseUrl),
  aiRun: (request: AiRequest): Promise<void> => ipcRenderer.invoke('ai:run', request),
  aiCancel: (runId: string): Promise<void> => ipcRenderer.invoke('ai:cancel', runId),
  onAiEvent: (callback: (event: AiEvent) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, ev: AiEvent): void => callback(ev)
    ipcRenderer.on('ai:event', listener)
    return () => ipcRenderer.removeListener('ai:event', listener)
  },
  exportSave: (opts: {
    defaultName: string
    content: string
    filters: { name: string; extensions: string[] }[]
  }): Promise<boolean> => ipcRenderer.invoke('export:save', opts),
  exportDocx: (opts: { defaultName: string; html: string }): Promise<boolean> =>
    ipcRenderer.invoke('export:docx', opts)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
