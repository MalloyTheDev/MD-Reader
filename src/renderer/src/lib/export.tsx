import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import type { Annotation } from '@shared/types'
import { rehypePlugins, remarkPlugins, urlTransform, sanitizeSvg, ChartSvg } from './markdown'
import { parseChart } from './chart'

const EXPORT_CSS = `
  body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #222; max-width: 46rem; margin: 2rem auto; padding: 0 1rem; }
  h1,h2,h3,h4 { font-family: -apple-system, 'Segoe UI', sans-serif; line-height: 1.25; }
  h1 { border-bottom: 1px solid #ddd; padding-bottom: .3em; }
  a { color: #1f6feb; }
  pre { background: #f4f3ef; border: 1px solid #e0ddd5; border-radius: 8px; padding: 12px 14px; overflow-x: auto; white-space: pre-wrap; }
  code { font-family: ui-monospace, Consolas, monospace; font-size: .9em; }
  :not(pre) > code { background: #eee; padding: .1em .4em; border-radius: 4px; }
  blockquote { border-left: 3px solid #1f6feb; padding-left: 1em; color: #555; margin-left: 0; }
  table { border-collapse: collapse; width: 100%; }
  th,td { border: 1px solid #ddd; padding: 6px 10px; }
  img { max-width: 100%; height: auto; }
  .callout { border-left: 4px solid #3b82f6; background: rgba(59,130,246,.1); border-radius: 6px; padding: 10px 14px; }
  .chart-export, .mermaid-export { margin: 1em 0; text-align: center; }
  .chart-export svg, .mermaid-export svg { max-width: 100%; height: auto; }
`

function childText(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (Array.isArray(children)) return children.map(childText).join('')
  return ''
}

// Render each ```mermaid block to a sanitized SVG, keyed by its trimmed source. Async because
// mermaid renders asynchronously; failures are skipped (the block falls back to its source text).
// Pull the source of each ```mermaid block (matching any info string, e.g. ```mermaid {init:…}),
// normalizing CRLF→LF so the key matches the mdast-normalized source the renderer looks up.
export function extractMermaidSources(content: string): string[] {
  const norm = content.replace(/\r\n/g, '\n')
  const out: string[] = []
  const blocks = norm.match(/```[ \t]*mermaid\b[^\n]*\n[\s\S]*?```/g) ?? []
  for (const raw of blocks) {
    const src = raw
      .replace(/```[ \t]*mermaid[^\n]*\n/, '')
      .replace(/```$/, '')
      .trim()
    if (src) out.push(src)
  }
  return out
}

export async function prerenderMermaid(
  content: string,
  theme = 'light'
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const sources = extractMermaidSources(content)
  if (sources.length === 0) return map
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
    for (const src of sources) {
      if (map.has(src)) continue
      try {
        const id = 'mmd-export-' + Math.random().toString(36).slice(2)
        const out = await mermaid.render(id, src)
        map.set(src, sanitizeSvg(out.svg))
      } catch {
        /* leave unrendered → falls back to <pre> source */
      }
    }
  } catch {
    /* mermaid unavailable → no diagrams */
  }
  return map
}

// Plain, non-interactive components for static rendering. Charts render inline (pure SVG); mermaid
// blocks are swapped for their pre-rendered SVG; everything else is unchanged.
function makeStaticComponents(mermaidSvgs: Map<string, string>): Components {
  return {
    a(props) {
      return (
        <a href={props.href} title={props.title} rel="noreferrer">
          {props.children}
        </a>
      )
    },
    img(props) {
      return (
        <img
          src={typeof props.src === 'string' ? props.src : ''}
          alt={props.alt}
          title={props.title}
        />
      )
    },
    // Handle fenced blocks at the <pre> level so a diagram replaces the whole block (no <div>
    // nested inside <pre>). Normal code blocks still render as <pre><code>.
    pre(props) {
      const child = props.children
      if (React.isValidElement<{ className?: string; children?: React.ReactNode }>(child)) {
        const lang = /language-(\w+)/.exec(child.props.className ?? '')?.[1]
        const src = childText(child.props.children)
        if (lang === 'chart') {
          const parsed = parseChart(src)
          if ('spec' in parsed) {
            return (
              <div className="chart-export">
                <ChartSvg spec={parsed.spec} />
              </div>
            )
          }
          return <pre>{src}</pre>
        }
        if (lang === 'mermaid') {
          const svg = mermaidSvgs.get(src.trim())
          if (svg) return <div className="mermaid-export" dangerouslySetInnerHTML={{ __html: svg }} />
          return <pre>{src}</pre>
        }
      }
      return <pre>{props.children}</pre>
    }
  }
}

export async function renderBodyHtml(content: string, theme = 'light'): Promise<string> {
  const mermaidSvgs = await prerenderMermaid(content, theme)
  return renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={makeStaticComponents(mermaidSvgs)}
      urlTransform={urlTransform}
    >
      {content}
    </ReactMarkdown>
  )
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )
}

export async function renderDocHtml(content: string, title: string, theme = 'light'): Promise<string> {
  const body = await renderBodyHtml(content, theme)
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<style>${EXPORT_CSS}</style></head>
<body class="markdown-body">${body}</body></html>`
}

export function annotationsToMarkdown(title: string, anns: Annotation[]): string {
  let md = `# Highlights & notes — ${title}\n\n`
  if (anns.length === 0) md += '_No highlights yet._\n'
  for (const a of [...anns].sort((x, y) => x.start - y.start)) {
    if (a.text.trim()) md += `> ${a.text.replace(/\n/g, '\n> ')}\n\n`
    if (a.note) md += `${a.note}\n\n`
    md += `---\n\n`
  }
  return md
}

function csvCell(s: string): string {
  return `"${(s ?? '').replace(/"/g, '""')}"`
}

export function deckToCsv(cards: { q: string; a: string; source: string }[]): string {
  const rows = ['question,answer,source']
  for (const c of cards) rows.push([c.q, c.a, c.source].map(csvCell).join(','))
  return rows.join('\n')
}
