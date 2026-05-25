import { isValidElement, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Components } from 'react-markdown'
import { defaultUrlTransform } from 'react-markdown'
import type { PluggableList } from 'unified'
import { visit } from 'unist-util-visit'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeSlug from 'rehype-slug'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import 'katex/dist/katex.min.css'
import 'katex/dist/contrib/mhchem.mjs' // chemistry: \ce{...}, \pu{...}
import { parseChart, type ChartSpec } from './chart'

// Turn GitHub/Obsidian callouts ( > [!note] Title ) into styled blockquotes.

function rehypeCallouts() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any): void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit(tree, 'element', (node: any) => {
      if (node.tagName !== 'blockquote') return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const firstP = node.children.find((c: any) => c.type === 'element' && c.tagName === 'p')
      const firstText = firstP?.children?.[0]
      if (!firstText || firstText.type !== 'text') return
      const m = /^\[!(\w+)\]([+-])?\s*(.*)/.exec(firstText.value)
      if (!m) return
      const type = m[1].toLowerCase()
      const title = m[3]?.trim() || type.charAt(0).toUpperCase() + type.slice(1)
      firstText.value = firstText.value.replace(/^\[![^\]]+\][+-]?\s*.*(\n|$)/, '')
      node.properties = node.properties || {}
      node.properties.className = ['callout', 'callout-' + type]
      node.children.unshift({
        type: 'element',
        tagName: 'div',
        properties: { className: ['callout-title'] },
        children: [{ type: 'text', value: title }]
      })
    })
  }
}

// Wrap each display equation with a hover toolbar (copy LaTeX / expand). Runs after rehype-katex.
function rehypeMathActions() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any): void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit(tree, 'element', (node: any, index: number | undefined, parent: any) => {
      if (index == null || !parent) return
      const cls = node.properties?.className
      const arr = Array.isArray(cls) ? cls : cls ? [cls] : []
      if (!arr.includes('katex-display') || node.properties?.dataMathDone) return
      node.properties.dataMathDone = true
      let latex = ''
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      visit(node, 'element', (n: any) => {
        if (
          n.tagName === 'annotation' &&
          n.properties?.encoding === 'application/x-tex' &&
          n.children?.[0]
        ) {
          latex = String(n.children[0].value ?? '').trim()
        }
      })
      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['math-block'] },
        children: [
          {
            type: 'element',
            tagName: 'div',
            properties: { className: ['math-actions'] },
            children: [
              {
                type: 'element',
                tagName: 'button',
                properties: {
                  type: 'button',
                  className: ['math-copy'],
                  dataLatex: latex,
                  title: 'Copy as LaTeX'
                },
                children: [{ type: 'text', value: 'Copy LaTeX' }]
              },
              {
                type: 'element',
                tagName: 'button',
                properties: {
                  type: 'button',
                  className: ['math-expand'],
                  title: 'Expand equation'
                },
                children: [{ type: 'text', value: 'Expand' }]
              }
            ]
          },
          node
        ]
      }
    })
  }
}

// Turn [[Note]] and [[Note|alias]] into links with a wiki: URL.
function remarkWikiLinks() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any): void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit(tree, 'text', (node: any, index: number | undefined, parent: any) => {
      if (!parent || index == null || typeof node.value !== 'string' || !node.value.includes('[['))
        return
      const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts: any[] = []
      let last = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(node.value))) {
        if (m.index > last) parts.push({ type: 'text', value: node.value.slice(last, m.index) })
        const name = m[1].trim()
        const alias = (m[2] || m[1]).trim()
        parts.push({
          type: 'link',
          url: 'wiki:' + encodeURIComponent(name),
          children: [{ type: 'text', value: alias }]
        })
        last = m.index + m[0].length
      }
      if (parts.length === 0) return
      if (last < node.value.length) parts.push({ type: 'text', value: node.value.slice(last) })
      parent.children.splice(index, 1, ...parts)
      return index + parts.length
    })
  }
}

export const remarkPlugins: PluggableList = [remarkGfm, remarkMath, remarkWikiLinks]

