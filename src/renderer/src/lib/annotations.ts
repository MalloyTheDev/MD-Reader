import type { CardSchedule } from '@shared/types'

/** Character offset of (node, offset) within root's concatenated text. */
function offsetOf(root: HTMLElement, node: Node, offset: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let acc = 0
  let n: Node | null
  while ((n = walker.nextNode())) {
    if (n === node) return acc + offset
    acc += (n.nodeValue ?? '').length
  }
  return acc
}

export function getSelectionOffsets(
  root: HTMLElement
): { start: number; end: number; text: string } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  const a = offsetOf(root, range.startContainer, range.startOffset)
  const b = offsetOf(root, range.endContainer, range.endOffset)
  const start = Math.min(a, b)
  const end = Math.max(a, b)
  const text = sel.toString().trim()
  if (end - start < 1 || !text) return null
  return { start, end, text }
}

export function rangeForOffsets(root: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let acc = 0
  let n: Node | null
  let startNode: Node | null = null
  let startLocal = 0
  let endNode: Node | null = null
  let endLocal = 0
  while ((n = walker.nextNode())) {
    const len = (n.nodeValue ?? '').length
    if (startNode === null && acc + len > start) {
      startNode = n
      startLocal = start - acc
    }
    if (acc + len >= end) {
      endNode = n
      endLocal = end - acc
      break
    }
    acc += len
  }
  if (!startNode || !endNode) return null
  const range = document.createRange()
  const sLen = (startNode.nodeValue ?? '').length
  const eLen = (endNode.nodeValue ?? '').length
  range.setStart(startNode, Math.max(0, Math.min(startLocal, sLen)))
  range.setEnd(endNode, Math.max(0, Math.min(endLocal, eLen)))
  return range
}

export function newCard(question: string): CardSchedule {
  return { question, ease: 2.5, intervalDays: 0, due: Date.now(), reps: 0 }
}

/** SM-2-ish update. rating: 0 again, 1 hard, 2 good, 3 easy. */
export function scheduleCard(card: CardSchedule, rating: number): CardSchedule {
  let { ease, intervalDays, reps } = card
  if (rating === 0) {
    reps = 0
    intervalDays = 0
    ease = Math.max(1.3, ease - 0.2)
  } else {
    if (reps === 0) intervalDays = rating >= 3 ? 2 : 1
    else if (reps === 1) intervalDays = rating >= 3 ? 6 : 3
    else intervalDays = Math.max(1, Math.round(intervalDays * (rating === 1 ? 1.2 : ease)))
    ease = Math.max(1.3, ease + (rating === 3 ? 0.15 : rating === 1 ? -0.15 : 0))
    reps += 1
  }
  return { ...card, ease, intervalDays, reps, due: Date.now() + intervalDays * 86400000 }
}
