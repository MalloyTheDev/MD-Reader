// v2 Editor — split + preview
const { Ico, DOCS, renderMd, highlightMd } = window.MDR;
const { useState, useRef, useEffect } = React;

function EditorV2({ book }) {
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
  useEffect(() => {
    if (saved) return;
    const t = setTimeout(() => setSaved(true), 1200);
    return () => clearTimeout(t);
  }, [src, saved]);

  const insert = (before, after = '') => {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const v = ta.value;
    const sel = v.slice(s, e);
    setSrc(v.slice(0, s) + before + sel + after + v.slice(e));
    setSaved(false);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + before.length, s + before.length + sel.length); }, 0);
  };

  const html = renderMd(src);
  const words = src.replace(/[#*_`>\-]/g, ' ').split(/\s+/).filter(Boolean).length;
  const mins = Math.max(1, Math.round(words / 200));

  return (
    <div className="ed2">
      <div className="ed2-pane">
        <div className="ed2-bar">
          <button className="tb" onClick={() => insert('# ')}>H1</button>
          <button className="tb" onClick={() => insert('## ')}>H2</button>
          <button className="tb" onClick={() => insert('### ')}>H3</button>
          <span className="div"/>
          <button className="tb" onClick={() => insert('**', '**')}><strong>B</strong></button>
          <button className="tb" onClick={() => insert('*', '*')}><em>I</em></button>
          <button className="tb" onClick={() => insert('`', '`')}>{'</>'}</button>
          <span className="div"/>
          <button className="tb" onClick={() => insert('- ')}>• List</button>
          <button className="tb" onClick={() => insert('- [ ] ')}>☐ Task</button>
          <button className="tb" onClick={() => insert('| col | col |\n| --- | --- |\n| ', ' |\n')}>Table</button>
          <button className="tb" onClick={() => insert('\n```\n', '\n```\n')}>Code</button>
          <button className="tb" onClick={() => insert('> [!tip] ', '\n')}>Callout</button>
          <span className="div"/>
          <button className="tb" onClick={() => insert('[[', ']]')}>[[link]]</button>
          <button className="tb" onClick={() => insert('$', '$')}>$ƒ$</button>
          <div className="status">
            <span>{words} words · {mins} min</span>
            <span style={{margin:'0 6px'}}>·</span>
            {saved ? (
              <span style={{display:'inline-flex',alignItems:'center',gap:5,color:'var(--good)'}}>
                <span className="dot"/> Saved
              </span>
            ) : (
              <span style={{color:'var(--warn)'}}>Saving…</span>
            )}
          </div>
        </div>
        <div className="ed2-code">
          <pre ref={ghostRef} aria-hidden="true"/>
          <textarea
            ref={taRef}
            value={src}
            onChange={e => { setSrc(e.target.value); setSaved(false); }}
            spellCheck={false}
          />
        </div>
      </div>
      <div className="ed2-pane">
        <div className="ed2-bar" style={{justifyContent:'space-between'}}>
          <span style={{fontSize:11, color:'var(--faint)', fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase'}}>Preview</span>
          <span style={{fontSize:11.5, color:'var(--faint)'}}>Live · {book.title}</span>
        </div>
        <div className="ed2-prev">
          <article className="page2" style={{maxWidth:'62ch'}} dangerouslySetInnerHTML={{ __html: html }}/>
        </div>
      </div>
    </div>
  );
}

window.EditorV2 = EditorV2;