// Convenience macros + resilient rendering (typos render in-place instead of throwing).
const katexOptions = {
  throwOnError: false,
  errorColor: '#cf222e',
  strict: 'ignore' as const,
  macros: {
    '\\RR': '\\mathbb{R}',
    '\\NN': '\\mathbb{N}',
    '\\ZZ': '\\mathbb{Z}',
    '\\QQ': '\\mathbb{Q}',
    '\\CC': '\\mathbb{C}',
    '\\abs': '\\left|#1\\right|',
    '\\norm': '\\left\\lVert#1\\right\\rVert',
    '\\set': '\\left\\{#1\\right\\}',
    '\\dd': '\\mathrm{d}',
    '\\eps': '\\varepsilon',
    '\\grad': '\\nabla',
    '\\To': '\\longrightarrow'
  }
}

export const rehypePlugins: PluggableList = [
  rehypeSlug,
  [rehypeKatex, katexOptions],
  rehypeMathActions,
  rehypeCallouts,
  [rehypeHighlight, { detect: true, ignoreMissing: true }]
]

// Preserve our custom wiki: scheme, which react-markdown's default transform strips.
export function urlTransform(url: string): string {
  if (url.startsWith('wiki:')) return url
  return defaultUrlTransform(url)
}

export function buildImageSrc(baseDir: string, src: string): string {
  if (!src) return src
  if (/^(https?:|data:|mdimg:|blob:)/i.test(src)) return src
  const clean = src.replace(/^file:\/\//i, '')
  return `mdimg://local/img?base=${encodeURIComponent(baseDir)}&p=${encodeURIComponent(clean)}`
}

function copyText(t: string): void {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(t).catch(() => fallbackCopy(t))
  } else {
    fallbackCopy(t)
  }
}
function fallbackCopy(t: string): void {
  const ta = document.createElement('textarea')
  ta.value = t
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try {
    document.execCommand('copy')
  } catch {
    /* ignore */
  }
  document.body.removeChild(ta)
}

function CodeBlock({ children }: { children?: React.ReactNode }): React.JSX.Element {
  const ref = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  let lang = ''
  if (isValidElement(children)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cn = ((children.props as any)?.className as string) ?? ''
    lang = /language-(\w+)/.exec(cn)?.[1] ?? ''
  }
  return (
    <div className="codeblock">
      {lang && lang !== 'mermaid' && <span className="code-lang">{lang}</span>}
      <button
        type="button"
        className="copy-btn"
        onClick={() => {
          copyText(ref.current?.innerText ?? '')
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre ref={ref}>{children}</pre>
    </div>
  )
}

// Defense-in-depth: mermaid runs with securityLevel 'strict', but its SVG output is still
// injected via innerHTML, so scrub scripts / event handlers / javascript: URLs before that.
export function sanitizeSvg(svg: string): string {
  try {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    if (doc.querySelector('parsererror') || !doc.documentElement) return ''
    doc.querySelectorAll('script').forEach((el) => el.remove())
    doc.querySelectorAll('*').forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase()
        const value = attr.value.replace(/\s+/g, '').toLowerCase()
        if (name.startsWith('on')) el.removeAttribute(attr.name)
        else if (
          (name === 'href' || name === 'xlink:href') &&
          (value.startsWith('javascript:') || value.startsWith('data:text/html'))
        ) {
          el.removeAttribute(attr.name)
        }
      }
    })
    return new XMLSerializer().serializeToString(doc.documentElement)
  } catch {
    return ''
  }
}

function downloadBlob(data: BlobPart, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function exportSvgAsPng(svg: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const img = new Image()
  img.onload = () => {
    const scale = 2
    const w = img.width || 1000
    const h = img.height || 700
    const canvas = document.createElement('canvas')
    canvas.width = w * scale
    canvas.height = h * scale
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)
      canvas.toBlob((b) => b && downloadBlob(b, 'image/png', filename), 'image/png')
    }
    URL.revokeObjectURL(url)
  }
  img.onerror = () => URL.revokeObjectURL(url)
  img.src = url
}

