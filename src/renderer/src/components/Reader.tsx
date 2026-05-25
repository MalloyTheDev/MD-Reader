import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type {
  AppSettings,
  Annotation,
  Bookmark,
  HighlightColor,
  ReadingPosition
} from '@shared/types'
import { makeComponents, rehypePlugins, remarkPlugins, urlTransform } from '../lib/markdown'
import { getSelectionOffsets, rangeForOffsets, newCard } from '../lib/annotations'
import { Toc, type TocItem } from './Toc'

const HL_COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink']

interface ReaderProps {
  content: string
  baseDir: string
  fileKey: string
  settings: AppSettings
  initialPosition: ReadingPosition | null
  searchQuery: string
  tocOpen: boolean
  bookmarks: Bookmark[]
  backlinks: { id: string; title: string }[]
  annotations: Annotation[]
  onPositionChange: (pos: ReadingPosition) => void
  onOpenRelative: (href: string) => void
  onOpenWiki: (name: string) => void
  onOpenPath: (absolutePath: string) => void
  onBookmarksChange: (bookmarks: Bookmark[]) => void
  onAnnotationsChange: (annotations: Annotation[]) => void
  onAiExplain: (text: string) => void
}

interface RestorePoint {
  anchorId: string | null
  ratio: number
}

const HEADING_SEL = 'h1, h2, h3, h4'

function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function debounce<T extends (...a: any[]) => void>(fn: T, ms: number): T & { cancel: () => void } {
  let t: ReturnType<typeof setTimeout> | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrapped = ((...args: any[]) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }) as T & { cancel: () => void }
  wrapped.cancel = (): void => {
    if (t) clearTimeout(t)
  }
  return wrapped
}

