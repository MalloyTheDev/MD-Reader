import type { MarkdownFileContent } from '@shared/types'

export interface GraphData {
  nodes: { id: string; title: string; degree: number }[]
  links: { source: string; target: string }[]
  backlinks: Record<string, string[]>
  outlinks: Record<string, string[]>
  tags: Record<string, string[]>
  tagIndex: Record<string, string[]>
  titleOf: Record<string, string>
}

const EXT = /\.[^.]+$/
const WIKI = /\[\[([^\]#|]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g
const MDLINK = /\]\(([^)]+\.(?:md|markdown|mdown|mkd|mdx))\)/gi
const TAG = /(?:^|\s)#([a-zA-Z][\w/-]*)/g

export function buildGraph(files: MarkdownFileContent[]): GraphData {
  const nameMap = new Map<string, string>()
  const titleOf: Record<string, string> = {}
  for (const f of files) {
    const title = f.title || f.name.replace(EXT, '')
    titleOf[f.absolutePath] = title
    const base = f.name.replace(EXT, '').toLowerCase()
    if (!nameMap.has(base)) nameMap.set(base, f.absolutePath)
    const relKey = f.relativePath.replace(EXT, '').toLowerCase()
    if (!nameMap.has(relKey)) nameMap.set(relKey, f.absolutePath)
    if (f.title) {
      const titleKey = f.title.toLowerCase()
      if (!nameMap.has(titleKey)) nameMap.set(titleKey, f.absolutePath)
    }
  }

  const resolve = (name: string, fromRel: string): string | undefined => {
    const key = name.trim().toLowerCase()
    if (nameMap.has(key)) return nameMap.get(key)
    const parts = fromRel.split('/').slice(0, -1)
    for (const seg of key.split('/')) {
      if (seg === '..') parts.pop()
      else if (seg !== '.' && seg !== '') parts.push(seg)
    }
    return nameMap.get(parts.join('/').replace(EXT, ''))
  }

  const outlinks: Record<string, string[]> = {}
  const backlinks: Record<string, string[]> = {}
  const tags: Record<string, string[]> = {}
  const tagIndex: Record<string, Set<string>> = {}
  const links: { source: string; target: string }[] = []
  for (const f of files) backlinks[f.absolutePath] = []

  for (const f of files) {
    const targets = new Set<string>()
    let m: RegExpExecArray | null
    WIKI.lastIndex = 0
    while ((m = WIKI.exec(f.content))) {
      const t = resolve(m[1], f.relativePath)
      if (t && t !== f.absolutePath) targets.add(t)
    }
    MDLINK.lastIndex = 0
    while ((m = MDLINK.exec(f.content))) {
      const t = resolve(decodeURIComponent(m[1].split('#')[0]), f.relativePath)
      if (t && t !== f.absolutePath) targets.add(t)
    }
    outlinks[f.absolutePath] = [...targets]
    for (const t of targets) {
      links.push({ source: f.absolutePath, target: t })
      ;(backlinks[t] ??= []).push(f.absolutePath)
    }

    const ftags = new Set<string>()
    TAG.lastIndex = 0
    while ((m = TAG.exec(f.content))) ftags.add(m[1].toLowerCase())
    tags[f.absolutePath] = [...ftags]
    for (const t of ftags) (tagIndex[t] ??= new Set()).add(f.absolutePath)
  }

  const degree: Record<string, number> = {}
  for (const f of files)
    degree[f.absolutePath] =
      (outlinks[f.absolutePath]?.length ?? 0) + (backlinks[f.absolutePath]?.length ?? 0)

  return {
    nodes: files.map((f) => ({
      id: f.absolutePath,
      title: titleOf[f.absolutePath],
      degree: degree[f.absolutePath]
    })),
    links,
    backlinks,
    outlinks,
    tags,
    tagIndex: Object.fromEntries(Object.entries(tagIndex).map(([k, v]) => [k, [...v]])),
    titleOf
  }
}