function MermaidView({
  svg,
  source,
  fullscreen,
  onFullscreen
}: {
  svg: string
  source: string
  fullscreen?: boolean
  onFullscreen: (on: boolean) => void
}): React.JSX.Element {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number } | null>(null)
  const reset = (): void => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }
  return (
    <div className={'mermaid-view' + (fullscreen ? ' is-fullscreen' : '')}>
      <div className="mermaid-toolbar">
        <button
          type="button"
          title="Zoom out"
          onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))}
        >
          −
        </button>
        <span className="mermaid-zoom">{Math.round(zoom * 100)}%</span>
        <button type="button" title="Zoom in" onClick={() => setZoom((z) => Math.min(5, z + 0.2))}>
          +
        </button>
        <button type="button" title="Reset view" onClick={reset}>
          ⟲
        </button>
        <button
          type="button"
          title={fullscreen ? 'Close fullscreen' : 'Open fullscreen'}
          onClick={() => onFullscreen(!fullscreen)}
        >
          {fullscreen ? '✕' : '⛶'}
        </button>
        <span className="mermaid-tool-sep" />
        <button type="button" title="Copy Mermaid source" onClick={() => copyText(source)}>
          Copy
        </button>
        <button
          type="button"
          title="Export as SVG"
          onClick={() => downloadBlob(svg, 'image/svg+xml', 'diagram.svg')}
        >
          SVG
        </button>
        <button
          type="button"
          title="Export as PNG"
          onClick={() => exportSvgAsPng(svg, 'diagram.png')}
        >
          PNG
        </button>
      </div>
      <div
        className="mermaid-viewport"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (drag.current) setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })
        }}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={reset}
      >
        <div
          className="mermaid-rendered"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  )
}

