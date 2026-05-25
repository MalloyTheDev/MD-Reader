// Pure document-intelligence helpers: count a Markdown document's features and find broken
// wiki-links. No I/O. Used by the "Document info" panel.

export interface DocStats {
  words: number
  readingMin: number
  headings: number
  equations: number
  diagrams: number
  charts: number
  codeBlocks: number
  tables: number
  images: number
  embeds: number
  links: number
  wikiLinks: number
  tasksTotal: number
  tasksDone: number
}

function stripFrontMatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '')
}

function countMatches(content: string, re: RegExp): number {
  return (content.match(re) ?? []).length
}

function countGfmTables(content: string): number {
  const lines = content.split('\n')
  const sepRe = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/
  let n = 0
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^\s*\|.*\|.*$/.test(lines[i]) && sepRe.test(lines[i + 1])) n++
  }
  return n
}

// Walk fenced code blocks, pairing each opening ``` with its closing ``` and classifying by the
// opening info-string. Pairing (rather than arithmetic on fence counts) avoids miscounts when a
// fence is unclosed or a mermaid/chart block sits among plain code blocks.
function countFences(content: string): { code: number; mermaid: number; charts: number } {
  const out = { code: 0, mermaid: 0, charts: 0 }
  let open = false
  let lang = ''
  for (const raw of content.split('\n')) {
    const m = /^```(.*)$/.exec(raw.trim())
    if (!m) continue
    if (!open) {
      open = true
      lang = m[1].trim().split(/\s+/)[0].toLowerCase()
    } else {
      open = false
      if (lang === 'mermaid') out.mermaid++
      else if (lang === 'chart') out.charts++
      else out.code++
    }
  }
  return out
}

// Inline `$…$` math, aligned with remark-math: the delimiters must hug non-space content (so
// "$5 and $10" isn't math) and `$$` display blocks are excluded.
const INLINE_MATH = /(?<![\\$])\$(?![ \t$])(?:[^$\n]*[^ \t$])?\$(?!\$)/g

export function computeDocStats(content: string): DocStats {
  const body = stripFrontMatter(content)
  const fences = countFences(body)
  // Count Markdown structures over text with fenced code removed, so tables/headings/links/math
  // shown *inside* a code block don't inflate the totals.
  const noFence = body.replace(/```[\s\S]*?```/g, '\n')

  const words = noFence
    .replace(/`[^`]*`/g, ' ')
    .replace(/[#>*_~`|-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length

  const displayMath = countMatches(noFence, /\$\$[\s\S]+?\$\$/g)
  const inlineMath = countMatches(noFence, INLINE_MATH)

  // The `[`-excluding character classes keep these linear on adversarial `[[[[…` input (ReDoS).
  const embeds = countMatches(noFence, /!\[\[[^\][\n]*\]\]/g)
  const images = countMatches(noFence, /!\[[^\][\n]*\]\([^)\n]*\)/g)
  const links = countMatches(noFence, /(?<!!)\[[^\][\n]*\]\([^)\n]*\)/g)
  const wikiLinks = countMatches(noFence, /(?<!!)\[\[[^\][\n]+\]\]/g)

  return {
    words,
    readingMin: Math.max(1, Math.round(words / 200)),
    headings: countMatches(noFence, /^#{1,6}\s+\S/gm),
    equations: displayMath + inlineMath,
    diagrams: fences.mermaid,
    charts: fences.charts,
    codeBlocks: fences.code,
    tables: countGfmTables(noFence),
    images,
    embeds,
    links,
    wikiLinks,
    tasksTotal: countMatches(noFence, /^[ \t]*[-*+]\s+\[[ xX]\]/gm),
    tasksDone: countMatches(noFence, /^[ \t]*[-*+]\s+\[[xX]\]/gm)
  }
}

// All distinct wiki-link target names in a document (excluding `![[embeds]]`), stripped of any
// `|alias` and `#heading` suffix.
export function extractWikiNames(content: string): string[] {
  const out: string[] = []
  // Exclude `[` and newline from the name class: wiki names never contain them, and allowing them
  // makes a long `[[[[…` run with no closing `]]` quadratic (ReDoS) on adversarial documents.
  const re = /(?<!!)\[\[([^\][\n]+)\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const name = m[1].split('|')[0].split('#')[0].trim()
    if (name) out.push(name)
  }
  return out
}

// Wiki-link targets that don't resolve to any known note title (case-insensitive), de-duplicated.
export function findBrokenWikiLinks(content: string, knownTitles: string[]): string[] {
  const known = new Set(knownTitles.map((t) => t.toLowerCase()))
  const seen = new Set<string>()
  const broken: string[] = []
  for (const name of extractWikiNames(content)) {
    const key = name.toLowerCase()
    if (!known.has(key) && !seen.has(key)) {
      seen.add(key)
      broken.push(name)
    }
  }
  return broken
}
