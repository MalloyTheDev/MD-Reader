import type { MarkdownFileContent } from '@shared/types'

export interface TaskItem {
  fileAbs: string
  title: string
  text: string
  checked: boolean
  /** 0-based index of this checkbox among all checkboxes in its file (stable toggle key). */
  index: number
}

const NAME_EXT = /\.(md|markdown|mdown|mkd|mdx)$/i
// Markdown task list item: "- [ ] text", "* [x] text", "+ [X] text" (any indent).
const TASK_RE = /^(\s*[-*+]\s+\[)([ xX])(\]\s+)(.*)$/

function titleOf(f: MarkdownFileContent): string {
  return f.title || f.content.match(/^#\s+(.+)$/m)?.[1]?.trim() || f.name.replace(NAME_EXT, '')
}

export function scanTasks(files: MarkdownFileContent[]): TaskItem[] {
  const out: TaskItem[] = []
  for (const f of files) {
    const title = titleOf(f)
    let idx = 0
    for (const line of f.content.split('\n')) {
      const m = TASK_RE.exec(line)
      if (!m) continue
      out.push({
        fileAbs: f.absolutePath,
        title,
        text: m[4].trim(),
        checked: m[2].toLowerCase() === 'x',
        index: idx
      })
      idx++
    }
  }
  return out
}

export function countTasks(files: MarkdownFileContent[]): number {
  let n = 0
  for (const f of files) {
    for (const line of f.content.split('\n')) if (TASK_RE.test(line)) n++
  }
  return n
}

/** Flip the checkbox state of the index-th task line in a raw file body. */
export function toggleInRaw(raw: string, index: number): string {
  const lines = raw.split('\n')
  // Skip a leading front-matter block so indices match the content-based scan.
  let start = 0
  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        start = i + 1
        break
      }
    }
  }
  let seen = 0
  for (let i = start; i < lines.length; i++) {
    const m = TASK_RE.exec(lines[i])
    if (!m) continue
    if (seen === index) {
      const next = m[2].toLowerCase() === 'x' ? ' ' : 'x'
      lines[i] = m[1] + next + m[3] + m[4]
      break
    }
    seen++
  }
  return lines.join('\n')
}
