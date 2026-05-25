// Safe, dependency-free parser for ```chart fenced blocks. Supports a simple key:value spec
// or a JSON object. NO code execution - values are parsed as strings/numbers/arrays only.

export type ChartType = 'line' | 'bar' | 'pie' | 'scatter' | 'area'
export interface ChartSeries {
  name?: string
  data: number[]
}
export interface ChartSpec {
  type: ChartType
  title?: string
  x: (string | number)[]
  series: ChartSeries[]
}

const TYPES: ChartType[] = ['line', 'bar', 'pie', 'scatter', 'area']

// Hard cap on data points per series / labels. Guards against a malicious or accidental
// document with a huge array (e.g. 500k points) freezing the renderer with one SVG node each.
const MAX_POINTS = 2000

function parseScalar(v: string): string | number {
  const t = v.trim().replace(/^['"]|['"]$/g, '')
  if (t !== '' && !isNaN(Number(t))) return Number(t)
  return t
}

function parseArray(v: string): (string | number)[] {
  const inner = v.trim().replace(/^\[/, '').replace(/\]$/, '')
  if (inner.trim() === '') return []
  return inner.split(',').map((s) => parseScalar(s))
}

function nums(arr: (string | number)[]): number[] {
  // Coerce to numbers; map both NaN and non-finite (Infinity from e.g. "1e999") to 0 so they
  // never reach SVG geometry math.
  return arr
    .map((v) => (typeof v === 'number' ? v : Number(v)))
    .map((n) => (Number.isFinite(n) ? n : 0))
}

// Parse the simple "key: value" line format (value may be a [a, b, c] array).
function parseKeyValue(src: string): Record<string, string | number | (string | number)[]> {
  const obj: Record<string, string | number | (string | number)[]> = {}
  for (const line of src.split('\n')) {
    const m = /^\s*([A-Za-z][\w]*)\s*:\s*(.*)$/.exec(line)
    if (!m) continue
    const key = m[1].toLowerCase()
    const val = m[2].trim()
    obj[key] = val.startsWith('[') ? parseArray(val) : parseScalar(val)
  }
  return obj
}

function asArray(v: unknown): (string | number)[] {
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'number' ? x : String(x)))
  return []
}

export function parseChart(src: string): { spec: ChartSpec } | { error: string } {
  let raw: Record<string, unknown>
  const trimmed = src.trim()
  if (!trimmed) return { error: 'Empty chart block.' }
  try {
    raw = trimmed.startsWith('{')
      ? (JSON.parse(trimmed) as Record<string, unknown>)
      : (parseKeyValue(trimmed) as Record<string, unknown>)
  } catch {
    return { error: 'Could not parse the chart definition (invalid JSON).' }
  }

  const typeRaw = String(raw.type ?? 'bar').toLowerCase() as ChartType
  const type = TYPES.includes(typeRaw) ? typeRaw : 'bar'
  const title = raw.title != null ? String(raw.title) : undefined

  // Pie: labels + values (fall back to x + y).
  const x = asArray(raw.x ?? raw.labels)
  const series: ChartSeries[] = []
  const names = asArray(raw.series ?? raw.names ?? raw.legend).map(String)

  if (type === 'pie') {
    const values = nums(asArray(raw.values ?? raw.y ?? raw.data))
    if (values.length) series.push({ data: values })
  } else {
    // Collect y, y2, y3, … plus an explicit `values`/`data`.
    for (const key of ['y', 'y1', 'y2', 'y3', 'y4', 'y5', 'values', 'data']) {
      if (raw[key] != null && Array.isArray(raw[key])) {
        series.push({ data: nums(asArray(raw[key])) })
      }
    }
  }
  series.forEach((s, i) => {
    if (names[i]) s.name = names[i]
  })

  if (series.length === 0 || series.every((s) => s.data.length === 0)) {
    return { error: 'No numeric data found. Provide y: [..] (or values: [..] for pie).' }
  }
  if (type === 'pie') {
    const positive = (series[0]?.data ?? []).reduce((sum, v) => sum + Math.max(0, v), 0)
    if (positive <= 0) {
      return { error: 'Pie chart needs at least one positive value.' }
    }
  }
  // Clamp to MAX_POINTS so a pathological array can't spawn an unbounded number of SVG nodes.
  for (const s of series) {
    if (s.data.length > MAX_POINTS) s.data = s.data.slice(0, MAX_POINTS)
  }
  const xCapped = x.length > MAX_POINTS ? x.slice(0, MAX_POINTS) : x
  return { spec: { type, title, x: xCapped, series } }
}
