import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings, AiProvider, ThemeName } from '@shared/types'

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

// Validate/clamp an imported settings object so a hand-edited or malformed JSON can't put the
// app into a broken state (out-of-range numbers, bogus enums, non-color accent strings).
export function sanitizeImported(data: unknown): Partial<AppSettings> {
  if (!data || typeof data !== 'object') return {}
  const d = data as Record<string, unknown>
  const out: Partial<AppSettings> = {}
  const num = (k: keyof AppSettings, lo: number, hi: number): void => {
    if (typeof d[k] === 'number' && Number.isFinite(d[k]))
      out[k] = clamp(d[k] as number, lo, hi) as never
  }
  const bool = (k: keyof AppSettings): void => {
    if (typeof d[k] === 'boolean') out[k] = d[k] as never
  }
  const oneOf = <T,>(k: keyof AppSettings, allowed: readonly T[]): void => {
    if (allowed.includes(d[k] as T)) out[k] = d[k] as never
  }
  oneOf('theme', ['light', 'sepia', 'dark', 'nord', 'contrast'])
  oneOf('fontFamily', ['serif', 'sans', 'dyslexic'])
  oneOf('pageAnimation', ['off', 'fast', 'smooth'])
  oneOf('uiDensity', ['comfortable', 'compact'])
  oneOf('aiModel', ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'])
  num('fontSizePx', 14, 30)
  num('readingWidthCh', 50, 100)
  num('lineHeight', 1.2, 2.4)
  num('rulerOpacity', 4, 40)
  num('rulerHeight', 20, 80)
  num('letterSpacing', 0, 6)
  num('paragraphSpacing', 60, 200)
  num('margins', 50, 200)
  oneOf('fontWeight', [300, 400, 500, 600])
  for (const k of [
    'accentEnabled',
    'twoPage',
    'allowRemoteImages',
    'focusRuler',
    'justify',
    'autosave',
    'aiSummaryOnOpen'
  ] as const) {
    bool(k)
  }
  if (d.accent === '' || (typeof d.accent === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(d.accent))) {
    out.accent = d.accent as string
  }
  return out
}

interface Props {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
  onReset: () => void
  initialCategory?: string
  onClose: () => void
}

const THEMES: { key: ThemeName; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'sepia', label: 'Sepia' },
  { key: 'dark', label: 'Dark' },
  { key: 'nord', label: 'Nord' },
  { key: 'contrast', label: 'Contrast' }
]

const ACCENT_PRESETS = [
  '#1f6feb',
  '#0891b2',
  '#2e7d32',
  '#b58900',
  '#c2410c',
  '#d92662',
  '#7c3aed',
  '#475569'
]

function Toggle({
  on,
  onToggle,
  title
}: {
  on: boolean
  onToggle: () => void
  title?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={'toggle' + (on ? ' is-on' : '')}
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      title={title}
    >
      <span className="toggle-knob" />
    </button>
  )
}

