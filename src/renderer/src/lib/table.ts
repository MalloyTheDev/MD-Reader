// Pure, dependency-free conversions between delimited text (CSV/TSV) and GitHub-flavored Markdown
// tables, plus a helper to locate the Markdown table block around a caret. No I/O, no eval.

// Parse delimited text into a 2D array of cells. Handles quoted fields ("a,b"), escaped quotes
// (""), and newlines inside quotes. Auto-detects the delimiter (comma / tab / semicolon).
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '')
  if (src.trim() === '') return []
  const delim = detectDelimiter(src)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === delim) {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  row.push(field)
  rows.push(row)
  return rows
}

function detectDelimiter(src: string): string {
  const firstLine = src.split('\n')[0] ?? ''
  const candidates = [',', '\t', ';']
  let best = ','
  let bestN = -1
  for (const d of candidates) {
    const n = firstLine.split(d).length - 1
    if (n > bestN) {
      bestN = n
      best = d
    }
  }
  return best
}

// Convert delimited text (CSV/TSV) to a Markdown table; the first row becomes the header.
export function csvToMarkdownTable(text: string): string {
  const rows = parseDelimited(text)
  if (rows.length === 0) return ''
  const cols = rows.reduce((m, r) => Math.max(m, r.length), 0)
  const cell = (v: string | undefined): string =>
    (v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()
  const pad = (r: string[]): string[] => {
    const out = r.map(cell)
    while (out.length < cols) out.push('')
    return out
  }
  const line = (r: string[]): string => `| ${r.join(' | ')} |`
  const header = pad(rows[0])
  const sep = header.map(() => '---')
  const body = rows.slice(1).map(pad)
  return [line(header), line(sep), ...body.map(line)].join('\n')
}

// Split a Markdown table row on unescaped pipes, trimming the leading/trailing border pipes.
function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cur += '|'
      i++
    } else if (s[i] === '|') {
      cells.push(cur)
      cur = ''
    } else cur += s[i]
  }
  cells.push(cur)
  return cells
}

function isSeparatorRow(line: string): boolean {
  const cells = splitRow(line)
  return cells.length > 0 && cells.every((c) => /^\s*:?-{1,}:?\s*$/.test(c))
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v
}

// Convert a Markdown table (the contiguous "| … |" block) to CSV text.
export function markdownTableToCsv(md: string): string {
  const lines = md
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'))
  if (lines.length === 0) return ''
  // The GFM separator is always row 2; drop only that one so a legitimate data row of dashes/colons
  // (e.g. a "-" placeholder cell) isn't mistaken for a separator and deleted.
  const hasSeparator = lines.length >= 2 && isSeparatorRow(lines[1])
  const dataLines = hasSeparator ? lines.filter((_, i) => i !== 1) : lines
  const rows = dataLines.map((l) => splitRow(l).map((c) => c.replace(/\\\|/g, '|').trim()))
  if (rows.length === 0) return ''
  return rows.map((r) => r.map(csvCell).join(',')).join('\n')
}

// Given full text and a caret offset, return the contiguous Markdown-table block of lines the
// caret sits in (lines starting with "|"), or null if the caret isn't inside a table.
export function extractTableBlock(text: string, caret: number): string | null {
  if (caret < 0 || caret > text.length) return null
  const lines = text.split('\n')
  // Find the line the caret sits on: caret at a line's end maps to that line, at the next line's
  // start maps to the next. A caret past the text never reaches here (guarded above).
  let idx = 0
  let pos = 0
  for (; idx < lines.length; idx++) {
    const lineEnd = pos + lines[idx].length
    if (caret <= lineEnd) break
    pos = lineEnd + 1
  }
  if (idx >= lines.length || !lines[idx].trim().startsWith('|')) return null
  let start = idx
  let end = idx
  while (start > 0 && lines[start - 1].trim().startsWith('|')) start--
  while (end < lines.length - 1 && lines[end + 1].trim().startsWith('|')) end++
  return lines.slice(start, end + 1).join('\n')
}
