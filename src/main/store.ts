import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import {
  AppSettings,
  PersistedState,
  WindowBounds,
  DEFAULT_SETTINGS,
  DEFAULT_STATE,
  THEME_NAMES
} from '../shared/types'

interface ConfigShape {
  settings: AppSettings
  state: PersistedState
  window: WindowBounds | null
  aiKeys: Record<string, string | null>
}

let cache: ConfigShape | null = null
let writeTimer: NodeJS.Timeout | null = null

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

async function load(): Promise<ConfigShape> {
  if (cache) return cache
  try {
    const raw = await fs.readFile(configPath(), 'utf8')
    const parsed = JSON.parse(raw, (k, v) => (k === '__proto__' ? undefined : v))
    // Migrate the old single `aiKey` (Anthropic-only) into the per-provider map.
    const aiKeys: Record<string, string | null> =
      parsed.aiKeys && typeof parsed.aiKeys === 'object'
        ? parsed.aiKeys
        : parsed.aiKey
          ? { anthropic: parsed.aiKey }
          : {}
    const settings = { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) }
    // A user upgrading from v1.5.0 may have a removed theme ('sepia'/'nord'/'contrast') persisted
    // on disk. Those have no v2 CSS, so clamp any unknown theme back to the default rather than
    // letting it reach the renderer and silently fall back to light.
    if (!THEME_NAMES.includes(settings.theme)) settings.theme = DEFAULT_SETTINGS.theme
    cache = {
      settings,
      state: { ...DEFAULT_STATE, ...(parsed.state ?? {}) },
      window: parsed.window ?? null,
      aiKeys
    }
  } catch {
    cache = {
      settings: { ...DEFAULT_SETTINGS },
      state: { ...DEFAULT_STATE },
      window: null,
      aiKeys: {}
    }
  }
  return cache
}

function scheduleWrite(): void {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    writeTimer = null
    if (cache) {
      fs.writeFile(configPath(), JSON.stringify(cache, null, 2)).catch(() => {})
    }
  }, 250)
}

export async function getSettings(): Promise<AppSettings> {
  return (await load()).settings
}

export async function setSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const c = await load()
  c.settings = { ...c.settings, ...patch }
  scheduleWrite()
  return c.settings
}

export async function getState(): Promise<PersistedState> {
  return (await load()).state
}

export async function setState(patch: Partial<PersistedState>): Promise<PersistedState> {
  const c = await load()
  c.state = { ...c.state, ...patch }
  scheduleWrite()
  return c.state
}

export async function getAiKeyBlob(provider: string): Promise<string | null> {
  return (await load()).aiKeys[provider] ?? null
}

export async function setAiKeyBlob(provider: string, blob: string | null): Promise<void> {
  const c = await load()
  if (blob) c.aiKeys[provider] = blob
  else delete c.aiKeys[provider]
  scheduleWrite()
}

export async function getWindowBounds(): Promise<WindowBounds | null> {
  return (await load()).window
}

export async function setWindowBounds(bounds: WindowBounds): Promise<void> {
  const c = await load()
  c.window = bounds
  scheduleWrite()
}