function Seg<T extends string | number>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}): React.JSX.Element {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={'seg-btn' + (value === o.value ? ' is-active' : '')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function AiSettings({
  settings,
  onChange
}: {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
}): React.JSX.Element {
  const provider = settings.aiProvider
  const needsKey = provider !== 'ollama'
  const needsUrl = provider === 'ollama' || provider === 'custom'
  const [configured, setConfigured] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [keyInput, setKeyInput] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.api.aiStatus(provider).then((s) => {
      if (!cancelled) setConfigured(s.configured)
    })
    void window.api
      .aiListModels(provider, settings.aiBaseUrl)
      .then((m) => {
        if (!cancelled) setModels(m)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [provider, settings.aiBaseUrl])

  const refresh = async (): Promise<void> => {
    setConfigured((await window.api.aiStatus(provider)).configured)
  }
  const saveKey = async (): Promise<void> => {
    if (!keyInput.trim()) return
    setBusy(true)
    await window.api.aiSetKey(provider, keyInput.trim())
    setKeyInput('')
    setBusy(false)
    await refresh()
  }
  const removeKey = async (): Promise<void> => {
    await window.api.aiClearKey(provider)
    await refresh()
  }

  return (
    <div className="ai-settings">
      <div className="settings-row">
        <span className="settings-label">Provider</span>
        <Seg<AiProvider>
          value={provider}
          onChange={(v) => onChange({ aiProvider: v })}
          options={[
            { value: 'anthropic', label: 'Anthropic' },
            { value: 'openai', label: 'OpenAI' },
            { value: 'ollama', label: 'Ollama' },
            { value: 'custom', label: 'Custom' }
          ]}
        />
      </div>
      {needsUrl && (
        <div className="settings-row">
          <span className="settings-label">Base URL</span>
          <input
            className="sv-text"
            value={settings.aiBaseUrl}
            placeholder={provider === 'ollama' ? 'http://localhost:11434/v1' : 'https://…/v1'}
            onChange={(e) => onChange({ aiBaseUrl: e.target.value })}
            spellCheck={false}
          />
        </div>
      )}
      {needsKey && (
        <div className="settings-row">
          <span className="settings-label">
            API key {configured && <span className="ai-key-ok">✓ saved</span>}
          </span>
          <div className="ai-key-row">
            <input
              type="password"
              className="sv-text"
              placeholder={configured ? '•••••• (saved)' : 'paste API key'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-small"
              disabled={!keyInput.trim() || busy}
              onClick={() => void saveKey()}
            >
              Save
            </button>
            {configured && (
              <button type="button" className="btn btn-small" onClick={() => void removeKey()}>
                Remove
              </button>
            )}
          </div>
        </div>
      )}
      <div className="settings-row">
        <span className="settings-label">Model</span>
        <div className="ai-model-row">
          {models.length > 0 && (
            <select
              className="sv-text"
              value={models.includes(settings.aiModel) ? settings.aiModel : ''}
              onChange={(e) => e.target.value && onChange({ aiModel: e.target.value })}
            >
              <option value="">{provider === 'ollama' ? '- installed -' : '- presets -'}</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
          <input
            className="sv-text"
            value={settings.aiModel}
            placeholder="model name"
            onChange={(e) => onChange({ aiModel: e.target.value })}
            spellCheck={false}
          />
        </div>
      </div>
      <p className="sv-hint">
        {provider === 'ollama'
          ? 'Runs on your machine via Ollama - no key, fully private.'
          : needsKey
            ? 'Stored encrypted on this computer; sent only to the provider you choose.'
            : ''}
      </p>
    </div>
  )
}

interface SvField {
  label: string
  node: React.ReactNode
  full?: boolean
}
interface SvSection {
  id: string
  fields: SvField[]
}

export function SettingsView({
  settings,
  onChange,
  onReset,
  initialCategory,
  onClose
}: Props): React.JSX.Element {
  const [cat, setCat] = useState(initialCategory ?? 'Appearance')
  const [q, setQ] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const accentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onAccentInput = (v: string): void => {
    document.documentElement.style.setProperty('--accent', v)
    if (accentTimer.current) clearTimeout(accentTimer.current)
    accentTimer.current = setTimeout(() => onChange({ accent: v }), 200)
  }
  useEffect(
    () => () => {
      if (accentTimer.current) clearTimeout(accentTimer.current)
    },
    []
  )

  const exportSettings = (): void => {
    void window.api.exportSave({
      defaultName: 'md-reader-settings.json',
      content: JSON.stringify(settings, null, 2),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
  }

  const importSettings = async (file: File): Promise<void> => {
    try {
      const patch = sanitizeImported(JSON.parse(await file.text()))
      if (Object.keys(patch).length) onChange(patch)
    } catch {
      /* ignore malformed file */
    }
  }

  const sections = useMemo<SvSection[]>(() => {
    const s = settings
    return [
      {
        id: 'Appearance',
        fields: [
          {
            label: 'Theme',
            node: (
              <Seg
                value={s.theme}
                onChange={(v) => onChange({ theme: v })}
                options={THEMES.map((t) => ({ value: t.key, label: t.label }))}
              />
            )
          },
          {
            label: 'Accent color',
            node: (
              <Toggle
                on={s.accentEnabled}
                onToggle={() => onChange({ accentEnabled: !s.accentEnabled })}
                title="Turn the colored accent on or off (off uses a neutral gray)"
              />
            )
          },
          ...(s.accentEnabled
            ? [
                {
                  label: 'Accent swatches',
                  node: (
                    <div className="accent-row">
                      <div className="accent-presets">
                        {ACCENT_PRESETS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={'accent-swatch' + (s.accent === c ? ' is-active' : '')}
                            style={{ background: c }}
                            onClick={() => onChange({ accent: c })}
                            aria-label={'Accent ' + c}
                          />
                        ))}
                      </div>
                      <div className="accent-pick">
                        <input
                          type="color"
                          value={s.accent || '#1f6feb'}
                          onChange={(e) => onAccentInput(e.target.value)}
                        />
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => onChange({ accent: '' })}
                        >
                          theme
                        </button>
                      </div>
                    </div>
                  )
                }
              ]
            : []),
          {
            label: 'Reading font',
            node: (
              <Seg
                value={s.fontFamily}
                onChange={(v) => onChange({ fontFamily: v })}
                options={[
                  { value: 'serif', label: 'Serif' },
                  { value: 'sans', label: 'Sans' },
                  { value: 'dyslexic', label: 'Easy' }
                ]}
              />
            )
          },
          {
            label: 'Interface density',
            node: (
              <Seg
                value={s.uiDensity}
                onChange={(v) => onChange({ uiDensity: v })}
                options={[
                  { value: 'comfortable', label: 'Comfortable' },
                  { value: 'compact', label: 'Compact' }
                ]}
              />
            )
          }
        ]
      },
      {
        id: 'Reading',
        fields: [
          {
            label: 'Font size',
            node: (
              <div className="stepper">
                <button
                  type="button"
                  onClick={() => onChange({ fontSizePx: Math.max(14, s.fontSizePx - 1) })}
                  aria-label="Decrease font size"
                >
                  −
                </button>
                <span className="stepper-value">{s.fontSizePx}px</span>
                <button
                  type="button"
                  onClick={() => onChange({ fontSizePx: Math.min(30, s.fontSizePx + 1) })}
                  aria-label="Increase font size"
                >
                  +
                </button>
              </div>
            )
          },
          {
            label: 'Reading width',
            node: (
              <input
                type="range"
                min={50}
                max={100}
                value={s.readingWidthCh}
                onChange={(e) => onChange({ readingWidthCh: Number(e.target.value) })}
              />
            )
          },
          {
            label: 'Line height',
            node: (
              <input
                type="range"
                min={12}
                max={24}
                value={Math.round(s.lineHeight * 10)}
                onChange={(e) => onChange({ lineHeight: Number(e.target.value) / 10 })}
              />
            )
          },
          {
            label: 'Page margins',
            node: (
              <input
                type="range"
                min={50}
                max={200}
                step={10}
                value={s.margins}
                onChange={(e) => onChange({ margins: Number(e.target.value) })}
              />
            )
          },
          {
            label: 'Two-page (wide)',
            node: <Toggle on={s.twoPage} onToggle={() => onChange({ twoPage: !s.twoPage })} />
          },
          {
            label: 'Page turn',
            node: (
              <Seg
                value={s.pageAnimation}
                onChange={(v) => onChange({ pageAnimation: v })}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'fast', label: 'Fast' },
                  { value: 'smooth', label: 'Smooth' }
                ]}
              />
            )
          },
          {
            label: 'Focus ruler',
            node: (
              <Toggle on={s.focusRuler} onToggle={() => onChange({ focusRuler: !s.focusRuler })} />
            )
          },
          ...(s.focusRuler
            ? [
                {
                  label: 'Ruler height',
                  node: (
                    <input
                      type="range"
                      min={20}
                      max={80}
                      value={s.rulerHeight}
                      onChange={(e) => onChange({ rulerHeight: Number(e.target.value) })}
                    />
                  )
                },
                {
                  label: 'Ruler strength',
                  node: (
                    <input
                      type="range"
                      min={4}
                      max={40}
                      value={s.rulerOpacity}
                      onChange={(e) => onChange({ rulerOpacity: Number(e.target.value) })}
                    />
                  )
                }
              ]
            : []),
          {
            label: 'Remote images',
            node: (
              <Toggle
                on={s.allowRemoteImages}
                onToggle={() => onChange({ allowRemoteImages: !s.allowRemoteImages })}
                title="Load images from the web (off by default to avoid tracking)"
              />
            )
          }
        ]
      },
      {
        id: 'Typography',
        fields: [
          {
            label: 'Font weight',
            node: (
              <Seg
                value={s.fontWeight}
                onChange={(v) => onChange({ fontWeight: v })}
                options={[
                  { value: 300, label: 'Light' },
                  { value: 400, label: 'Normal' },
                  { value: 500, label: 'Medium' },
                  { value: 600, label: 'Semibold' }
                ]}
              />
            )
          },
          {
            label: 'Letter spacing',
            node: (
              <input
                type="range"
                min={0}
                max={6}
                value={s.letterSpacing}
                onChange={(e) => onChange({ letterSpacing: Number(e.target.value) })}
              />
            )
          },
          {
            label: 'Paragraph spacing',
            node: (
              <input
                type="range"
                min={60}
                max={200}
                step={10}
                value={s.paragraphSpacing}
                onChange={(e) => onChange({ paragraphSpacing: Number(e.target.value) })}
              />
            )
          },
          {
            label: 'Justify text',
            node: <Toggle on={s.justify} onToggle={() => onChange({ justify: !s.justify })} />
          }
        ]
      },
      {
        id: 'Behavior',
        fields: [
          {
            label: 'Autosave while editing',
            node: <Toggle on={s.autosave} onToggle={() => onChange({ autosave: !s.autosave })} />
          },
          {
            label: 'AI summary on open',
            node: (
              <Toggle
                on={s.aiSummaryOnOpen}
                onToggle={() => onChange({ aiSummaryOnOpen: !s.aiSummaryOnOpen })}
                title="Automatically summarize each document when you open it (uses your API key)"
              />
            )
          }
        ]
      },
      {
        id: 'AI',
        fields: [
          {
            label: 'Provider, API key, and model',
            full: true,
            node: <AiSettings settings={s} onChange={onChange} />
          }
        ]
      }
    ]
  }, [settings]) // eslint-disable-line react-hooks/exhaustive-deps

  const query = q.trim().toLowerCase()
  const visibleSections = sections
    .map((sec) => ({
      ...sec,
      fields: query ? sec.fields.filter((f) => f.label.toLowerCase().includes(query)) : sec.fields
    }))
    .filter((sec) => (query ? sec.fields.length > 0 : sec.id === cat))

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="settings-view" role="dialog" aria-label="Settings">
        <div className="sv-head">
          <h2>Settings</h2>
          <input
            className="sv-search"
            type="search"
            placeholder="Search settings…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            spellCheck={false}
          />
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="sv-body">
          {!query && (
            <nav className="sv-nav">
              {sections.map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  className={'sv-nav-item' + (cat === sec.id ? ' is-active' : '')}
                  onClick={() => setCat(sec.id)}
                >
                  {sec.id}
                </button>
              ))}
            </nav>
          )}
          <div className="sv-content">
            {visibleSections.map((sec) => (
              <section key={sec.id} className="sv-section">
                {query && <h3 className="sv-section-title">{sec.id}</h3>}
                {sec.fields.map((f) =>
                  f.full ? (
                    <div key={f.label} className="settings-row settings-row-full">
                      {f.node}
                    </div>
                  ) : (
                    <div key={f.label} className="settings-row">
                      <span className="settings-label">{f.label}</span>
                      {f.node}
                    </div>
                  )
                )}
              </section>
            ))}
            {visibleSections.length === 0 && <p className="sv-empty">No settings match “{q}”.</p>}
          </div>
        </div>
        <div className="sv-foot">
          <button type="button" className="btn btn-small" onClick={onReset}>
            Reset to defaults
          </button>
          <span className="sv-foot-right">
            <button type="button" className="btn btn-small" onClick={exportSettings}>
              Export
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => fileRef.current?.click()}
            >
              Import
            </button>
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importSettings(f)
              e.target.value = ''
            }}
          />
        </div>
      </div>
    </>
  )
}
