// Reader view: TOC + paginated page + AI rail
const { Ico, DOCS, BOOKS, renderMd, tocOf } = window.MDR;
const { useState, useEffect, useRef, useMemo } = React;

function Reader({ book, fontSize, showToc, showAi, onToggleToc, onToggleAi, onWiki, onOpen }) {
  const src = DOCS[book.id] || `# ${book.title}\n\n*Sample content for this document is not yet written.*`;
  const html = useMemo(() => renderMd(src), [src]);
  const toc = useMemo(() => tocOf(src), [src]);

  // pagination: split rendered DOM into "pages" by counting children up to page-height
  const pageRef = useRef(null);
  const scrollRef = useRef(null);
  const [pageRanges, setPageRanges] = useState([]);
  const [page, setPage] = useState(0);
  const [activeHeading, setActiveHeading] = useState(null);
  const [find, setFind] = useState({ open: false, q: '', n: 0, cur: 0 });

  // After mount: walk children to compute "pages" (each page ~ N children that fit in viewport height)
  useEffect(() => {
    if (!pageRef.current || !scrollRef.current) return;
    const containerH = scrollRef.current.clientHeight - 80;
    const children = Array.from(pageRef.current.children);
    const ranges = [];
    let start = 0, used = 0;
    children.forEach((el, idx) => {
      const h = el.offsetHeight + 8;
      if (used + h > containerH && idx > start) {
        ranges.push([start, idx - 1]);
        start = idx; used = h;
      } else {
        used += h;
      }
    });
    if (start < children.length) ranges.push([start, children.length - 1]);
    setPageRanges(ranges);
    setPage(0);
  }, [html, fontSize]);

  // Show only children in current page range
  useEffect(() => {
    if (!pageRef.current || !pageRanges.length) return;
    const [s, e] = pageRanges[page] || [0, 0];
    Array.from(pageRef.current.children).forEach((el, i) => {
      el.style.display = (i >= s && i <= e) ? '' : 'none';
    });
    // active heading: first heading on the visible page
    const visible = Array.from(pageRef.current.children).slice(s, e + 1);
    const heading = visible.find(el => /^H[1-3]$/.test(el.tagName));
    setActiveHeading(heading?.id || null);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [page, pageRanges]);

  // wiki-link delegation
  useEffect(() => {
    if (!pageRef.current) return;
    const handler = (e) => {
      const w = e.target.closest('a[data-wiki]');
      if (w) {
        e.preventDefault();
        const id = w.dataset.wiki;
        const target = BOOKS.find(b => b.id === id || b.title.toLowerCase().includes(id.toLowerCase()));
        if (target) onWiki(target);
      }
    };
    pageRef.current.addEventListener('click', handler);
    return () => pageRef.current && pageRef.current.removeEventListener('click', handler);
  }, [html, onWiki]);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault(); setPage(p => Math.min(pageRanges.length - 1, p + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault(); setPage(p => Math.max(0, p - 1));
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault(); setFind(f => ({ ...f, open: !f.open }));
      } else if (e.key === 'Escape' && find.open) {
        setFind(f => ({ ...f, open: false }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pageRanges.length, find.open]);

  // Find: highlight matches in current page
  useEffect(() => {
    if (!pageRef.current) return;
    pageRef.current.querySelectorAll('mark.find').forEach(m => {
      const t = document.createTextNode(m.textContent);
      m.parentNode.replaceChild(t, m);
    });
    pageRef.current.normalize();
    if (!find.q.trim() || !find.open) { setFind(f => ({ ...f, n: 0, cur: 0 })); return; }
    const q = find.q.toLowerCase();
    let count = 0;
    const walk = (node) => {
      if (node.nodeType === 3) {
        const text = node.nodeValue;
        const low = text.toLowerCase();
        if (!low.includes(q)) return;
        const frag = document.createDocumentFragment();
        let i = 0;
        while (i < text.length) {
          const idx = low.indexOf(q, i);
          if (idx === -1) { frag.appendChild(document.createTextNode(text.slice(i))); break; }
          if (idx > i) frag.appendChild(document.createTextNode(text.slice(i, idx)));
          const m = document.createElement('mark');
          m.className = 'find' + (count === 0 ? ' cur' : '');
          m.textContent = text.slice(idx, idx + q.length);
          frag.appendChild(m);
          count++;
          i = idx + q.length;
        }
        node.parentNode.replaceChild(frag, node);
      } else if (node.nodeType === 1 && !['SCRIPT','STYLE','MARK'].includes(node.tagName)) {
        Array.from(node.childNodes).forEach(walk);
      }
    };
    Array.from(pageRef.current.children).forEach(c => {
      if (c.style.display !== 'none') walk(c);
    });
    setFind(f => ({ ...f, n: count, cur: count > 0 ? 1 : 0 }));
  }, [find.q, find.open, page]);

  const jumpToHeading = (id) => {
    if (!pageRef.current || !pageRanges.length) return;
    const children = Array.from(pageRef.current.children);
    const idx = children.findIndex(el => el.id === id);
    if (idx === -1) return;
    const pg = pageRanges.findIndex(([s, e]) => idx >= s && idx <= e);
    if (pg >= 0) setPage(pg);
  };

  return (
    <div className={`reader-wrap ${showToc ? 'with-toc' : ''} ${showAi ? 'with-ai' : ''}`}>
      {showToc && (
        <aside className="toc-rail">
          <h4>Contents</h4>
          <ul className="toc-list">
            {toc.map(t => (
              <li key={t.id}>
                <button
                  className={`toc-link h${t.level} ${activeHeading === t.id ? 'active' : ''}`}
                  onClick={() => jumpToHeading(t.id)}
                >
                  {t.text}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}

      <div className="page-stage">
        <div className="page-header">
          <span>{book.title}</span>
          <span className="progress-num">
            {pageRanges.length > 0 ? `Page ${page + 1} of ${pageRanges.length}` : '…'}
          </span>
        </div>
        <div className="page-scroll" ref={scrollRef}>
          {find.open && (
            <div className="find-bar">
              <Ico.search/>
              <input
                autoFocus
                placeholder="Find in document"
                value={find.q}
                onChange={e => setFind(f => ({ ...f, q: e.target.value }))}
              />
              <span className="count">{find.n > 0 ? `${find.cur}/${find.n}` : find.q ? '0/0' : ''}</span>
              <button className="icon-btn" onClick={() => setFind(f => ({...f, open: false}))} title="Close"><Ico.close/></button>
            </div>
          )}
          <article
            ref={pageRef}
            className={`page size-${fontSize}`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
        <div className="page-footer">
          <div className="pf-page">
            <button className="nav-btn" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
              <Ico.arrLeft/> Prev
            </button>
            <span className="pf-num">{pageRanges.length > 0 ? `${page + 1} / ${pageRanges.length}` : '—'}</span>
            <button className="nav-btn" onClick={() => setPage(p => Math.min(pageRanges.length - 1, p + 1))} disabled={page === pageRanges.length - 1}>
              Next <Ico.arrRight/>
            </button>
          </div>
          <div className="pf-bar">
            <i style={{ width: pageRanges.length ? `${((page + 1) / pageRanges.length) * 100}%` : '0%' }}/>
          </div>
          <div className="pf-dots">
            {pageRanges.map((_, i) => (
              <button key={i} className={`dot ${i === page ? 'on' : ''}`} onClick={() => setPage(i)} title={`Page ${i + 1}`}/>
            ))}
          </div>
        </div>
      </div>

      {showAi && (
        <AiRail book={book} onClose={onToggleAi} />
      )}
    </div>
  );
}

window.Reader = Reader;