function MermaidBlock({ chart, theme }: { chart: string; theme: string }): React.JSX.Element {
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme:
            theme === 'dark' || theme === 'nord'
              ? 'dark'
              : theme === 'sepia'
                ? 'neutral'
                : 'default',
          securityLevel: 'strict'
        })
        const id = 'mmd-' + Math.random().toString(36).slice(2)
        const out = await mermaid.render(id, chart)
        if (cancelled) return
        setSvg(sanitizeSvg(out.svg))
        setError(null)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [chart, theme])

  // Let the paginator re-measure once the diagram lands.
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (svg && wrapRef.current) {
      wrapRef.current.dispatchEvent(new CustomEvent('md-content-resized', { bubbles: true }))
    }
  }, [svg])

  if (error) {
    return (
      <div className="mermaid-error-panel">
        <div className="mermaid-error-head">
          <span>⚠ Diagram failed to render</span>
          <button type="button" className="link-btn" onClick={() => copyText(chart)}>
            Copy source
          </button>
        </div>
        <pre className="mermaid-error-msg">{error}</pre>
        <details className="mermaid-error-src">
          <summary>View Mermaid source</summary>
          <pre>{chart}</pre>
        </details>
      </div>
    )
  }
  if (!svg) return <div className="mermaid-loading">Rendering diagram…</div>
  return (
    <div className="mermaid-block" ref={wrapRef}>
      <MermaidView svg={svg} source={chart} onFullscreen={setFullscreen} fullscreen={false} />
      {fullscreen &&
        createPortal(
          <div className="mermaid-fs-backdrop" onClick={() => setFullscreen(false)}>
            <div className="mermaid-fs" onClick={(e) => e.stopPropagation()}>
              <MermaidView svg={svg} source={chart} onFullscreen={setFullscreen} fullscreen />
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

const CHART_COLORS = [
  '#4a90d9',
  '#e8743b',
  '#19a979',
  '#945ecf',
  '#e6b30b',
  '#cd4b4b',
  '#39a0a0',
  '#c061cb'
]

export function ChartSvg({ spec }: { spec: ChartSpec }): React.JSX.Element {
  const W = 640
  const H = 340
  const L = 48
  const R = 16
  const T = spec.title ? 40 : 18
  const B = 38
  const iw = W - L - R
  const ih = H - T - B

  if (spec.type === 'pie') {
    const vals = spec.series[0].data.map((v) => Math.max(0, v))
    const total = vals.reduce((a, b) => a + b, 0) || 1
    const cx = W / 2
    const cy = T + ih / 2
    const rad = Math.min(iw, ih) / 2 - 8
    let acc = 0
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img">
        {spec.title && (
          <text x={W / 2} y={24} className="chart-title" textAnchor="middle">
            {spec.title}
          </text>
        )}
        {vals.map((v, i) => {
          const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2
          acc += v
          const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2
          const large = a1 - a0 > Math.PI ? 1 : 0
          const x0 = cx + rad * Math.cos(a0)
          const y0 = cy + rad * Math.sin(a0)
          const x1 = cx + rad * Math.cos(a1)
          const y1 = cy + rad * Math.sin(a1)
          const mid = (a0 + a1) / 2
          const lx = cx + (rad + 14) * Math.cos(mid)
          const ly = cy + (rad + 14) * Math.sin(mid)
          const label = String(spec.x[i] ?? '')
          return (
            <g key={i}>
              <path
                d={`M${cx},${cy} L${x0},${y0} A${rad},${rad} 0 ${large} 1 ${x1},${y1} Z`}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                stroke="var(--page-bg)"
                strokeWidth={1.5}
              />
              {label && (
                <text
                  x={lx}
                  y={ly}
                  className="chart-axis-label"
                  textAnchor={Math.cos(mid) < 0 ? 'end' : 'start'}
                >
                  {label} ({Math.round((v / total) * 100)}%)
                </text>
              )}
            </g>
          )
        })}
      </svg>
    )
  }

  const all = spec.series.flatMap((s) => s.data)
  // Reduce-based min/max (not Math.max(...all)) so an empty array can't yield ±Infinity and a
  // large one can't overflow the argument stack — defends ChartSvg even if parser invariants change.
  let yMax = all.length ? all.reduce((m, v) => (v > m ? v : m), all[0]) : 1
  let yMin = all.length ? all.reduce((m, v) => (v < m ? v : m), all[0]) : 0
  if (spec.type === 'bar' || spec.type === 'area') yMin = Math.min(0, yMin)
  if (yMin === yMax) {
    yMax += 1
    yMin -= 1
  }
  const yPx = (v: number): number => T + ih - ((v - yMin) / (yMax - yMin)) * ih
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (i / 4) * (yMax - yMin))
  const n = Math.max(...spec.series.map((s) => s.data.length), 1)
  const isScatter = spec.type === 'scatter'

  let xNums: number[] = []
  let xMin = 0
  let xMax = 1
  if (isScatter) {
    xNums = spec.x
      .map((v) => (typeof v === 'number' ? v : Number(v)))
      .map((v) => (isNaN(v) ? 0 : v))
    if (!xNums.length) xNums = spec.series[0].data.map((_, i) => i)
    xMin = Math.min(...xNums)
    xMax = Math.max(...xNums)
    if (xMin === xMax) {
      xMax += 1
      xMin -= 1
    }
  }
  const xCat = (i: number): number => L + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw)
  const xBand = (i: number): number => L + (i + 0.5) * (iw / n)
  const xNum = (v: number): number => L + ((v - xMin) / (xMax - xMin)) * iw
  const showEvery = Math.ceil(n / 12)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img">
      {spec.title && (
        <text x={W / 2} y={24} className="chart-title" textAnchor="middle">
          {spec.title}
        </text>
      )}
      {yTicks.map((tv, i) => (
        <g key={'y' + i}>
          <line x1={L} y1={yPx(tv)} x2={W - R} y2={yPx(tv)} className="chart-grid" />
          <text x={L - 6} y={yPx(tv) + 3} className="chart-axis-label" textAnchor="end">
            {Math.abs(tv) >= 1000 ? tv.toFixed(0) : Number(tv.toFixed(2))}
          </text>
        </g>
      ))}
      <line x1={L} y1={T} x2={L} y2={T + ih} className="chart-axis" />
      <line x1={L} y1={T + ih} x2={W - R} y2={T + ih} className="chart-axis" />
      {!isScatter &&
        spec.x.map((lab, i) =>
          i % showEvery === 0 ? (
            <text
              key={'x' + i}
              x={spec.type === 'bar' ? xBand(i) : xCat(i)}
              y={T + ih + 16}
              className="chart-axis-label"
              textAnchor="middle"
            >
              {String(lab)}
            </text>
          ) : null
        )}
      {spec.series.map((s, si) => {
        const color = CHART_COLORS[si % CHART_COLORS.length]
        if (spec.type === 'bar') {
          const bw = (iw / n) * 0.8
          const sw = bw / spec.series.length
          return s.data.map((v, i) => (
            <rect
              key={si + '-' + i}
              x={L + i * (iw / n) + (iw / n) * 0.1 + si * sw}
              y={Math.min(yPx(v), yPx(0))}
              width={Math.max(1, sw - 1)}
              height={Math.abs(yPx(v) - yPx(0))}
              fill={color}
            />
          ))
        }
        if (spec.type === 'scatter') {
          return s.data.map((v, i) => (
            <circle key={si + '-' + i} cx={xNum(xNums[i] ?? i)} cy={yPx(v)} r={4} fill={color} />
          ))
        }
        const pts = s.data.map((v, i) => `${xCat(i)},${yPx(v)}`).join(' ')
        return (
          <g key={si}>
            {spec.type === 'area' && (
              <polygon
                points={`${L},${T + ih} ${pts} ${xCat(s.data.length - 1)},${T + ih}`}
                fill={color}
                opacity={0.18}
              />
            )}
            <polyline points={pts} fill="none" stroke={color} strokeWidth={2} />
            {s.data.map((v, i) => (
              <circle key={i} cx={xCat(i)} cy={yPx(v)} r={2.5} fill={color} />
            ))}
          </g>
        )
      })}
      {(spec.series.length > 1 || spec.series[0].name) && (
        <g>
          {(() => {
            // Spread legend entries across the available width so they never run off the right
            // edge; clamp the per-item step and truncate long names to fit.
            const step = Math.min(120, (W - L - R) / spec.series.length)
            const maxChars = Math.max(4, Math.floor(step / 7) - 2)
            return spec.series.map((s, si) => {
              const name = s.name || 'Series ' + (si + 1)
              const label =
                name.length > maxChars ? name.slice(0, Math.max(1, maxChars - 1)) + '…' : name
              return (
                <g key={si} transform={`translate(${L + si * step}, ${H - 6})`}>
                  <rect
                    width={10}
                    height={10}
                    y={-9}
                    fill={CHART_COLORS[si % CHART_COLORS.length]}
                  />
                  <text x={14} y={0} className="chart-axis-label">
                    {label}
                  </text>
                </g>
              )
            })
          })()}
        </g>
      )}
    </svg>
  )
}

