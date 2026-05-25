// Small pure helpers for word count + reading time (used by the editor + reader).

export function countWords(text: string): number {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/`[^`]*`/g, ' ') // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → keep text
    .replace(/[#>*_~`|]/g, ' ') // markdown punctuation
    .trim()
  return cleaned ? cleaned.split(/\s+/).filter(Boolean).length : 0
}

export function readTimeMinutes(words: number, wpm = 220): number {
  return words === 0 ? 0 : Math.max(1, Math.round(words / wpm))
}

export function readingLabel(text: string): string {
  const w = countWords(text)
  const m = readTimeMinutes(w)
  return `${w.toLocaleString()} word${w === 1 ? '' : 's'} · ${m} min`
}
