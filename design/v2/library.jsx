// Library view
const { Ico, BOOKS, spineStyle } = window.MDR;

function Library({ onOpen, query, activeCollection }) {
  const filtered = React.useMemo(() => {
    const q = (query || '').trim().toLowerCase();
    return BOOKS.filter(b => {
      if (activeCollection === 'recent') return true;
      if (activeCollection === 'tags-demo') return b.tags.includes('demo');
      if (activeCollection === 'tags-guide') return b.tags.includes('guide');
      if (activeCollection === 'tags-reference') return b.tags.includes('reference');
      if (activeCollection === 'unread') return b.read < 0.05;
      if (activeCollection === 'finished') return b.read >= 1;
      return true;
    }).filter(b => !q || b.title.toLowerCase().includes(q));
  }, [query, activeCollection]);

  const continueReading = BOOKS.filter(b => b.read > 0.02 && b.read < 0.99).slice(0, 3);
  const totalWords = BOOKS.reduce((a, b) => a + b.words, 0);
  const reading = BOOKS.filter(b => b.read > 0 && b.read < 1).length;
  const finished = BOOKS.filter(b => b.read >= 1).length;

  return (
    <div className="lib fade-in">
      <div className="lib-hero">
        <div>
          <h1>{titleFor(activeCollection)}</h1>
          <p className="lede">{ledeFor(activeCollection, BOOKS.length)}</p>
        </div>
        <div className="lib-stats">
          <div className="lib-stat"><div className="n">{BOOKS.length}</div><div className="l">Files</div></div>
          <div className="lib-stat"><div className="n">{reading}</div><div className="l">In progress</div></div>
          <div className="lib-stat"><div className="n">{finished}</div><div className="l">Finished</div></div>
          <div className="lib-stat"><div className="n">{(totalWords / 1000).toFixed(1)}k</div><div className="l">Words</div></div>
        </div>
      </div>

      <div className="qa-row">
        <button className="qa primary"><Ico.plus className="icon"/> New note</button>
        <button className="qa"><Ico.folder className="icon"/> Import folder</button>
        <button className="qa"><Ico.layers className="icon"/> Template</button>
        <button className="qa"><Ico.card className="icon"/> Flashcards <span style={{color:'var(--faint)',marginLeft:4}}>· 12 due</span></button>
        <button className="qa"><Ico.check className="icon"/> Tasks <span style={{color:'var(--faint)',marginLeft:4}}>· 3 open</span></button>
      </div>

      {continueReading.length > 0 && activeCollection === 'recent' && (
        <>
          <div className="section-head">
            <h2>Continue reading</h2>
            <div className="meta">{continueReading.length} in progress</div>
          </div>
          <div className="continue-row">
            {continueReading.map(b => (
              <button key={b.id} className="cont-card" onClick={() => onOpen(b)}>
                <div className="cont-spine" style={spineStyle(b.spine)}/>
                <div className="cont-body">
                  <div className="cont-title">{b.title}</div>
                  <div className="cont-sub">
                    <span>{Math.round(b.read * 100)}% read</span>
                    <span style={{color:'var(--faint)'}}>·</span>
                    <span>{b.updated}</span>
                  </div>
                  <div className="cont-progress" style={{marginTop: 'auto'}}><i style={{ width: `${b.read * 100}%` }}/></div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="section-head">
        <h2>{activeCollection === 'recent' ? 'All books' : ''}{activeCollection === 'recent' ? '' : ''}</h2>
        <div className="meta">{filtered.length} file{filtered.length === 1 ? '' : 's'}</div>
      </div>

      <div className="shelves">
        {filtered.map(b => (
          <button key={b.id} className={`book ${b.read >= 1 ? 'read' : ''}`} onClick={() => onOpen(b)}>
            <div className="cover" style={spineStyle(b.spine)}>
              <div className="cover-title">{b.title}</div>
              <div className="cover-corner">{b.label}</div>
            </div>
            <div className="meta">
              <div className="title">{b.title}</div>
              <div className="sub">
                <span>{b.read >= 1 ? 'Finished' : b.read > 0 ? `${Math.round(b.read * 100)}% read` : 'Unread'}</span>
                <span className="dot"/>
                <span>{b.pages} pp</span>
              </div>
              <div className="progress"><i style={{ width: `${Math.max(b.read * 100, 3)}%` }}/></div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div style={{gridColumn:'1 / -1', padding:'40px 20px', textAlign:'center', color:'var(--muted)', fontFamily:'var(--font-read)', fontSize:'15px'}}>
            Nothing here yet. <span style={{color:'var(--accent-ink)', cursor:'pointer'}}>Create a new note</span> or change the filter.
          </div>
        )}
      </div>
    </div>
  );
}

function titleFor(c) {
  switch (c) {
    case 'tags-demo': return 'Demos';
    case 'tags-guide': return 'Guides';
    case 'tags-reference': return 'Reference';
    case 'unread': return 'Unread';
    case 'finished': return 'Finished';
    default: return 'Your library';
  }
}
function ledeFor(c, n) {
  switch (c) {
    case 'tags-demo': return 'Sample documents demonstrating the rendering pipeline.';
    case 'tags-guide': return 'Guides and how-to material for new readers.';
    case 'tags-reference': return 'Things you\u2019ll come back to. Tables, callouts, syntax.';
    case 'unread': return 'Files you haven\u2019t opened yet.';
    case 'finished': return 'Books you\u2019ve read all the way through.';
    default: return `Sample library · ${n} markdown files. Open any one to start reading, or import your own folder.`;
  }
}

window.Library = Library;