function ChartBlock({ src }: { src: string }): React.JSX.Element {
  const parsed = useMemo(() => parseChart(src), [src])
  const ref = useRef<HTMLDivElement>(null)
  const exportSvg = (png: boolean): void => {
    const svg = ref.current?.querySelector('svg')
    if (!svg) return
    const clone = svg.cloneNode(true) as SVGSVGElement
    // The on-page <svg> is sized by CSS (viewBox only); give the exported copy explicit
    // width/height from the viewBox so PNG raster keeps the right aspect ratio.
    const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number)
    if (vb.length === 4 && !clone.getAttribute('width')) {
      clone.setAttribute('width', String(vb[2]))
      clone.setAttribute('height', String(vb[3]))
    }
    if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const str = new XMLSerializer().serializeToString(clone)
    if (png) exportSvgAsPng(str, 'chart.png')
    else downloadBlob(str, 'image/svg+xml', 'chart.svg')
  }
  if ('error' in parsed) {
    return (
      <div className="mermaid-error-panel">
        <div className="mermaid-error-head">
          <span>⚠ Chart error</span>
          <button type="button" className="link-btn" onClick={() => copyText(src)}>
            Copy source
          </button>
        </div>
        <pre className="mermaid-error-msg">{parsed.error}</pre>
        <details className="mermaid-error-src">
          <summary>View chart source</summary>
          <pre>{src}</pre>
        </details>
      </div>
    )
  }
  return (
    <div className="chart-block mermaid-view" ref={ref}>
      <div className="mermaid-toolbar">
        <button type="button" title="Copy chart source" onClick={() => copyText(src)}>
          Copy
        </button>
        <button type="button" title="Export as SVG" onClick={() => exportSvg(false)}>
          SVG
        </button>
        <button type="button" title="Export as PNG" onClick={() => exportSvg(true)}>
          PNG
        </button>
      </div>
      <ChartSvg spec={parsed.spec} />
    </div>
  )
}

