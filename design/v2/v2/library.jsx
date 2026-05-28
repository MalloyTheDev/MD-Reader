// v2 Library — replicates original structure: chips → continue → all + inline actions
const { Ico, BOOKS, spineStyle } = window.MDR;
const { useMemo } = React;

function LibraryV2({ onOpen, onAction, activeTags, setActiveTags, sort, setSort }) {
  const allTags = ['demo', 'reference', 'tutorial', 'guide', 'science'];

  const filtered = useMemo(() => {
    let list = BOOKS;
    if (activeTags.length) list = list.filter(b => activeTags.every(t => b.tags.includes(t)));
    list = [...list];
    list.sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title);
      if (sort === 'recent') return a.id.localeCompare(b.id);
      if (sort === 'progress') return b.read - a.read;
      return 0;
    });
    return list;
  }, [activeTags, sort]);

  const cont = BOOKS.filter(b => b.read > 0.02 && b.read < 0.99).slice(0, 7);

  const toggleTag = (t) => {
    setActiveTags(activeTags.includes(t) ? activeTags.filter(x => x !== t) : [...activeTags, t]);
  };

  return (
    <div className="lib2 fade-in">
      <div className="chips">
        {allTags.map(t => (
          <button key={t} className={`chip ${activeTags.includes(t) ? 'on' : ''}`} onClick={() => toggleTag(t)}>
            #{t}
          </button>
        ))}
      </div>

      {cont.length > 0 && activeTags.length === 0 && (
        <>
          <div className="sec-label">
            <h2>Continue reading <span className="count">· {cont.length}</span></h2>
          </div>
          <div className="cont2">
            {cont.map(b => (
              <button key={b.id} className="book2" onClick={() => onOpen(b)}>
                <div className="cover2" style={spineStyle(b.spine)}>
                  <div className="cover2-title">{b.title}</div>
                  <div className="cover2-meta">{b.label}</div>
                </div>
                <div>
                  <div className="b-title">{b.title}</div>
                  <div className="b-sub">{Math.round(b.read * 100)}% read</div>
                  <div className="b-bar"><i style={{ width: `${b.read * 100}%` }}/></div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="all-bar">
        <h2>All books <span className="count">· {filtered.length} {filtered.length === 1 ? 'file' : 'files'}</span></h2>
        <div className="all-actions">
          <button className="act" onClick={() => onAction('tasks')}>
            <Ico.check className="icon"/> Tasks <span className="badge">(3)</span>
          </button>
          <button className="act" onClick={() => onAction('vault')}>
            <Ico.shelf className="icon"/> Vault
          </button>
          <button className="act" onClick={() => onAction('folders')}>
            <Ico.folder className="icon"/> Folders <span className="caret">▾</span>
          </button>
          <button className="act" onClick={() => onAction('new-folder')}>
            <Ico.plus className="icon"/> New folder
          </button>
          <button className="act" onClick={() => onAction('import')}>
            <span style={{display:'inline-flex',width:16,height:16,color:'var(--muted)'}}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16"/></svg></span> Import <span className="caret">▾</span>
          </button>
          <button className="act" onClick={() => onAction('new-course')}>
            <Ico.plus className="icon"/> New course
          </button>
          <button className="act" onClick={() => onAction('readme')}>
            <Ico.sparkle className="icon"/> README
          </button>
          <button className="act primary" onClick={() => onAction('new-note')}>
            <Ico.plus className="icon"/> New note
          </button>
          <button className="act" onClick={() => onAction('template')}>
            <Ico.layers className="icon"/> Template
          </button>
          <div style={{display:'flex',alignItems:'center',gap:6,marginLeft:4}}>
            <span style={{fontSize:11.5,color:'var(--faint)',letterSpacing:'0.06em',textTransform:'uppercase',fontWeight:600}}>Sort</span>
            <select className="sort-select" value={sort} onChange={e => setSort(e.target.value)}>
              <option value="title">Title</option>
              <option value="recent">Recently updated</option>
              <option value="progress">Progress</option>
            </select>
          </div>
        </div>
      </div>

      <div className="shelf2">
        {filtered.map(b => (
          <button key={b.id} className={`book2 ${b.read >= 1 ? 'read' : ''}`} onClick={() => onOpen(b)}>
            <div className="cover2" style={spineStyle(b.spine)}>
              <div className="pin" title="Pin"><Ico.bookmark/></div>
              <div className="cover2-title">{b.title}</div>
              <div className="cover2-meta">{b.label}</div>
            </div>
            <div>
              <div className="b-title">{b.title}</div>
              <div className="b-sub">
                <span>{b.read >= 1 ? 'Finished' : b.read > 0 ? `${Math.round(b.read * 100)}% read` : 'Unread'}</span>
                <span className="dot"/>
                <span>{b.pages} pp</span>
                <span className="dot"/>
                <span>{b.updated}</span>
              </div>
              <div className="b-bar"><i style={{ width: `${Math.max(b.read * 100, 3)}%` }}/></div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="empty">
            <strong>No matches.</strong> Try clearing the filters or <span style={{color:'var(--accent-ink)', cursor:'pointer'}} onClick={() => setActiveTags([])}>show all</span>.
          </div>
        )}
      </div>
    </div>
  );
}

window.LibraryV2 = LibraryV2;
