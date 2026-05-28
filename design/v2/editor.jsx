// Editor view: split markdown + live preview
const { Ico, DOCS, renderMd, highlightMd } = window.MDR;
const { useState, useRef, useEffect } = React;

function Editor({ book }) {
  const initial = DOCS[book.id] || `# ${book.title}\n\nStart writing…`;
  const [src, setSrc] = useState(initial);
  const [saved, setSaved] = useState(true);
  const taRef = useRef(null);
  const ghostRef = useRef(null);

  useEffect(() => { setSrc(initial); setSaved(true); }, [book.id, initial]);

  useEffect(() => {
    if (!ghostRef.current) return;
    ghostRef.current.innerHTML = highlightMd(src) + '\n';
  }, [src]);

  // autosave indicator
  useEffect(() => {
    if (saved) return;
    const t = setTimeout(() => setSaved(true), 1200);
    return () => clearTimeout(t);
  }, [src, saved]);

  const insert = (before, after = '') => {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const v = ta.value;
    const sel = v.slice(s, e);
    const next = v.slice(0, s) + before + sel + after + v.slice(e);
    setSrc(next); setSaved(false);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(s + before.length, s + before.length + sel.length);
    }, 0);
  };

  const html = renderMd(src);
  const words = src.replace(/[#*_`>\-]/g, ' ').split(/\s+/).filter(Boolean).length;
  const mins = Math.max(1, Math.round(words / 200));

  return (
    <div className="editor-grid">
      <div className="editor-pane">
        <div className="editor-toolbar">
          <button className="tb-btn" onClick={() => insert('# ')} title="Heading 1">H1</button>
          <button className="tb-btn" onClick={() => insert('## ')} title="Heading 2">H2</button>
          <button className="tb-btn" onClick={() => insert('### ')} title="Heading 3">H3</button>
          <span className="tb-divider"/>
          <button className="tb-btn" onClick={() => insert('**', '**')} title="Bold"><strong>B</strong></button>
          <button className="tb-btn" onClick={() => insert('*', '*')} title="Italic"><em>I</em></button>
          <button className="tb-btn" onClick={() => insert('`', '`')} title="Inline code">{'</>'}</button>
          <span className="tb-divider"/>
          <button className="tb-btn" onClick={() => insert('- ')} title="List">• List</button>
          <button className="tb-btn" onClick={() => insert('- [ ] ')} title="Task">☐ Task</button>
          <button className="tb-btn" onClick={() => insert('| col | col |\n| --- | --- |\n| ', ' |\n')} title="Table">Table</button>
          <button className="tb-btn" onClick={() => insert('\n```\n', '\n```\n')} title="Code">Code</button>
          <button className="tb-btn" onClick={() => insert('> [!tip] ', '\n')} title="Callout">Callout</button>
          <span className="tb-divider"/>
          <button className="tb-btn" onClick={() => insert('[[', ']]')} title="Wiki link">[[link]]</button>
          <button className="tb-btn" onClick={() => insert('$', '$')} title="Inline math">$ƒ$</button>
          <div className="tb-status">
            <span>{words} words · {mins} min</span>
            <span style={{margin:'0 6px'}}>·</span>
            {saved ? (
              <span className="tb-saved" style={{display:'inline-flex',alignItems:'center',gap:5,color:'var(--good)'}}>
                <span className="dot"/> Saved
              </span>
            ) : (
              <span style={{color:'var(--warn)'}}>Saving…</span>
            )}
          </div>
        </div>
        <div className="code-area" style={{position:'relative'}}>
          <pre
            ref={ghostRef}
            aria-hidden="true"
            style={{
              position:'absolute', inset:'24px 32px 60px', margin:0, padding:0,
              fontFamily:'var(--font-mono)', fontSize:'13.5px', lineHeight:'1.65',
              color:'var(--ink-2)', whiteSpace:'pre-wrap', wordBreak:'break-word',
              pointerEvents:'none'
            }}
          />
          <textarea
            ref={taRef}
            value={src}
            onChange={e => { setSrc(e.target.value); setSaved(false); }}
            spellCheck={false}
            style={{
              position:'absolute', inset:'24px 32px 60px',
              background:'transparent', border:'none', outline:'none',
              fontFamily:'var(--font-mono)', fontSize:'13.5px', lineHeight:'1.65',
              color:'transparent', caretColor:'var(--ink)',
              resize:'none', width:'calc(100% - 64px)',
              whiteSpace:'pre-wrap', wordBreak:'break-word',
            }}
          />
        </div>
      </div>
      <div className="editor-pane">
        <div className="editor-toolbar" style={{justifyContent:'space-between'}}>
          <span style={{fontSize:12, color:'var(--muted)', fontWeight:500, letterSpacing:'0.02em'}}>PREVIEW</span>
          <span style={{fontSize:11.5, color:'var(--faint)'}}>Live · {book.title}</span>
        </div>
        <div className="preview-area">
          <article className="page size-md" style={{maxWidth:'62ch'}} dangerouslySetInnerHTML={{ __html: html }}/>
        </div>
      </div>
    </div>
  );
}

window.Editor = Editor;