function extractText(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (Array.isArray(children)) return children.map(extractText).join('')
  return ''
}

function MdImage({
  resolved,
  alt,
  title,
  width,
  height,
  onClick
}: {
  resolved: string
  alt: string
  title?: string
  width?: string
  height?: string
  onClick: () => void
}): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span className="img-missing" title={resolved}>
        🖼️ Image not found{alt ? `: ${alt}` : ''}
      </span>
    )
  }
  const img = (
    <img
      src={resolved}
      alt={alt}
      title={title}
      className="md-image"
      style={{ width, height }}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onError={() => setFailed(true)}
    />
  )
  if (title) {
    return (
      <figure className="md-figure">
        {img}
        <figcaption>{title}</figcaption>
      </figure>
    )
  }
  return img
}

export function makeComponents(
  baseDir: string,
  onLinkActivate: (href: string) => void,
  onImageClick: (src: string) => void,
  allowRemote = false,
  theme = 'light'
): Components {
  return {
    img(props) {
      const src = typeof props.src === 'string' ? props.src : ''
      if (/^https?:/i.test(src) && !allowRemote) {
        return (
          <span className="img-blocked" title={src}>
            🚫 remote image blocked — enable “remote images” in settings
          </span>
        )
      }
      const resolved = buildImageSrc(baseDir, src)
      // Width hint in the alt text: ![caption|300] or ![caption|300x200]
      const altRaw = typeof props.alt === 'string' ? props.alt : ''
      const hint = /^(.*?)\s*\|\s*(\d+)(?:x(\d+))?$/.exec(altRaw)
      const alt = hint ? hint[1] : altRaw
      const width = hint ? hint[2] + 'px' : undefined
      const height = hint && hint[3] ? hint[3] + 'px' : undefined
      const title = typeof props.title === 'string' ? props.title : undefined
      return (
        <MdImage
          resolved={resolved}
          alt={alt}
          title={title}
          width={width}
          height={height}
          onClick={() => onImageClick(resolved)}
        />
      )
    },
    a(props) {
      const href = props.href ?? ''
      const isWiki = href.startsWith('wiki:')
      return (
        <a
          href={href}
          title={props.title}
          className={isWiki ? 'wiki-link' : undefined}
          onClick={(e) => {
            e.preventDefault()
            onLinkActivate(href)
          }}
        >
          {props.children}
        </a>
      )
    },
    pre(props) {
      return <CodeBlock>{props.children}</CodeBlock>
    },
    code(props) {
      const className = props.className ?? ''
      const lang = /language-(\w+)/.exec(className)?.[1]
      if (lang === 'mermaid')
        return <MermaidBlock chart={extractText(props.children)} theme={theme} />
      if (lang === 'chart') return <ChartBlock src={extractText(props.children)} />
      return <code className={className}>{props.children}</code>
    },
    // Wrap tables so wide ones scroll horizontally instead of breaking the column layout.
    table(props) {
      return (
        <div className="md-table-wrap">
          <table>{props.children}</table>
        </div>
      )
    }
  }
}
