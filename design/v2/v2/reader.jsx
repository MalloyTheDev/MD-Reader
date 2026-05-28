// v2 Reader — TOC slides in as left panel (not always-visible)
const { Ico, DOCS, BOOKS, renderMd, tocOf } = window.MDR;
const { useState, useEffect, useRef, useMemo } = React;

function ReaderV2({ book, fontSize, showToc, find, setFind, onWiki }) {
  const src = DOCS[book.id] || `# ${book.title}\n\n*Sample content for this document is not yet written.*`;
  const html = useMemo(() => renderMd(src), [src]);
  const toc = useMemo(() => tocOf(src), [src]);

  const pageRef = useRef(null);
  const scrollRef = useRef(null);
  const [ranges, setRanges] = useState([]);
  const [page, setPage] = useState(0);
  const [activeHeading, setActiveHeading] = useState(null);

  // Compute pages
  useEffect(() => {
    if (!pageRef.current || !scrollRef.current) return;
    const containerH = scrollRef.current.clientHeight - 64;
    const children = Array.from(pageRef.current.children);
    const next = [];
    let start = 0, used = 0;
    children.forEach((el, idx) => {
      const h = el.offsetHeight + 8;
      if (used + h > containerH && idx > start) {
        next.push([start, idx - 1]);
        start = idx; used = h;
      } else {
        used += h;
      }
    });
    if (start < children.length) next.push([start, children.length - 1]);
    setRanges(next);
    setPage(0);
  }, [html, fontSize]);

  // Show only children in current page range
  useEffect(() => {
    if (!pageRef.current || !ranges.length) return;
    const [s, e] = ranges[page] || [0, 0];
    Array.from(pageRef.current.children).forEach((el, i) => {
      el.style.display = (i >= s && i <= e) ? '' : 'none';
    });
    const visible = Array.from(pageRef.current.children).slice(s, e + 1);
    const h = visible.find(el => /^H[1-3]$/.test(el.tagName));
    setActiveHeading(h?.id || null);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [page, ranges]);

  // wiki link delegation
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
        e.preventDefault(); setPage(p => Math.min(ranges.length - 1, p + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault(); setPage(p => Math.max(0, p - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ranges.length]);

  // Find: highlight matches on current page
  useEffect(() => {
    if (!pageRef.current) return;
    pageRef.current.querySelectorAll('mark.find').forEach(m => {
      const t = document.createTextNode(m.textContent);
      m.parentNode.replaceChild(t, m);
    });
    pageRef.current.normalize();
    if (!find?.trim()) return;
    const q = find.toLowerCase();
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
  }, [find, page]);

  const jumpHead = (id) => {
    if (!pageRef.current || !ranges.length) return;
    const children = Array.from(pageRef.current.children);
    const idx = children.findIndex(el => el.id === id);
    if (idx === -1) return;
    const pg = ranges.findIndex(([s, e]) => idx >= s && idx <= e);
    if (pg >= 0) setPage(pg);
  };

  return (
    <div className={`read2 ${showToc ? 'toc-open' : ''}`}>
      {showToc && (
        <aside className="toc2">
          <h4>Contents</h4>
          {toc.map(t => (
            <button
              key={t.id}
              className={`tl h${t.level} ${activeHeading === t.id ? 'active' : ''}`}
              onClick={() => jumpHead(t.id)}
            >
              {t.text}
            </button>
          ))}
          {toc.length === 0 && <div style={{fontSize:12, color:'var(--faint)', padding:'4px 10px'}}>No headings.</div>}
        </aside>
      )}

      <div className="stage2">
        <div className="page-scroll2" ref={scrollRef}>
          <article ref={pageRef} className={`page2 size-${fontSize}`} dangerouslySetInnerHTML={{ __html: html }}/>
        </div>
        <div className="pgf">
          <div className="left"/>
          <div className="center">
            <button className="nv" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
              <Ico.arrLeft/> Prev
            </button>
            <span>Page {ranges.length ? page + 1 : 0} of {ranges.length}</span>
            <button className="nv" onClick={() => setPage(p => Math.min(ranges.length - 1, p + 1))} disabled={page >= ranges.length - 1}>
              Next <Ico.arrRight/>
            </button>
          </div>
          <div className="right">
            <div className="dots">
              {ranges.map((_, i) => (
                <button key={i} className={`dot ${i === page ? 'on' : ''}`} onClick={() => setPage(i)} title={`Page ${i + 1}`}/>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.ReaderV2 = ReaderV2;
