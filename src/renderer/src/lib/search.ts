import MiniSearch from 'minisearch'
import type { MarkdownFileContent } from '@shared/types'

export type DocFeature = 'math' | 'mermaid' | 'chart' | 'todo' | 'table' | 'image' | 'code'

export interface LibDoc {
  id: string
  title: string
  headings: string
  body: string
  name: string
  relativePath: string
  content: string
  tags: string[]
  features: Set<DocFeature>
}

export interface LibSearchResult {
  id: string
  title: string
  name: string
  relativePath: string
  snippet: string
  matches: string[]
}

export interface SearchIndex {
  index: MiniSearch<LibDoc>
  docs: Map<string, LibDoc>
}

export type FilterKind = 'tag' | 'title' | 'path' | 'content' | 'has'
export interface SearchFilter {
  kind: FilterKind
  value: string
}
export interface ParsedQuery {
  text: string
  filters: SearchFilter[]
}

const NAME_EXT = /\.(md|markdown|mdown|mkd|mdx)$/i

function stripMarkdown(src: string): string {
  return src
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[#>\-*+]+\s*/gm, '')
    .replace(/[*_~`#>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Pull tags out of the YAML-ish front-matter block. Supports `tags: [a, b]`, a bullet list, or a
// bare comma list. Returns lowercased-as-written tags (matching is case-insensitive downstream).
function extractTags(content: string): string[] {
  const fm = /^---\n([\s\S]*?)\n---/.exec(content)
  if (!fm) return []
  const block = fm[1]
  const clean = (s: string): string => s.trim().replace(/^['"]|['"]$/g, '')
  const inline = /^[ \t]*tags:\s*\[(.*?)\]/m.exec(block)
  if (inline) return inline[1].split(',').map(clean).filter(Boolean)
  const listHead = /^[ \t]*tags:\s*$/m.exec(block)
  if (listHead) {
    const after = block.slice(listHead.index + listHead[0].length)
    const out: string[] = []
    for (const ln of after.split('\n')) {
      const m = /^\s*-\s+(.+?)\s*$/.exec(ln)
      if (m) out.push(clean(m[1]))
      else if (ln.trim() && !/^\s/.test(ln)) break // reached the next top-level key
    }
    return out.filter(Boolean)
  }
  const csv = /^[ \t]*tags:\s*([^[\n]+)$/m.exec(block)
  if (csv) return csv[1].split(',').map(clean).filter(Boolean)
  return []
}

// A real GFM table is a pipe row followed by a separator row of at least TWO dash-cells
// (e.g. `| --- | --- |`). Requiring ≥2 columns avoids matching a stray `|---|` divider.
function hasGfmTable(content: string): boolean {
  const lines = content.split('\n')
  const sepRe = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^\s*\|.*\|.*$/.test(lines[i]) && sepRe.test(lines[i + 1])) return true
  }
  return false
}

// Inline `$…$` is treated as math when the delimiters hug non-space content (remark-math's rule),
// so prose like "I paid $5 and $10" isn't mistaken for math. Display `$$…$$` and \(…\)/\[…\] count.
function hasMath(content: string): boolean {
  if (/\$\$[\s\S]+?\$\$/.test(content)) return true
  if (/\\\(|\\\[/.test(content)) return true
  return /(?<![\\$])\$(?![ \t$])(?:[^$\n]*[^ \t$])?\$(?!\$)/.test(content)
}

function detectFeatures(content: string): Set<DocFeature> {
  const f = new Set<DocFeature>()
  if (/```\s*mermaid/i.test(content)) f.add('mermaid')
  if (/```\s*chart/i.test(content)) f.add('chart')
  if (/```/.test(content)) f.add('code')
  if (hasMath(content)) f.add('math')
  if (/^[ \t]*[-*+]\s+\[[ xX]\]/m.test(content)) f.add('todo')
  if (/!\[[^\]]*\]\(/.test(content) || /!\[\[/.test(content)) f.add('image')
  if (hasGfmTable(content)) f.add('table')
  return f
}

function toDoc(f: MarkdownFileContent): LibDoc {
  const headings = (f.content.match(/^#{1,6}\s+.+$/gm) ?? [])
    .map((h) => h.replace(/^#{1,6}\s+/, '').trim())
    .join(' · ')
  const firstH1 = f.content.match(/^#\s+(.+)$/m)?.[1]?.trim()
  const title = firstH1 || f.name.replace(NAME_EXT, '')
  return {
    id: f.absolutePath,
    title,
    headings,
    body: stripMarkdown(f.content),
    name: f.name,
    relativePath: f.relativePath,
    content: f.content,
    tags: extractTags(f.content),
    features: detectFeatures(f.content)
  }
}

export function buildIndex(files: MarkdownFileContent[]): SearchIndex {
  const index = new MiniSearch<LibDoc>({
    fields: ['title', 'headings', 'body'],
    storeFields: ['title', 'name', 'relativePath', 'body'],
    searchOptions: {
      boost: { title: 4, headings: 2 },
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'AND'
    }
  })
  const docs = new Map<string, LibDoc>()
  const list = files.map(toDoc)
  for (const d of list) docs.set(d.id, d)
  index.addAll(list)
  return { index, docs }
}

// Tokenize a raw query, keeping `key:"quoted value"` and bare `"quoted phrases"` intact.
function tokenize(raw: string): string[] {
  return raw.match(/\w+:"[^"]*"|"[^"]*"|\S+/g) ?? []
}

function stripQuotes(s: string): string {
  return s.replace(/^"(.*)"$/, '$1')
}

const OP = /^(tag|title|path|content|has):(.*)$/i
const HAS_VALUES = new Set<string>(['math', 'mermaid', 'chart', 'todo', 'table', 'image', 'code'])

export function parseQuery(raw: string): ParsedQuery {
  const filters: SearchFilter[] = []
  const textParts: string[] = []
  for (const tok of tokenize(raw)) {
    const m = OP.exec(tok)
    if (m && m[2].trim()) {
      const kind = m[1].toLowerCase() as FilterKind
      const value = stripQuotes(m[2]).toLowerCase()
      // An unknown has:<feature> value isn't a real filter - fall back to searching it as text
      // rather than silently matching nothing.
      if (kind === 'has' && !HAS_VALUES.has(value)) textParts.push(value)
      else filters.push({ kind, value })
    } else {
      textParts.push(stripQuotes(tok))
    }
  }
  return { text: textParts.join(' ').trim(), filters }
}

function matchFilter(d: LibDoc, f: SearchFilter): boolean {
  const v = f.value
  switch (f.kind) {
    case 'tag':
      return d.tags.some((t) => t.toLowerCase() === v)
    case 'title':
      return d.title.toLowerCase().includes(v)
    case 'path':
      return d.relativePath.toLowerCase().includes(v)
    case 'content':
      return d.content.toLowerCase().includes(v)
    case 'has':
      return d.features.has(v as DocFeature)
    default:
      return false
  }
}

function collectTerms(text: string, filters: SearchFilter[]): string[] {
  const terms = text.toLowerCase().split(/\s+/).filter(Boolean)
  for (const f of filters) {
    if ((f.kind === 'content' || f.kind === 'title') && f.value) terms.push(f.value)
  }
  return terms
}

// Up to 3 content lines that contain a search term (for the result preview). With no terms (a
// filter-only query), show the first couple of meaningful lines instead.
function matchedLines(content: string, terms: string[]): string[] {
  const lines = content.split('\n')
  const out: string[] = []
  const clip = (s: string): string => (s.length > 160 ? s.slice(0, 160).trim() + '…' : s)
  if (terms.length === 0) {
    let inFm = false
    for (const ln of lines) {
      const t = ln.trim()
      if (t === '---') {
        inFm = !inFm
        continue
      }
      if (inFm || !t || t.startsWith('#')) continue
      out.push(clip(t))
      if (out.length >= 2) break
    }
    return out
  }
  for (const ln of lines) {
    const low = ln.toLowerCase()
    if (terms.some((t) => low.includes(t))) {
      const t = ln.trim()
      if (t) out.push(clip(t))
      if (out.length >= 3) break
    }
  }
  return out
}

function makeSnippet(body: string, term: string): string {
  const first = term.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  if (!first) return body.slice(0, 140)
  const idx = body.toLowerCase().indexOf(first)
  if (idx < 0) return body.slice(0, 140)
  const start = Math.max(0, idx - 50)
  return (start > 0 ? '…' : '') + body.slice(start, start + 160).trim() + '…'
}

export function runLibrarySearch(store: SearchIndex, raw: string, limit = 50): LibSearchResult[] {
  const { index, docs } = store
  const { text, filters } = parseQuery(raw)
  if (!text && filters.length === 0) return []

  let candidates: LibDoc[]
  if (text) {
    const seen = new Set<string>()
    candidates = []
    for (const h of index.search(text)) {
      const d = docs.get(h.id as string)
      if (d && !seen.has(d.id)) {
        seen.add(d.id)
        candidates.push(d)
      }
    }
  } else {
    candidates = [...docs.values()]
  }

  const filtered = candidates.filter((d) => filters.every((f) => matchFilter(d, f)))
  const ordered = text ? filtered : filtered.sort((a, b) => a.title.localeCompare(b.title))
  const terms = collectTerms(text, filters)
  return ordered.slice(0, limit).map((d) => ({
    id: d.id,
    title: d.title,
    name: d.name,
    relativePath: d.relativePath,
    snippet: makeSnippet(d.body, terms[0] ?? ''),
    matches: matchedLines(d.content, terms)
  }))
}
