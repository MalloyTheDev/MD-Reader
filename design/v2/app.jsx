// Main App, Sidebar, Topbar, Settings, Command Palette
const { Ico, BOOKS } = window.MDR;
const { useState, useEffect, useMemo, useCallback } = React;

function Sidebar({ active, onChange, openCount }) {
  const items = [
    { id: 'recent', icon: Ico.shelf, label: 'Library' },
    { id: 'unread', icon: Ico.book, label: 'Unread' },
    { id: 'finished', icon: Ico.check, label: 'Finished' },
  ];
  const collections = [
    { id: 'tags-guide', icon: Ico.pin, label: 'Guides', count: BOOKS.filter(b => b.tags.includes('guide')).length },
    { id: 'tags-demo', icon: Ico.tag, label: 'Demos', count: BOOKS.filter(b => b.tags.includes('demo')).length },
    { id: 'tags-reference', icon: Ico.tag, label: 'Reference', count: BOOKS.filter(b => b.tags.includes('reference')).length },
  ];
  const tools = [
    { id: 'tasks', icon: Ico.check, label: 'Tasks', count: 3 },
    { id: 'flashcards', icon: Ico.card, label: 'Flashcards', count: 12 },
    { id: 'graph', icon: Ico.graph, label: 'Graph view' },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">M</div>
        <div>
          <div className="brand-name">MD Reader</div>
          <div className="brand-sub">sample-library</div>
        </div>
      </div>

      {items.map(i => (
        <button key={i.id}
          className={`sb-item ${active === i.id ? 'active' : ''}`}
          onClick={() => onChange(i.id)}>
          <i.icon className="icon"/> {i.label}
          {i.id === 'recent' && <span className="sb-count">{BOOKS.length}</span>}
        </button>
      ))}

      <div className="sb-section">Collections</div>
      {collections.map(c => (
        <button key={c.id}
          className={`sb-item ${active === c.id ? 'active' : ''}`}
          onClick={() => onChange(c.id)}>
          <c.icon className="icon"/> {c.label}
          <span className="sb-count">{c.count}</span>
        </button>
      ))}

      <div className="sb-section">Tools</div>
      {tools.map(t => (
        <button key={t.id} className="sb-item" onClick={() => {}}>
          <t.icon className="icon"/> {t.label}
          {t.count != null && <span className="sb-count">{t.count}</span>}
        </button>
      ))}

      <div className="sb-section">Tags</div>
      <div className="sb-tags">
        {['#guide', '#demo', '#reference', '#science', '#tutorial'].map(t => (
          <button key={t} className="sb-tag" onClick={() => {}}>{t}</button>
        ))}
      </div>

      <div className="sidebar-footer">
        <button className="sb-item" onClick={() => onChange('settings')}>
          <Ico.cog className="icon"/> Settings
        </button>
      </div>
    </aside>
  );
}