export function Reader(props: ReaderProps): React.JSX.Element {
  const {
    content,
    baseDir,
    fileKey,
    settings,
    initialPosition,
    searchQuery,
    tocOpen,
    bookmarks,
    backlinks,
    annotations
  } = props

  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const stepRef = useRef(1)
  const cppRef = useRef(1)
  const pageRef = useRef(0)
  const pageCountRef = useRef(1)
  const headingPagesRef = useRef<{ id: string; page: number }[]>([])
  const matchPagesRef = useRef<number[]>([])
  const matchIndexRef = useRef(0)
  const restoreRef = useRef<RestorePoint | null>(null)
  const onPositionChangeRef = useRef(props.onPositionChange)

  const [page, setPage] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  const [tocItems, setTocItems] = useState<TocItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [matchInfo, setMatchInfo] = useState<{ count: number; index: number }>({
    count: 0,
    index: 0
  })
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [bmOpen, setBmOpen] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [rulerTop, setRulerTop] = useState<number | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [selTool, setSelTool] = useState<{
    x: number
    y: number
    start: number
    end: number
    text: string
  } | null>(null)

  useEffect(() => {
    onPositionChangeRef.current = props.onPositionChange
  }, [props.onPositionChange])

  const applyTransform = useCallback((p: number) => {
    const ct = contentRef.current
    if (ct) ct.style.transform = `translateX(${-p * cppRef.current * stepRef.current}px)`
  }, [])

  const pageOfElement = useCallback((el: Element): number => {
    const ct = contentRef.current
    if (!ct) return 0
    const cs = getComputedStyle(ct)
    const padL = parseFloat(cs.paddingLeft) || 0
    const cRect = ct.getBoundingClientRect()
    const eRect = el.getBoundingClientRect()
    const col = Math.max(0, Math.round((eRect.left - cRect.left - padL) / stepRef.current))
    return Math.floor(col / cppRef.current)
  }, [])

  const updateActive = useCallback((p: number) => {
    let id: string | null = null
    for (const x of headingPagesRef.current) {
      if (x.page <= p) id = x.id
      else break
    }
    setActiveId(id)
  }, [])

  const goToPage = useCallback(
    (p: number) => {
      const clamped = Math.max(0, Math.min(pageCountRef.current - 1, p))
      pageRef.current = clamped
      setPage(clamped)
      applyTransform(clamped)
      updateActive(clamped)
    },
    [applyTransform, updateActive]
  )

  const next = useCallback(() => goToPage(pageRef.current + 1), [goToPage])
  const prev = useCallback(() => goToPage(pageRef.current - 1), [goToPage])

  const goToHeading = useCallback(
    (id: string) => {
      const found = headingPagesRef.current.find((x) => x.id === id)
      if (found) goToPage(found.page)
    },
    [goToPage]
  )

  const captureAnchor = useCallback(() => {
    const ct = contentRef.current
    if (!ct) {
      restoreRef.current = null
      return
    }
    let chosen: string | null = null
    for (const h of Array.from(ct.querySelectorAll<HTMLElement>(HEADING_SEL))) {
      if (!h.id) continue
      if (pageOfElement(h) <= pageRef.current) chosen = h.id
      else break
    }
    restoreRef.current = {
      anchorId: chosen,
      ratio: pageCountRef.current > 1 ? pageRef.current / (pageCountRef.current - 1) : 0
    }
  }, [pageOfElement])

  const recompute = useCallback(
    (opts: { restore: boolean; target?: number }) => {
      const vp = viewportRef.current
      const ct = contentRef.current
      if (!vp || !ct) return

      const cs = getComputedStyle(ct)
      const gap = parseFloat(cs.columnGap) || 0
      const readingPx = measureRef.current?.offsetWidth || 600
      const mainEl = vp.parentElement
      const avail = mainEl ? mainEl.clientWidth : vp.clientWidth
      const cpp = settings.twoPage && avail >= 2 * readingPx + gap + 24 ? 2 : 1
      cppRef.current = cpp
      vp.style.maxWidth = cpp * readingPx + (cpp - 1) * gap + 'px'

      const padL = parseFloat(cs.paddingLeft) || 0
      const padR = parseFloat(cs.paddingRight) || 0
      const innerW = vp.clientWidth - padL - padR
      const colWidth = Math.max(1, (innerW - (cpp - 1) * gap) / cpp)
      ct.style.columnWidth = colWidth + 'px'
      const colStep = colWidth + gap
      stepRef.current = colStep

      const totalCols = Math.max(1, Math.round((ct.scrollWidth + gap) / colStep))
      const total = Math.max(1, Math.ceil(totalCols / cpp))
      pageCountRef.current = total
      setPageCount(total)

      const items: TocItem[] = []
      const pages: { id: string; page: number }[] = []
      for (const h of Array.from(ct.querySelectorAll<HTMLElement>(HEADING_SEL))) {
        if (!h.id) continue
        const p = Math.min(total - 1, pageOfElement(h))
        items.push({ id: h.id, level: Number(h.tagName.slice(1)), text: h.textContent ?? '' })
        pages.push({ id: h.id, page: p })
      }
      headingPagesRef.current = pages
      setTocItems(items)

      let nextPage = pageRef.current
      if (typeof opts.target === 'number') {
        nextPage = opts.target
      } else if (opts.restore && restoreRef.current) {
        const r = restoreRef.current
        const found = r.anchorId ? pages.find((x) => x.id === r.anchorId) : undefined
        nextPage = found ? found.page : Math.round(r.ratio * (total - 1))
      }
      nextPage = Math.max(0, Math.min(total - 1, nextPage))
      pageRef.current = nextPage
      setPage(nextPage)
      applyTransform(nextPage)
      updateActive(nextPage)
    },
    [applyTransform, pageOfElement, updateActive, settings.twoPage]
  )

  useLayoutEffect(() => {
    pageRef.current = 0
    if (contentRef.current) contentRef.current.style.transform = 'translateX(0)'
    recompute({ restore: false, target: 0 })
    let target = 0
    const ip = initialPosition
    if (ip?.anchorId) {
      const f = headingPagesRef.current.find((x) => x.id === ip.anchorId)
      target = f ? f.page : ip.page || 0
    } else if (ip?.page) {
      target = ip.page
    }
    if (target > 0) goToPage(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey])

  useEffect(() => {
    const ct = contentRef.current
    const vp = viewportRef.current
    if (!ct || !vp) return
    const reflow = debounce(() => {
      captureAnchor()
      recompute({ restore: true })
    }, 120)
    const ro = new ResizeObserver(reflow)
    ro.observe(vp)
    if (vp.parentElement) ro.observe(vp.parentElement)
    ct.addEventListener('md-content-resized', reflow)

    const cleanups: Array<() => void> = []
    for (const img of Array.from(ct.querySelectorAll('img'))) {
      if (!img.complete) {
        img.addEventListener('load', reflow)
        img.addEventListener('error', reflow)
        cleanups.push(() => {
          img.removeEventListener('load', reflow)
          img.removeEventListener('error', reflow)
        })
      }
    }
    return () => {
      ro.disconnect()
      reflow.cancel()
      ct.removeEventListener('md-content-resized', reflow)
      cleanups.forEach((c) => c())
    }
  }, [fileKey, content, captureAnchor, recompute])

  useEffect(() => {
    captureAnchor()
    recompute({ restore: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.fontSizePx,
    settings.lineHeight,
    settings.readingWidthCh,
    settings.twoPage,
    // These all change how the rendered text flows, so the paginator must re-measure too.
    settings.fontWeight,
    settings.letterSpacing,
    settings.paragraphSpacing,
    settings.margins,
    settings.fontFamily,
    settings.justify
  ])

  useEffect(() => {
    const t = setTimeout(() => {
      let id: string | null = null
      for (const x of headingPagesRef.current) {
        if (x.page <= pageRef.current) id = x.id
        else break
      }
      const total = pageCountRef.current
      onPositionChangeRef.current({
        page: pageRef.current,
        anchorId: id,
        progress: total > 0 ? (pageRef.current + 1) / total : 0,
        updatedAt: Date.now()
      })
    }, 400)
    return () => clearTimeout(t)
  }, [page])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      if (lightbox) {
        if (e.key === 'Escape') setLightbox(null)
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        prev()
      } else if (e.key === 'Home') {
        e.preventDefault()
        goToPage(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        goToPage(pageCountRef.current - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, goToPage, lightbox])

  useEffect(() => {
    const ct = contentRef.current
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const highlights = w.CSS?.highlights
    const HighlightCtor = w.Highlight
    const clear = (): void => {
      highlights?.delete('mdsearch')
      matchPagesRef.current = []
      matchIndexRef.current = 0
      setMatchInfo({ count: 0, index: 0 })
    }
    if (!ct) return
    const q = searchQuery.trim()
    if (q.length < 2 || !highlights || !HighlightCtor) {
      clear()
      return
    }
    const ranges: Range[] = []
    const pages: number[] = []
    const lower = q.toLowerCase()
    const walker = document.createTreeWalker(ct, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      const hay = (node.nodeValue ?? '').toLowerCase()
      let idx = hay.indexOf(lower)
      while (idx >= 0) {
        const r = document.createRange()
        r.setStart(node, idx)
        r.setEnd(node, idx + q.length)
        ranges.push(r)
        pages.push(node.parentElement ? pageOfElement(node.parentElement) : 0)
        idx = hay.indexOf(lower, idx + q.length)
      }
    }
    if (ranges.length === 0) {
      clear()
      return
    }
    highlights.set('mdsearch', new HighlightCtor(...ranges))
    matchPagesRef.current = pages
    matchIndexRef.current = 0
    setMatchInfo({ count: ranges.length, index: 0 })
    goToPage(pages[0])
    return () => highlights.delete('mdsearch')
  }, [searchQuery, fileKey, content, pageOfElement, goToPage])

  // Render persisted highlights via the CSS Custom Highlight API.
  useEffect(() => {
    const ct = contentRef.current
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const highlights = w.CSS?.highlights
    const HL = w.Highlight
    if (!ct || !highlights || !HL) return
    for (const c of HL_COLORS) highlights.delete('annot-' + c)
    const byColor: Record<string, Range[]> = {}
    for (const a of annotations) {
      const r = rangeForOffsets(ct, a.start, a.end)
      if (r) (byColor[a.color] ??= []).push(r)
    }
    for (const c of HL_COLORS)
      if (byColor[c]?.length) highlights.set('annot-' + c, new HL(...byColor[c]))
    return () => {
      for (const c of HL_COLORS) highlights.delete('annot-' + c)
    }
  }, [annotations, fileKey, content])

  const onViewportMouseUp = useCallback(() => {
    const ct = contentRef.current
    if (!ct) return
    const off = getSelectionOffsets(ct)
    const sel = window.getSelection()
    if (!off || !sel || sel.rangeCount === 0) {
      setSelTool(null)
      return
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    setSelTool({
      x: rect.left + rect.width / 2,
      y: rect.top,
      start: off.start,
      end: off.end,
      text: off.text
    })
  }, [])

  const addHighlight = useCallback(
    (color: HighlightColor) => {
      if (!selTool) return
      const a: Annotation = {
        id: uid(),
        start: selTool.start,
        end: selTool.end,
        color,
        text: selTool.text,
        createdAt: Date.now()
      }
      props.onAnnotationsChange([...annotations, a])
      window.getSelection()?.removeAllRanges()
      setSelTool(null)
    },
    [selTool, annotations, props]
  )

  const updateAnn = useCallback(
    (id: string, patch: Partial<Annotation>) => {
      props.onAnnotationsChange(annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)))
    },
    [annotations, props]
  )
  const removeAnn = useCallback(
    (id: string) => props.onAnnotationsChange(annotations.filter((a) => a.id !== id)),
    [annotations, props]
  )
  const toggleCard = useCallback(
    (a: Annotation) => {
      if (a.card) {
        props.onAnnotationsChange(
          annotations.map((x) => {
            if (x.id !== a.id) return x
            const copy = { ...x }
            delete copy.card
            return copy
          })
        )
      } else {
        updateAnn(a.id, { card: newCard(a.note || a.text.slice(0, 80)) })
      }
    },
    [annotations, props, updateAnn]
  )
  const jumpAnn = useCallback(
    (a: Annotation) => {
      const ct = contentRef.current
      if (!ct) return
      const r = rangeForOffsets(ct, a.start, a.end)
      const el = r?.startContainer.parentElement
      if (el) goToPage(pageOfElement(el))
    },
    [goToPage, pageOfElement]
  )

  const gotoMatch = useCallback(
    (dir: number) => {
      const pages = matchPagesRef.current
      if (pages.length === 0) return
      const index = (matchIndexRef.current + dir + pages.length) % pages.length
      matchIndexRef.current = index
      setMatchInfo({ count: pages.length, index })
      goToPage(pages[index])
    },
    [goToPage]
  )

  useEffect(() => {
    return () => {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    }
  }, [fileKey])

  const toggleSpeak = useCallback(() => {
    if (typeof speechSynthesis === 'undefined') return
    if (speaking) {
      speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const text = contentRef.current?.innerText ?? ''
    if (!text.trim()) return
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text.slice(0, 32000))
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    speechSynthesis.speak(u)
    setSpeaking(true)
  }, [speaking])

  const onLinkActivate = useCallback(
    (href: string) => {
      if (!href) return
      if (href.startsWith('#')) {
        goToHeading(decodeURIComponent(href.slice(1)))
      } else if (href.startsWith('wiki:')) {
        props.onOpenWiki(decodeURIComponent(href.slice(5)))
      } else if (/^(https?:|mailto:)/i.test(href)) {
        window.api.openExternal(href)
      } else {
        props.onOpenRelative(href)
      }
    },
    [goToHeading, props]
  )

  const onViewportClick = useCallback(
    (e: React.MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('a, button, input, pre, code, table, img, .katex')) return
      const sel = window.getSelection()
      if (sel && sel.toString().length > 0) return
      const vp = viewportRef.current
      if (!vp) return
      const rect = vp.getBoundingClientRect()
      const x = e.clientX - rect.left
      if (x < rect.width * 0.3) prev()
      else if (x > rect.width * 0.7) next()
    },
    [prev, next]
  )

  const components = useMemo(
    () =>
      makeComponents(
        baseDir,
        onLinkActivate,
        (src) => setLightbox(src),
        settings.allowRemoteImages,
        settings.theme
      ),
    [baseDir, onLinkActivate, settings.allowRemoteImages, settings.theme]
  )

  // Memoized so page flips (setPage) and unrelated settings changes don't re-parse the whole doc.
  const rendered = useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
        urlTransform={urlTransform}
      >
        {content}
      </ReactMarkdown>
    ),
    [content, components]
  )

  const currentAnchorId = useCallback((): string | null => {
    let id: string | null = null
    for (const x of headingPagesRef.current) {
      if (x.page <= pageRef.current) id = x.id
      else break
    }
    return id
  }, [])

  const pageBookmarked = bookmarks.some((b) => b.page === page)

  const toggleBookmark = useCallback(() => {
    const existing = bookmarks.find((b) => b.page === pageRef.current)
    if (existing) {
      props.onBookmarksChange(bookmarks.filter((b) => b.id !== existing.id))
      return
    }
    const anchorId = currentAnchorId()
    const label = tocItems.find((t) => t.id === anchorId)?.text || `Page ${pageRef.current + 1}`
    const bm: Bookmark = {
      id: uid(),
      anchorId,
      page: pageRef.current,
      label,
      createdAt: Date.now()
    }
    props.onBookmarksChange([...bookmarks, bm].sort((a, b) => a.page - b.page))
  }, [bookmarks, props, currentAnchorId, tocItems])

  const jumpBookmark = useCallback(
    (bm: Bookmark) => {
      setBmOpen(false)
      if (bm.anchorId && headingPagesRef.current.some((x) => x.id === bm.anchorId)) {
        goToHeading(bm.anchorId)
      } else {
        goToPage(bm.page)
      }
    },
    [goToHeading, goToPage]
  )

  const progress = pageCount > 1 ? page / (pageCount - 1) : 1

  return (
    <div className="reader-layout">
      {tocOpen && (
        <Toc
          items={tocItems}
          activeId={activeId}
          onSelect={(id) => goToHeading(id)}
          backlinks={backlinks}
          onOpenBacklink={props.onOpenPath}
        />
      )}
      <div
        className="reader-main"
        onMouseMove={(e) => {
          if (!settings.focusRuler) {
            if (rulerTop !== null) setRulerTop(null)
            return
          }
          setRulerTop(e.clientY - e.currentTarget.getBoundingClientRect().top)
        }}
      >
        <div className="reader-measure" ref={measureRef} aria-hidden="true" />
        {settings.focusRuler && rulerTop != null && (
          <div className="focus-ruler" style={{ top: rulerTop }} aria-hidden="true" />
        )}
        {matchInfo.count > 0 && (
          <div className="search-nav">
            <span className="search-count">
              {matchInfo.index + 1} / {matchInfo.count}
            </span>
            <button type="button" onClick={() => gotoMatch(-1)} aria-label="Previous match">
              ‹
            </button>
            <button type="button" onClick={() => gotoMatch(1)} aria-label="Next match">
              ›
            </button>
          </div>
        )}
        <div
          className="reader-viewport"
          ref={viewportRef}
          onClick={onViewportClick}
          onMouseUp={onViewportMouseUp}
        >
          <div className="reader-content markdown-body" ref={contentRef}>
            {rendered}
          </div>
        </div>
        <div className="progress-track" title={`${Math.round(progress * 100)}% read`}>
          <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="reader-controls">
          <div className="controls-side">
            <button
              type="button"
              className={'icon-btn' + (pageBookmarked ? ' is-active' : '')}
              onClick={toggleBookmark}
              title={pageBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
            >
              {pageBookmarked ? '🔖' : '🏷'}
            </button>
            <div className="bm-wrap">
              <button
                type="button"
                className="icon-btn"
                onClick={() => setBmOpen((o) => !o)}
                title="Bookmarks"
                disabled={bookmarks.length === 0}
              >
                ☰<sup>{bookmarks.length || ''}</sup>
              </button>
              {bmOpen && bookmarks.length > 0 && (
                <div className="bm-popover">
                  {bookmarks.map((b) => (
                    <div key={b.id} className="bm-row">
                      <button type="button" className="bm-jump" onClick={() => jumpBookmark(b)}>
                        <span className="bm-label">{b.label}</span>
                        <span className="bm-page">p.{b.page + 1}</span>
                      </button>
                      <button
                        type="button"
                        className="bm-del"
                        onClick={() =>
                          props.onBookmarksChange(bookmarks.filter((x) => x.id !== b.id))
                        }
                        aria-label="Delete bookmark"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className={'icon-btn' + (notesOpen ? ' is-active' : '')}
              onClick={() => setNotesOpen((o) => !o)}
              title="Highlights & notes"
            >
              🖍<sup>{annotations.length || ''}</sup>
            </button>
          </div>
          <button
            type="button"
            className="page-btn"
            onClick={prev}
            disabled={page <= 0}
            aria-label="Previous page"
          >
            ‹ Prev
          </button>
          <span className="page-indicator">
            Page {page + 1} of {pageCount}
          </span>
          <button
            type="button"
            className="page-btn"
            onClick={next}
            disabled={page >= pageCount - 1}
            aria-label="Next page"
          >
            Next ›
          </button>
          <div className="controls-side controls-right">
            <button
              type="button"
              className={'icon-btn' + (speaking ? ' is-active' : '')}
              onClick={toggleSpeak}
              title={speaking ? 'Stop reading aloud' : 'Read aloud'}
            >
              🔊
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => window.print()}
              title="Print / Save as PDF"
            >
              ⎙
            </button>
          </div>
        </div>
      </div>
      {notesOpen && (
        <aside className="notes-panel">
          <div className="toc-title">Highlights &amp; notes ({annotations.length})</div>
          {annotations.length === 0 ? (
            <p className="toc-empty">Select text in the page to highlight it.</p>
          ) : (
            [...annotations]
              .sort((a, b) => a.start - b.start)
              .map((a) => (
                <div key={a.id} className={'note-card hl-' + a.color}>
                  <button type="button" className="note-text" onClick={() => jumpAnn(a)}>
                    {a.text}
                  </button>
                  <textarea
                    className="note-input"
                    placeholder="Add a note…"
                    rows={2}
                    value={a.note ?? ''}
                    onChange={(e) => updateAnn(a.id, { note: e.target.value })}
                  />
                  {a.card && (
                    <input
                      className="card-q"
                      placeholder="Flashcard question…"
                      value={a.card.question}
                      onChange={(e) =>
                        updateAnn(a.id, { card: { ...a.card!, question: e.target.value } })
                      }
                    />
                  )}
                  <div className="note-actions">
                    <button
                      type="button"
                      className={'mini' + (a.card ? ' is-active' : '')}
                      onClick={() => toggleCard(a)}
                      title={a.card ? 'Remove flashcard' : 'Make flashcard'}
                    >
                      🃏
                    </button>
                    <button
                      type="button"
                      className="mini"
                      onClick={() => removeAnn(a.id)}
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))
          )}
        </aside>
      )}
      {selTool && (
        <div
          className="sel-toolbar"
          style={{ left: selTool.x, top: selTool.y }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {HL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={'sw sw-' + c}
              onClick={() => addHighlight(c)}
              title={'Highlight ' + c}
            />
          ))}
          <button
            type="button"
            className="sel-ai"
            title="Explain with AI"
            onClick={() => {
              const t = selTool?.text ?? ''
              window.getSelection()?.removeAllRanges()
              setSelTool(null)
              if (t) props.onAiExplain(t)
            }}
          >
            ✨
          </button>
        </div>
      )}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          {(() => {
            let base = ''
            let p = ''
            try {
              const u = new URL(lightbox)
              base = decodeURIComponent(u.searchParams.get('base') ?? '')
              p = decodeURIComponent(u.searchParams.get('p') ?? '')
            } catch {
              /* not an mdimg url (data:/blob:) - no local path */
            }
            const localPath = p ? (/^([a-zA-Z]:[\\/]|\/)/.test(p) ? p : `${base}/${p}`) : ''
            return (
              <div className="lightbox-actions" onClick={(e) => e.stopPropagation()}>
                {localPath && (
                  <>
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => void navigator.clipboard?.writeText(localPath).catch(() => {})}
                    >
                      Copy path
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => void window.api.showItem(base, p)}
                    >
                      Open in Explorer
                    </button>
                  </>
                )}
                <button type="button" className="btn btn-small" onClick={() => setLightbox(null)}>
                  Close
                </button>
              </div>
            )
          })()}
          <img src={lightbox} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
