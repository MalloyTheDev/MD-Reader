export interface MarkdownFileMeta {
  name: string
  relativePath: string
  absolutePath: string
  size: number
  mtimeMs: number
}

export interface MarkdownFileContent {
  absolutePath: string
  relativePath: string
  name: string
  content: string
  title?: string | null
  author?: string | null
}

export interface ReadFileResult {
  content: string
  raw: string
  baseDir: string
  title: string | null
  author: string | null
}

// v2 identity reduces the palette to two themes - the v1 'sepia' / 'nord' / 'contrast' are gone.
// Exported as a const tuple so the runtime sanitizer in SettingsView can drive its allowlist off
// the same source of truth, preventing future type-vs-runtime drift.
export const THEME_NAMES = ['light', 'dark'] as const
export type ThemeName = (typeof THEME_NAMES)[number]

export interface AppSettings {
  theme: ThemeName
  fontSizePx: number
  readingWidthCh: number
  lineHeight: number
  twoPage: boolean
  aiProvider: AiProvider
  aiModel: string
  aiBaseUrl: string
  allowRemoteImages: boolean
  fontFamily: 'serif' | 'sans' | 'dyslexic'
  accent: string
  accentEnabled: boolean
  pageAnimation: 'off' | 'fast' | 'smooth'
  focusRuler: boolean
  rulerOpacity: number
  rulerHeight: number
  fontWeight: number
  letterSpacing: number
  paragraphSpacing: number
  margins: number
  uiDensity: 'comfortable' | 'compact'
  justify: boolean
  autosave: boolean
  aiSummaryOnOpen: boolean
}

export type AiAction =
  | 'summarize'
  | 'ask'
  | 'explain'
  | 'flashcards'
  | 'library'
  | 'studyguide'
  | 'quiz'
  | 'suggestlinks'
  | 'keyterms'
  | 'eli5'
  | 'critique'
  | 'repurpose'
  | 'write'
  | 'organize'
  | 'courseoutline'
  | 'courselesson'
  | 'readme'
  | 'translate'
  | 'tone'
  | 'tasks'
  | 'diagram'

/** Target formats for the "Repurpose a document" generative feature. */
export type RepurposeFormat = 'onepager' | 'blog' | 'exec' | 'slides' | 'lesson'

/** Modes for the editor writing assistant (operates on a text selection). */
export type WriteMode = 'rewrite' | 'expand' | 'grammar' | 'continue'

/** Target tone for the "Tone & style rewrite" action. */
export type ToneStyle = 'formal' | 'casual' | 'concise' | 'persuasive'

/** Output kind for the "Text to diagram or table" action. */
export type DiagramKind = 'mermaid' | 'table'

export interface AiTurn {
  role: 'user' | 'assistant'
  text: string
}

export type AiProvider = 'anthropic' | 'openai' | 'ollama' | 'custom'

export interface AiRequest {
  runId: string
  action: AiAction
  provider: AiProvider
  model: string
  baseUrl?: string
  doc: string
  question?: string
  selection?: string
  history?: AiTurn[]
  context?: string
  titles?: string[]
  repurposeFormat?: RepurposeFormat
  writeMode?: WriteMode
  language?: string
  tone?: ToneStyle
  diagramKind?: DiagramKind
}

export interface AiUsage {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  costUsd: number
}

export interface AiEvent {
  runId: string
  kind: 'chunk' | 'done' | 'error'
  text?: string
  error?: string
  usage?: AiUsage
}

export interface AiStatus {
  available: boolean
  configured: boolean
}

export interface ReadingPosition {
  page: number
  anchorId: string | null
  progress?: number
  updatedAt?: number
}