function Topbar({ tabs, activeTab, onTabClick, onTabClose, onCommand, openBookId, mode, setMode, theme, setTheme, fontSize, setFontSize, onToggleToc, onToggleAi, showToc, showAi }) {
  const inReader = openBookId && (mode === 'read' || mode === 'edit');
  return (
    <>
      <div className="topbar">
        <div className="left">
          {openBookId ? (
            <div className="crumb">
              <Ico.folder/>
              <span>sample-library</span>
              <span className="sep">/</span>
              <span className="current">{tabs.find(t => t.id === openBookId)?.title || ''}</span>
            </div>
          ) : (
            <div className="crumb">
              <span className="current">Library</span>
            </div>
          )}
        </div>
        <div className="center">
          <button className="search-wrap" onClick={onCommand}>
            <Ico.search/>
            <span>Search library, commands, tags…</span>
            <kbd>⌘K</kbd>
          </button>
        </div>
        <div className="right">
          {inReader && (
            <>
              <button className={`icon-btn ${showToc ? 'on' : ''}`} title="Contents (☰)" onClick={onToggleToc}><Ico.toc/></button>
              <button className={`icon-btn ${showAi ? 'on' : ''}`} title="Study assistant" onClick={onToggleAi}><Ico.sparkle/></button>
              <button className={`icon-btn ${mode === 'edit' ? 'on' : ''}`} title="Edit" onClick={() => setMode(mode === 'edit' ? 'read' : 'edit')}><Ico.edit/></button>
              <span style={{width:1,height:18,background:'var(--line)',margin:'0 4px'}}/>
            </>
          )}
          <FontSizeMenu fontSize={fontSize} setFontSize={setFontSize}/>
          <button
            className="icon-btn"
            title={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            {theme === 'light' ? <Ico.moon/> : <Ico.sun/>}
          </button>
        </div>
      </div>
      {tabs.length > 0 && (
        <div className="tabs">
          <button
            className={`tab ${activeTab == null ? 'on' : ''}`}
            onClick={() => onTabClick(null)}>
            <Ico.shelf/> Library
          </button>
          {tabs.map(t => (
            <button key={t.id} className={`tab ${activeTab === t.id ? 'on' : ''}`} onClick={() => onTabClick(t.id)}>
              <Ico.book/> {t.title}
              <span className="x" onClick={(e) => { e.stopPropagation(); onTabClose(t.id); }}><Ico.close/></span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function FontSizeMenu({ fontSize, setFontSize }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDoc = () => setOpen(false);
    setTimeout(() => document.addEventListener('click', onDoc, { once: true }), 0);
  }, [open]);
  return (
    <div style={{ position: 'relative' }}>
      <button className="icon-btn" title="Typography" onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}>
        <Ico.type/>
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position:'absolute', top:38, right:0, width:240,
            background:'var(--bg)', border:'1px solid var(--line)', borderRadius:10,
            boxShadow:'var(--shadow-lg)', padding:14, zIndex:50,
            fontSize:13
          }}>
          <div style={{fontSize:11, color:'var(--faint)', letterSpacing:'0.08em', textTransform:'uppercase', fontWeight:600, marginBottom:8}}>Reading size</div>
          <div className="seg" style={{width:'100%', justifyContent:'space-between'}}>
            {['sm','md','lg','xl'].map(s => (
              <button key={s} className={fontSize === s ? 'on' : ''} onClick={() => setFontSize(s)} style={{flex:1}}>
                {s === 'sm' ? 'Aa' : s === 'md' ? 'Aa' : s === 'lg' ? 'Aa' : 'Aa'}
                <span style={{fontSize: s === 'sm' ? 9 : s === 'md' ? 11 : s === 'lg' ? 13 : 15, marginLeft:4, opacity:0.7}}>{s}</span>
              </button>
            ))}
          </div>
          <div style={{fontSize:11, color:'var(--faint)', letterSpacing:'0.08em', textTransform:'uppercase', fontWeight:600, margin:'14px 0 6px'}}>Quick toggle</div>
          <div style={{fontSize:12, color:'var(--muted)', lineHeight:1.5}}>Open full Settings for font, weight, width, and margins.</div>
        </div>
      )}
    </div>
  );
}

function Settings({ open, onClose, fontSize, setFontSize, fontFamily, setFontFamily, measure, setMeasure, theme, setTheme, accent, setAccent }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Settings</h3>
          <button className="icon-btn" style={{marginLeft:'auto'}} onClick={onClose}><Ico.close/></button>
        </div>
        <div className="modal-body">
          <div className="setting-row">
            <div className="setting-label">
              <div className="name">Theme</div>
              <div className="desc">Light · Sepia is now the default light. Dark for low-light.</div>
            </div>
            <div className="seg">
              <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}>Sepia</button>
              <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}>Dark</button>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-label">
              <div className="name">Reading font</div>
              <div className="desc">The serif used on the page surface.</div>
            </div>
            <div className="seg">
              <button className={fontFamily === 'source' ? 'on' : ''} onClick={() => setFontFamily('source')}>Source Serif</button>
              <button className={fontFamily === 'georgia' ? 'on' : ''} onClick={() => setFontFamily('georgia')}>Georgia</button>
              <button className={fontFamily === 'sans' ? 'on' : ''} onClick={() => setFontFamily('sans')}>Geist Sans</button>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-label">
              <div className="name">Text size</div>
              <div className="desc">Try Cmd+= and Cmd+−.</div>
            </div>
            <div className="seg">
              {['sm','md','lg','xl'].map(s => (
                <button key={s} className={fontSize === s ? 'on' : ''} onClick={() => setFontSize(s)}>{s.toUpperCase()}</button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-label">
              <div className="name">Measure</div>
              <div className="desc">Characters per line — typographers aim for ~65.</div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <input className="slider" type="range" min="48" max="92" value={measure} onChange={e => setMeasure(+e.target.value)}/>
              <span style={{fontVariantNumeric:'tabular-nums', fontSize:13, color:'var(--ink-2)', minWidth:32}}>{measure}ch</span>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-label">
              <div className="name">Accent</div>
              <div className="desc">Used for active state, progress, AI sparkle.</div>
            </div>
            <div className="swatches">
              {[
                ['amber','oklch(0.62 0.13 50)'],
                ['rust','oklch(0.52 0.14 30)'],
                ['forest','oklch(0.50 0.10 145)'],
                ['plum','oklch(0.50 0.13 330)'],
                ['indigo','oklch(0.50 0.13 270)'],
              ].map(([k,c]) => (
                <button key={k} className={`swatch ${accent === k ? 'on' : ''}`} style={{background:c}} onClick={() => setAccent(k)} title={k}/>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommandPalette({ open, onClose, onPick, onOpenBook }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  useEffect(() => { if (open) { setQ(''); setSel(0); } }, [open]);

  const commands = [
    { id: 'new', label: 'New note', icon: Ico.plus, grp: 'Action', run: () => onPick('new') },
    { id: 'import', label: 'Import folder…', icon: Ico.folder, grp: 'Action', run: () => onPick('import') },
    { id: 'settings', label: 'Open Settings', icon: Ico.cog, grp: 'Action', run: () => onPick('settings') },
    { id: 'theme', label: 'Toggle theme', icon: Ico.moon, grp: 'View', run: () => onPick('theme') },
    { id: 'toc', label: 'Toggle table of contents', icon: Ico.toc, grp: 'View', run: () => onPick('toc') },
    { id: 'ai', label: 'Open study assistant', icon: Ico.sparkle, grp: 'AI', run: () => onPick('ai') },
    { id: 'tasks', label: 'Open Tasks dashboard', icon: Ico.check, grp: 'Tools', run: () => onPick('tasks') },
    { id: 'graph', label: 'Open graph view', icon: Ico.graph, grp: 'Tools', run: () => onPick('graph') },
  ];
  const bookItems = BOOKS.map(b => ({
    id: 'book-' + b.id, label: b.title, icon: Ico.book, grp: 'Open',
    run: () => onOpenBook(b),
  }));
  const all = [...commands, ...bookItems];
  const filtered = q
    ? all.filter(x => x.label.toLowerCase().includes(q.toLowerCase()))
    : all.slice(0, 12);

  useEffect(() => { setSel(0); }, [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(filtered.length - 1, s + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); filtered[sel]?.run(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, sel, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="cmdp" onClick={e => e.stopPropagation()}>
        <div className="cmdp-input">
          <Ico.search/>
          <input
            autoFocus
            placeholder="Search library, commands, tags…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        <div className="cmdp-list">
          {filtered.map((c, i) => (
            <button key={c.id} className={`cmdp-item ${i === sel ? 'sel' : ''}`} onClick={() => { c.run(); onClose(); }}>
              <c.icon className="icon"/> {c.label}
              <span className="grp">{c.grp}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div style={{padding:'24px', textAlign:'center', color:'var(--muted)', fontSize:13}}>No matches.</div>
          )}
        </div>
        <div className="cmdp-hint">
          <span><kbd>↑↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Open</span>
          <span><kbd>esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}

// ───────── App root ─────────
function App() {
  const [theme, setTheme] = useState('light');
  const [activeCollection, setActiveCollection] = useState('recent');
  const [openTabs, setOpenTabs] = useState([]); // [book]
  const [activeTab, setActiveTab] = useState(null); // book.id or null
  const [mode, setMode] = useState('read'); // 'read' | 'edit'
  const [showToc, setShowToc] = useState(true);
  const [showAi, setShowAi] = useState(false);
  const [fontSize, setFontSize] = useState('md');
  const [fontFamily, setFontFamily] = useState('source');
  const [measure, setMeasure] = useState(64);
  const [accent, setAccent] = useState('amber');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => { document.body.setAttribute('data-theme', theme); }, [theme]);
  useEffect(() => {
    const map = {
      amber: 'oklch(0.60 0.145 48)',
      rust:  'oklch(0.52 0.145 30)',
      forest:'oklch(0.50 0.10 145)',
      plum:  'oklch(0.50 0.13 330)',
      indigo:'oklch(0.50 0.13 270)',
    };
    document.documentElement.style.setProperty('--accent', map[accent]);
  }, [accent]);

  useEffect(() => {
    const fams = {
      source: "'Source Serif 4', 'Source Serif Pro', Georgia, serif",
      georgia: "Georgia, 'Times New Roman', serif",
      sans: "'Geist', ui-sans-serif, system-ui, sans-serif",
    };
    document.documentElement.style.setProperty('--font-read', fams[fontFamily]);
  }, [fontFamily]);

  useEffect(() => {
    document.documentElement.style.setProperty('--measure', measure + 'ch');
    document.querySelectorAll('.page').forEach(p => p.style.maxWidth = measure + 'ch');
  }, [measure, activeTab, mode]);

  // Cmd+K
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault(); setCmdOpen(o => !o);
      } else if (e.key === ',' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault(); setSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openBook = useCallback((book) => {
    setOpenTabs(t => t.find(x => x.id === book.id) ? t : [...t, book]);
    setActiveTab(book.id);
    setMode('read');
    setShowToc(true);
  }, []);

  const closeTab = useCallback((id) => {
    setOpenTabs(t => t.filter(x => x.id !== id));
    setActiveTab(a => {
      if (a !== id) return a;
      const remaining = openTabs.filter(x => x.id !== id);
      return remaining[remaining.length - 1]?.id ?? null;
    });
  }, [openTabs]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const onPickCmd = (k) => {
    if (k === 'settings') setSettingsOpen(true);
    else if (k === 'theme') setTheme(t => t === 'light' ? 'dark' : 'light');
    else if (k === 'toc') setShowToc(s => !s);
    else if (k === 'ai') setShowAi(true);
    else if (k === 'new') showToast('New note created');
    else if (k === 'import') showToast('Pick a folder to import');
    else if (k === 'tasks') showToast('Tasks view coming soon');
    else if (k === 'graph') showToast('Graph view coming soon');
  };

  const activeBook = openTabs.find(t => t.id === activeTab);

  return (
    <div className="app">
      <Sidebar
        active={activeCollection}
        onChange={(c) => {
          if (c === 'settings') { setSettingsOpen(true); return; }
          setActiveCollection(c); setActiveTab(null);
        }}
        openCount={openTabs.length}
      />
      <div className="main">
        <Topbar
          tabs={openTabs}
          activeTab={activeTab}
          onTabClick={(id) => setActiveTab(id)}
          onTabClose={closeTab}
          onCommand={() => setCmdOpen(true)}
          openBookId={activeTab}
          mode={mode}
          setMode={setMode}
          theme={theme}
          setTheme={setTheme}
          fontSize={fontSize}
          setFontSize={setFontSize}
          onToggleToc={() => setShowToc(s => !s)}
          onToggleAi={() => setShowAi(s => !s)}
          showToc={showToc}
          showAi={showAi}
        />
        <div className="canvas">
          {!activeBook && (
            <Library
              onOpen={openBook}
              activeCollection={activeCollection}
            />
          )}
          {activeBook && mode === 'read' && (
            <Reader
              book={activeBook}
              fontSize={fontSize}
              showToc={showToc}
              showAi={showAi}
              onToggleToc={() => setShowToc(s => !s)}
              onToggleAi={() => setShowAi(s => !s)}
              onWiki={(book) => openBook(book)}
              onOpen={openBook}
            />
          )}
          {activeBook && mode === 'edit' && (
            <Editor book={activeBook}/>
          )}
        </div>
      </div>
      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        fontSize={fontSize} setFontSize={setFontSize}
        fontFamily={fontFamily} setFontFamily={setFontFamily}
        measure={measure} setMeasure={setMeasure}
        theme={theme} setTheme={setTheme}
        accent={accent} setAccent={setAccent}
      />
      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onPick={onPickCmd}
        onOpenBook={openBook}
      />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

window.App = App;
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
