// v2 App — topbar + tabs + canvas + modals (no sidebar; matches original structure)
const { Ico, BOOKS } = window.MDR;
const { useState, useEffect, useCallback, useRef } = React;

function AppV2() {
  // app state
  const [theme, setTheme] = useState('light');
  const [openTabs, setOpenTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [mode, setMode] = useState('read');
  const [showToc, setShowToc] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQ, setFindQ] = useState('');
  const [activeTags, setActiveTags] = useState([]);
  const [sort, setSort] = useState('title');
  const [prefs, setPrefs] = useState({
    size: 'md', measure: 66, readFont: 'serif', density: 'comfortable',
    accentOn: true, accentHue: 50,
  });

  // modals
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [docInfoOpen, setDocInfoOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [aiRepurposeOpen, setAiRepurposeOpen] = useState(false);
  const [aiStudyOpen, setAiStudyOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [aaOpen, setAaOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [toast, setToast] = useState(null);

  // Theme application
  useEffect(() => { document.body.setAttribute('data-theme', theme); }, [theme]);

  // Accent + font binding
  useEffect(() => {
    const root = document.documentElement.style;
    if (prefs.accentOn === false) {
      root.setProperty('--accent', 'var(--ink-2)');
      root.setProperty('--accent-ink', 'var(--ink)');
    } else {
      const h = prefs.accentHue ?? 50;
      root.setProperty('--accent', `oklch(0.60 0.145 ${h})`);
      root.setProperty('--accent-ink', `oklch(0.36 0.135 ${h})`);
      root.setProperty('--accent-soft', `oklch(0.93 0.05 ${h})`);
    }
  }, [prefs.accentOn, prefs.accentHue]);

  useEffect(() => {
    const fams = {
      serif: "'Source Serif 4', 'Source Serif Pro', Georgia, serif",
      sans:  "'Inter Tight', ui-sans-serif, system-ui, sans-serif",
      easy:  "'Atkinson Hyperlegible', 'Source Serif 4', Georgia, serif",
    };
    document.documentElement.style.setProperty('--font-read', fams[prefs.readFont] || fams.serif);
  }, [prefs.readFont]);

  // measure
  useEffect(() => {
    document.querySelectorAll('.page2').forEach(p => p.style.maxWidth = (prefs.measure || 66) + 'ch');
  }, [prefs.measure, activeTab, mode, showToc]);

  // Global keys
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault(); setCmdOpen(o => !o);
      } else if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault(); setSettingsOpen(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'f' && activeTab) {
        e.preventDefault(); setFindOpen(o => !o);
      } else if (e.key === 'Escape') {
        if (findOpen) setFindOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTab, findOpen]);

  const openBook = useCallback((book) => {
    setOpenTabs(t => t.find(x => x.id === book.id) ? t : [...t, book]);
    setActiveTab(book.id); setMode('read');
  }, []);
  const closeTab = useCallback((id) => {
    setOpenTabs(t => t.filter(x => x.id !== id));
    setActiveTab(a => {
      if (a !== id) return a;
      const rem = openTabs.filter(x => x.id !== id);
      return rem[rem.length - 1]?.id ?? null;
    });
  }, [openTabs]);

  const onLibraryAction = (k) => {
    if (k === 'tasks') setTasksOpen(true);
    else if (k === 'new-note') { setToast('New note created'); openBook({ id: 'new', title: 'Untitled', spine: 'amber', tags: [], pages: 1, read: 0, updated: 'now', words: 0, label: 'NEW' }); }
    else if (k === 'import') setToast('Pick a folder to import');
    else if (k === 'folders') setFolderOpen(true);
    else if (k === 'new-folder') setToast('Folder created');
    else if (k === 'readme') setToast('README from code — pick a project folder');
    else if (k === 'vault') setToast('Vault opened');
    else if (k === 'new-course') setToast('Course pack — pick a topic');
    else if (k === 'template') setToast('Choose a template');
  };

  const onCmdPick = (id) => {
    if (id === 'settings') setSettingsOpen(true);
    else if (id === 'docinfo') setDocInfoOpen(true);
    else if (id === 'theme') setTheme(t => t === 'light' ? 'dark' : 'light');
    else if (id === 'toc') setShowToc(s => !s);
    else if (id === 'edit') setMode(m => m === 'edit' ? 'read' : 'edit');
    else if (id === 'ai-study') setAiStudyOpen(true);
    else if (id === 'ai-repurpose') setAiRepurposeOpen(true);
    else if (id === 'tasks') setTasksOpen(true);
    else if (id === 'new') onLibraryAction('new-note');
    else if (id === 'import') onLibraryAction('import');
    else if (id === 'graph') setToast('Graph view coming soon');
  };

  const activeBook = openTabs.find(t => t.id === activeTab);
  const inReader = !!activeBook;

  // showToast: clear after a moment
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 1800); return () => clearTimeout(t); }, [toast]);

  return (
    <div className="app2">
      <header className="tb">
        <div className="tb-left">
          {inReader ? (
            <>
              <button className="tb-back" title="Back to library" onClick={() => setActiveTab(null)}><Ico.arrLeft/></button>
              <span className="tb-doc-title">{activeBook.title}</span>
            </>
          ) : (
            <a className="brand2" href="#">
              <div className="brand2-mark">M</div>
              <span className="brand2-name">MD Reader</span>
            </a>
          )}
        </div>
        <div className="tb-mid">
          {inReader ? (
            <div className={`tb-search ${findOpen ? 'in-page' : ''}`} onClick={() => !findOpen && setCmdOpen(true)}>
              <Ico.search/>
              {findOpen ? (
                <input
                  autoFocus
                  placeholder="Find in page…"
                  value={findQ}
                  onChange={e => setFindQ(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setFindOpen(false); setFindQ(''); } }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <>
                  <span style={{flex:1}}>Find in page or search library…</span>
                  <kbd>⌘K</kbd>
                </>
              )}
            </div>
          ) : (
            <div className="tb-search" onClick={() => setCmdOpen(true)}>
              <Ico.search/>
              <span style={{flex:1}}>Search library, commands, tags…</span>
              <kbd>⌘K</kbd>
            </div>
          )}
        </div>
        <div className="tb-right">
          {inReader && (
            <>
              <button className={`ibtn ${mode === 'edit' ? 'on' : ''}`} title="Edit" onClick={() => setMode(m => m === 'edit' ? 'read' : 'edit')}><Ico.edit/></button>
              <button className={`ibtn ${showToc ? 'on' : ''}`} title="Contents" onClick={() => setShowToc(s => !s)}><Ico.toc/></button>
              <button className="ibtn" title="Study assistant" onClick={() => setAiStudyOpen(true)}><Ico.sparkle/></button>
              <button className="ibtn" title="Repurpose document" onClick={() => setAiRepurposeOpen(true)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2 4 4 1-3 3 1 5-4-2-4 2 1-5-3-3 4-1z"/></svg>
              </button>
              <button className="ibtn" title="Bookmark"><Ico.bookmark/></button>
              <button className="ibtn" title="Slides"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="13" rx="2"/><path d="M9 20h6"/></svg></button>
              <button className="ibtn" title="Document info" onClick={() => setDocInfoOpen(true)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
              </button>
              <span className="tb-divider"/>
            </>
          )}
          <button className="ibtn" title="Theme" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? <Ico.moon/> : <Ico.sun/>}
          </button>
          <div style={{position:'relative'}}>
            <button className="ibtn" title="Folders" onClick={(e) => { e.stopPropagation(); setFolderOpen(o => !o); }}><Ico.folder/></button>
          </div>
          <div style={{position:'relative'}}>
            <button className="ibtn" title="Typography" onClick={(e) => { e.stopPropagation(); setAaOpen(o => !o); }}>
              <span style={{fontFamily:'var(--font-read)',fontSize:14,fontWeight:600,letterSpacing:'-0.01em'}}>Aa</span>
            </button>
          </div>
        </div>
      </header>

      {openTabs.length > 0 && (
        <div className="tabs2">
          <button className={`tab2 ${!activeTab ? 'on' : ''}`} onClick={() => setActiveTab(null)}>
            <Ico.shelf/> Library
          </button>
          {openTabs.map(t => (
            <button key={t.id} className={`tab2 ${activeTab === t.id ? 'on' : ''}`} onClick={() => setActiveTab(t.id)}>
              <Ico.book/> {t.title}
              <span className="x" onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}><Ico.close/></span>
            </button>
          ))}
        </div>
      )}

      <main className="main2">
        <div className="canvas2">
          {!activeBook && (
            <LibraryV2
              onOpen={openBook}
              onAction={onLibraryAction}
              activeTags={activeTags}
              setActiveTags={setActiveTags}
              sort={sort}
              setSort={setSort}
            />
          )}
          {activeBook && mode === 'read' && (
            <ReaderV2
              book={activeBook}
              fontSize={prefs.size || 'md'}
              showToc={showToc}
              find={findOpen ? findQ : ''}
              setFind={setFindQ}
              onWiki={openBook}
            />
          )}
          {activeBook && mode === 'edit' && (
            <EditorV2 book={activeBook}/>
          )}
        </div>

        {/* Anchored popovers — overlay the main area */}
        <FolderMenu open={folderOpen} onClose={() => setFolderOpen(false)} onPick={(k) => { setFolderOpen(false); setToast(k === 'open' ? 'Opening folder…' : 'Action triggered'); }}/>
        <AaPopover open={aaOpen} onClose={() => setAaOpen(false)} prefs={prefs} setPrefs={setPrefs} onOpenSettings={() => setSettingsOpen(true)}/>
      </main>

      {/* Modals */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} prefs={prefs} setPrefs={setPrefs}/>
      <DocInfoModal open={docInfoOpen} book={activeBook} onClose={() => setDocInfoOpen(false)}/>
      <TasksModal open={tasksOpen} onClose={() => setTasksOpen(false)}/>
      <AiRepurposeModal open={aiRepurposeOpen} book={activeBook} onClose={() => setAiRepurposeOpen(false)} onAct={(k) => { setAiRepurposeOpen(false); setToast('Drafting…'); }}/>
      <AiStudyModal open={aiStudyOpen} book={activeBook} onClose={() => setAiStudyOpen(false)}/>
      <CmdPaletteV2 open={cmdOpen} onClose={() => setCmdOpen(false)} onPick={onCmdPick} onOpenBook={openBook}/>

      {toast && <div className="toast2">{toast}</div>}
    </div>
  );
}

window.AppV2 = AppV2;
ReactDOM.createRoot(document.getElementById('root')).render(<AppV2/>);