export interface Bookmark {
  id: string
  anchorId: string | null
  page: number
  label: string
  createdAt: number
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink'

export interface CardSchedule {
  question: string
  ease: number
  intervalDays: number
  due: number
  reps: number
}

export interface Annotation {
  id: string
  start: number
  end: number
  color: HighlightColor
  text: string
  note?: string
  card?: CardSchedule
  createdAt: number
}

export interface PersistedState {
  lastFolder: string | null
  lastFile: string | null
  positions: Record<string, ReadingPosition>
  bookmarks: Record<string, Bookmark[]>
  annotations: Record<string, Annotation[]>
  aiChats: Record<string, AiTurn[]>
  favorites: string[]
  /** Absolute paths hidden from the library ("Remove from Library") without deleting from disk. */
  hidden: string[]
  /** Recently opened library root folders, most-recent first - for quick switching back. */
  recentFolders: string[]
}

/** Per-file notes stored in the library's .mdreader/data.json sidecar so they travel with the folder. */
export interface FileSidecar {
  annotations?: Annotation[]
  bookmarks?: Bookmark[]
  position?: ReadingPosition | null
}

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  fontSizePx: 19,
  readingWidthCh: 72,
  lineHeight: 1.7,
  twoPage: true,
  aiProvider: 'anthropic',
  aiModel: 'claude-opus-4-7',
  aiBaseUrl: '',
  allowRemoteImages: false,
  fontFamily: 'serif',
  accent: '',
  accentEnabled: true,
  pageAnimation: 'fast',
  focusRuler: false,
  rulerOpacity: 14,
  rulerHeight: 38,
  fontWeight: 400,
  letterSpacing: 0,
  paragraphSpacing: 100,
  margins: 100,
  uiDensity: 'comfortable',
  justify: false,
  autosave: false,
  aiSummaryOnOpen: false
}

export const DEFAULT_STATE: PersistedState = {
  lastFolder: null,
  lastFile: null,
  positions: {},
  bookmarks: {},
  annotations: {},
  aiChats: {},
  favorites: [],
  hidden: [],
  recentFolders: []
}

/** The API surface exposed to the renderer via the preload contextBridge. */
export interface MdReaderApi {
  pickFolder(): Promise<string | null>
  openVault(): Promise<string>
  createFolder(name: string): Promise<string | null>
  importFiles(subdir: string): Promise<number>
  importFolder(): Promise<number>
  digestProject(): Promise<{ name: string; digest: string; fileCount: number } | null>
  listMarkdown(folderPath: string): Promise<MarkdownFileMeta[]>
  readAll(folderPath: string): Promise<MarkdownFileContent[]>
  readFile(filePath: string): Promise<ReadFileResult>
  writeFile(filePath: string, content: string): Promise<void>
  newFile(folderPath: string, name: string): Promise<string | null>
  trashFile(filePath: string): Promise<{ ok: boolean; error?: string }>
  trashFolder(folderRel: string): Promise<{ ok: boolean; error?: string }>
  checkMissing(paths: string[]): Promise<string[]>
  createCourse(opts: {
    folderName: string
    files: { name: string; content: string }[]
  }): Promise<string | null>
  saveImage(opts: { baseDir: string; name: string; data: Uint8Array }): Promise<string>
  getSettings(): Promise<AppSettings>
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  getState(): Promise<PersistedState>
  setState(patch: Partial<PersistedState>): Promise<PersistedState>
  sidecarLoad(folderPath: string): Promise<Record<string, FileSidecar>>
  sidecarSave(filePath: string, data: FileSidecar): Promise<void>
  openExternal(url: string): Promise<void>
  showItem(base: string, p: string): Promise<boolean>
  onLibraryChanged(callback: () => void): () => void
  onOpenPath(callback: (filePath: string) => void): () => void
  getPendingOpenPath(): Promise<string | null>
  aiStatus(provider: AiProvider): Promise<AiStatus>
  aiSetKey(provider: AiProvider, key: string): Promise<boolean>
  aiClearKey(provider: AiProvider): Promise<void>
  aiListModels(provider: AiProvider, baseUrl?: string, refresh?: boolean): Promise<string[]>
  aiRun(request: AiRequest): Promise<void>
  aiCancel(runId: string): Promise<void>
  onAiEvent(callback: (event: AiEvent) => void): () => void
  exportSave(opts: {
    defaultName: string
    content: string
    filters: { name: string; extensions: string[] }[]
  }): Promise<boolean>
  exportDocx(opts: { defaultName: string; html: string }): Promise<boolean>
}
