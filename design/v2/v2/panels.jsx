// v2 Panels — Settings, Doc Info, Tasks, AI Repurpose, Command Palette, Folder menu, AI popover
const { Ico, BOOKS } = window.MDR;
const { useState, useEffect, useMemo, useRef } = React;

function Modal({ title, sub, onClose, foot, children, wide, head, padding = 22 }) {
  return (
    <div className="bd" onClick={onClose}>
      <div className="modal2" onClick={e => e.stopPropagation()} style={{ maxWidth: wide ? '92vw' : undefined, width: wide ? wide : undefined }}>
        {head !== false && (
          <div className="modal2-head">
            <h3>{title}</h3>
            {sub && <span className="sub">{sub}</span>}
            <span className="spacer"/>
            <button className="ibtn" onClick={onClose}><Ico.close/></button>
          </div>
        )}
        <div className="modal2-body" style={{ padding }}>{children}</div>
        {foot && <div className="modal2-foot">{foot}</div>}
      </div>
    </div>
  );
}

// ───────── Settings ─────────
function SettingsModal({ open, onClose, prefs, setPrefs }) {
  const [tab, setTab] = useState('appearance');
  if (!open) return null;
  return (
    <Modal title="Settings" wide={820} onClose={onClose} padding={0} foot={
      <>
        <button className="btn" onClick={() => setPrefs({})}>Reset to defaults</button>
        <span className="spacer"/>
        <button className="btn">Export</button>
        <button className="btn">Import</button>
      </>
    }>
      <div className="set-grid">
        <div className="set-tabs">
          {[
            ['appearance','Appearance', Ico.sun],
            ['reading','Reading', Ico.book],
            ['typography','Typography', Ico.type],
            ['behavior','Behavior', Ico.cog],
            ['ai','AI', Ico.sparkle],
          ].map(([id, label, I]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              <I className="icon"/> {label}
            </button>
          ))}
        </div>
        <div className="set-panel">
          {tab === 'appearance' && <AppearancePanel prefs={prefs} setPrefs={setPrefs}/>}
          {tab === 'reading' && <ReadingPanel prefs={prefs} setPrefs={setPrefs}/>}
          {tab === 'typography' && <TypographyPanel prefs={prefs} setPrefs={setPrefs}/>}
          {tab === 'behavior' && <BehaviorPanel prefs={prefs} setPrefs={setPrefs}/>}
          {tab === 'ai' && <AiPanelSettings prefs={prefs} setPrefs={setPrefs}/>}
        </div>
      </div>
    </Modal>
  );
}

function AppearancePanel({ prefs, setPrefs }) {
  const themes = ['Light','Sepia','Dark','Nord','Contrast'];
  const swatches = [
    ['#4a8df0', 230], ['#3aa3ba', 200], ['#2f8a4a', 145],
    ['#a3a32a', 100], ['#c66b2a', 50], ['#c43b3b', 25],
    ['#b6357a', 340], ['#7b3fd0', 290], ['#2b3a55', 260],
  ];
  return (
    <>
      <div className="set-row">
        <div className="set-label">
          <div className="name">Theme</div>
          <div className="desc">Set the overall palette.</div>
        </div>
        <div className="set-control">
          <div className="seg2">
            {themes.map(t => (
              <button key={t} className={prefs.theme === t.toLowerCase() ? 'on' : ''}
                onClick={() => setPrefs({ ...prefs, theme: t.toLowerCase() })}>{t}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="set-row">
        <div className="set-label">
          <div className="name">Accent color</div>
          <div className="desc">Turn off to use a fully neutral interface.</div>
        </div>
        <div className="set-control">
          <button
            className={`toggle ${prefs.accentOn !== false ? 'on' : ''}`}
            onClick={() => setPrefs({ ...prefs, accentOn: !(prefs.accentOn !== false) })}
          />
        </div>
      </div>
      <div className="set-row">
        <div className="set-label">
          <div className="name">Accent swatches</div>
          <div className="desc">Used for active state, progress, and AI sparkle.</div>
        </div>
        <div className="set-control">
          <div className="swatches">
            {swatches.map(([c, h]) => (
              <button key={h} className={`swatch ${prefs.accentHue === h ? 'on' : ''}`}
                style={{ background: c }}
                onClick={() => setPrefs({ ...prefs, accentHue: h })}
                title={`hue ${h}`}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="set-row">
        <div className="set-label">
          <div className="name">Reading font</div>
          <div className="desc">Serif, sans, or a high-legibility face.</div>
        </div>
        <div className="set-control">
          <div className="seg2">
            <button className={prefs.readFont !== 'sans' && prefs.readFont !== 'easy' ? 'on' : ''} onClick={() => setPrefs({...prefs, readFont:'serif'})}>Serif</button>
            <button className={prefs.readFont === 'sans' ? 'on' : ''} onClick={() => setPrefs({...prefs, readFont:'sans'})}>Sans</button>
            <button className={prefs.readFont === 'easy' ? 'on' : ''} onClick={() => setPrefs({...prefs, readFont:'easy'})}>Easy</button>
          </div>
        </div>
      </div>
      <div className="set-row">
        <div className="set-label">
          <div className="name">Interface density</div>
          <div className="desc">Compact tightens spacing across the app.</div>
        </div>
        <div className="set-control">
          <div className="seg2">
            <button className={prefs.density !== 'compact' ? 'on' : ''} onClick={() => setPrefs({...prefs, density:'comfortable'})}>Comfortable</button>
            <button className={prefs.density === 'compact' ? 'on' : ''} onClick={() => setPrefs({...prefs, density:'compact'})}>Compact</button>
          </div>
        </div>
      </div>
    </>
  );
}

function ReadingPanel({ prefs, setPrefs }) {
  return (
    <>
      <div className="set-row">
        <div className="set-label"><div className="name">Text size</div><div className="desc">Cmd+= and Cmd+−</div></div>
        <div className="set-control">
          <div className="seg2">
            {['sm','md','lg','xl'].map(s => (
              <button key={s} className={prefs.size === s ? 'on' : ''} onClick={() => setPrefs({...prefs, size:s})}>{s.toUpperCase()}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="set-row">
        <div className="set-label"><div className="name">Measure</div><div className="desc">Characters per line — ~65 reads well.</div></div>
        <div className="set-control">
          <input className="slider" type="range" min="48" max="92" value={prefs.measure || 66} onChange={e => setPrefs({...prefs, measure:+e.target.value})}/>
          <span style={{fontVariantNumeric:'tabular-nums',fontSize:13,color:'var(--ink-2)',minWidth:38}}>{prefs.measure || 66}ch</span>
        </div>
      </div>
      <div className="set-row">
        <div className="set-label"><div className="name">Two-page spread</div><div className="desc">Lay out as a book on wide screens.</div></div>
        <div className="set-control">
          <button className={`toggle ${prefs.twoPage ? 'on' : ''}`} onClick={() => setPrefs({...prefs, twoPage: !prefs.twoPage})}/>
        </div>
      </div>
      <div className="set-row">
        <div className="set-label"><div className="name">Focus ruler</div><div className="desc">Highlight the line under the cursor.</div></div>
        <div className="set-control">
          <button className={`toggle ${prefs.focusRuler ? 'on' : ''}`} onClick={() => setPrefs({...prefs, focusRuler: !prefs.focusRuler})}/>
        </div>
      </div>
    </>
  );
}

function TypographyPanel({ prefs, setPrefs }) {
  return (
    <>
      <div className="set-row">
        <div className="set-label"><div className="name">Font weight</div></div>
        <div className="set-control">
          <div className="seg2">
            {['Light','Normal','Medium','Semibold'].map(w => (
              <button key={w} className={(prefs.weight || 'normal') === w.toLowerCase() ? 'on' : ''} onClick={() => setPrefs({...prefs, weight:w.toLowerCase()})}>{w}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="set-row">
        <div className="set-label"><div className="name">Letter spacing</div></div>
        <div className="set-control">
          <input className="slider" type="range" min="-3" max="6" step="0.5" value={prefs.tracking ?? 0} onChange={e => setPrefs({...prefs, tracking:+e.target.value})}/>
          <span style={{fontVariantNumeric:'tabular-nums',fontSize:13,color:'var(--ink-2)',minWidth:38}}>{(prefs.tracking ?? 0)}</span>
        </div>
      </div>
      <div className="set-row">
        <div className="set-label"><div className="name">Paragraph spacing</div></div>
        <div className="set-control">
          <input className="slider" type="range" min="0" max="20" value={prefs.paraSpace ?? 8} onChange={e => setPrefs({...prefs, paraSpace:+e.target.value})}/>
          <span style={{fontVariantNumeric:'tabular-nums',fontSize:13,color:'var(--ink-2)',minWidth:38}}>{prefs.paraSpace ?? 8}px</span>
        </div>
      </div>
      <div className="set-row">
        <div className="set-label"><div className="name">Justify text</div><div className="desc">Newspaper-style alignment.</div></div>
        <div className="set-control">
          <button className={`toggle ${prefs.justify ? 'on' : ''}`} onClick={() => setPrefs({...prefs, justify: !prefs.justify})}/>
        </div>
      </div>
    </>
  );
}

function BehaviorPanel({ prefs, setPrefs }) {
  return (
    <>
      <div className="set-row">
        <div className="set-label"><div className="name">Autosave</div><div className="desc">Save drafts as you type.</div></div>
        <div className="set-control">
          <button className={`toggle ${prefs.autosave !== false ? 'on' : ''}`} onClick={() => setPrefs({...prefs, autosave: !(prefs.autosave !== false)})}/>
        </div>
      </div>
      <div className="set-row">
        <div className="set-label"><div className="name">Smooth page turns</div></div>
        <div className="set-control">
          <button className={`toggle ${prefs.smooth !== false ? 'on' : ''}`} onClick={() => setPrefs({...prefs, smooth: !(prefs.smooth !== false)})}/>
        </div>
      </div>
      <div className="set-row">
        <div className="set-label"><div className="name">Confirm deletes</div><div className="desc">Always ask before sending to the Recycle Bin.</div></div>
        <div className="set-control">
          <button className={`toggle ${prefs.confirm !== false ? 'on' : ''}`} onClick={() => setPrefs({...prefs, confirm: !(prefs.confirm !== false)})}/>
        </div>
      </div>
    </>
  );
}

function AiPanelSettings({ prefs, setPrefs }) {
  return (
    <>
      <div className="set-row">
        <div className="set-label"><div className="name">Provider</div><div className="desc">Bring your own key.</div></div>
        <div className="set-control">
          <div className="seg2">
            <button className={(prefs.provider || 'anthropic') === 'anthropic' ? 'on' : ''} onClick={() => setPrefs({...prefs, provider:'anthropic'})}>Anthropic</button>
            <button className={prefs.provider === 'openai' ? 'on' : ''} onClick={() => setPrefs({...prefs, provider:'openai'})}>OpenAI</button>
            <button className={prefs.provider === 'ollama' ? 'on' : ''} onClick={() => setPrefs({...prefs, provider:'ollama'})}>Ollama</button>
          </div>
        </div>
      </div>
      <div className="set-row">
        <div className="set-label"><div className="name">API key</div><div className="desc">Stored encrypted in the OS keychain.</div></div>
        <div className="set-control">
          <input style={{height:32,padding:'0 12px',borderRadius:8,border:'1px solid var(--line)',background:'var(--surface)',fontSize:13,fontFamily:'var(--font-mono)',color:'var(--ink)',width:240}} type="password" placeholder="sk-…" defaultValue="••••••••••••" />
        </div>
      </div>
      <div className="set-row">
        <div className="set-label"><div className="name">Model</div></div>
        <div className="set-control">
          <select style={{height:32,padding:'0 12px',borderRadius:8,border:'1px solid var(--line)',background:'var(--surface)',fontSize:13,color:'var(--ink)'}}>
            <option>claude-opus-4-7</option>
            <option>claude-sonnet-4-7</option>
            <option>claude-haiku-4-7</option>
          </select>
        </div>
      </div>
    </>
  );
}

// ───────── Doc Info ─────────
function DocInfoModal({ open, book, onClose }) {
  if (!open || !book) return null;
  const stats = [
    { n: book.words.toLocaleString(), l: 'Words', icon: Ico.type },
    { n: Math.max(1, Math.round(book.words / 200)), l: 'Min read', icon: Ico.clock },
    { n: book.pages, l: 'Pages', icon: Ico.book },
    { n: 4, l: 'Headings', icon: Ico.toc },
    { n: book.id === 'math' ? 6 : 0, l: 'Equations', icon: Ico.bolt },
    { n: book.id === 'charts' ? 1 : 0, l: 'Diagrams', icon: Ico.graph },
    { n: book.id === 'charts' ? 1 : 0, l: 'Charts', icon: Ico.layers },
    { n: 2, l: 'Code blocks', icon: Ico.copy },
    { n: book.id === 'tables' ? 1 : book.id === 'handbook' ? 1 : 0, l: 'Tables', icon: Ico.layers },
    { n: 0, l: 'Images', icon: Ico.layers },
    { n: 2, l: 'Wiki-links', icon: Ico.tag },
    { n: 0, l: 'Embeds', icon: Ico.pin },
    { n: book.id === 'slides' ? '2/5' : '0/0', l: 'Tasks', icon: Ico.check },
  ];
  return (
    <Modal title="Document info" sub={book.title} onClose={onClose} wide={680}>
      <div className="info-grid">
        {stats.map(s => (
          <div key={s.l} className="info-card">
            <s.icon className="icon"/>
            <div className="n">{s.n}</div>
            <div className="l">{s.l}</div>
          </div>
        ))}
      </div>
      <div className="info-health">
        <Ico.check/> No broken wiki-links found.
      </div>
    </Modal>
  );
}

// ───────── Tasks ─────────
function TasksModal({ open, onClose }) {
  const [filter, setFilter] = useState('open');
  if (!open) return null;
  const all = [
    { doc: 'Slides & Tasks Demo', items: [
      { t: 'Read the welcome guide', done: true },
      { t: 'Pick a library folder', done: true },
      { t: 'Try the presentation mode', done: false },
      { t: 'Paste an image into the editor', done: false },
      { t: 'Run a cross-library search', done: false },
    ]},
  ];
  const total = all.reduce((a, g) => a + g.items.length, 0);
  const done = all.reduce((a, g) => a + g.items.filter(i => i.done).length, 0);
  return (
    <Modal
      title="Tasks"
      sub={`${done} / ${total} done`}
      onClose={onClose}
      wide={560}
      head={true}
    >
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:8}}>
        <div className="tasks-segs">
          <button className={filter === 'open' ? 'on' : ''} onClick={() => setFilter('open')}>Open</button>
          <button className={filter === 'done' ? 'on' : ''} onClick={() => setFilter('done')}>Done</button>
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All</button>
        </div>
      </div>
      {all.map(g => {
        const items = g.items.filter(i => filter === 'all' ? true : filter === 'done' ? i.done : !i.done);
        if (items.length === 0) return null;
        return (
          <div key={g.doc} className="task-grp">
            <h4>{g.doc}</h4>
            <ul>
              {items.map((it, i) => (
                <li key={i} className={it.done ? 'done' : ''}>
                  <input type="checkbox" defaultChecked={it.done} readOnly/>
                  {it.t}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </Modal>
  );
}

// ───────── AI Repurpose (the modal-style AI panel from the original) ─────────
function AiRepurposeModal({ open, book, onClose, onAct }) {
  const [tone, setTone] = useState(null);
  const [lang, setLang] = useState('');
  if (!open || !book) return null;
  const cards = [
    { id: 'onepager', t: 'Marketing one-pager', d: 'Headline, value props, and a call to action', emoji: '✏️' },
    { id: 'blog',     t: 'Blog post',           d: 'An engaging, readable article with a hook', emoji: '📝' },
    { id: 'execsum',  t: 'Executive summary',   d: 'Tight, decision-focused overview',          emoji: '📋' },
    { id: 'slides',   t: 'Slide deck',          d: 'Title slide plus bullet slides, ready to present', emoji: '▦' },
    { id: 'lesson',   t: 'Lesson plan',         d: 'Objectives, activities, and review questions',     emoji: '🎓' },
    { id: 'flash',    t: 'Flashcards',          d: 'Question / answer pairs you can study',            emoji: '🃏' },
  ];
  return (
    <Modal title={<><Ico.sparkle className="star"/> Repurpose document</>} onClose={onClose} wide={720}>
      <div style={{fontSize:13.5, color:'var(--muted)', marginBottom:14}}>
        Turn <strong style={{color:'var(--ink)',fontWeight:600}}>"{book.title}"</strong> into a new piece. The result opens in a new editor tab so you can review and save it.
      </div>
      <div className="ai-cards">
        {cards.map(c => (
          <button key={c.id} className="ai-card" onClick={() => onAct('repurpose:' + c.id)}>
            <div className="icon-box" style={{fontSize:16}}>{c.emoji}</div>
            <div className="t">{c.t}</div>
            <div className="d">{c.d}</div>
          </button>
        ))}
      </div>

      <div className="ai-section-title">Rewrite in a different tone</div>
      <div className="tone-row">
        {['Formal','Casual','Concise','Persuasive','Academic'].map(t => (
          <button key={t} className={`tone ${tone === t ? 'on' : ''}`} onClick={() => setTone(t)}>{t}</button>
        ))}
      </div>

      <div className="ai-section-title">Translate</div>
      <div className="lang-row">
        <input placeholder="Language (e.g. Spanish, French, Japanese)" value={lang} onChange={e => setLang(e.target.value)}/>
        <button className="btn primary" onClick={() => onAct('translate:' + (lang || 'auto'))}>Translate</button>
      </div>
    </Modal>
  );
}

// ───────── Study Assistant (chat) ─────────
function AiStudyModal({ open, book, onClose }) {
  const [scope, setScope] = useState('doc');
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [msgs, setMsgs] = useState([{ role: 'bot', html: `Hi — I can summarize, quiz, or explain anything in <strong>${book?.title || 'this document'}</strong>. Pick an action below or ask a question.` }]);
  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, thinking, open]);
  if (!open || !book) return null;

  const actions = [
    ['Summarize','summarize',Ico.layers],
    ['Flashcards','flashcards',Ico.card],
    ['Quiz','quiz',Ico.bolt],
    ['Study guide','study',Ico.book],
    ['Key terms','keyterms',Ico.tag],
    ['ELI5','eli5',Ico.sparkle],
    ['Critique','critique',Ico.edit],
    ['Action items','action',Ico.check],
  ];

  const send = (text) => {
    setMsgs(m => [...m, { role: 'user', text }]);
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      setMsgs(m => [...m, { role: 'bot', html: cannedReply(text, book) }]);
    }, 900 + Math.random() * 500);
  };

  return (
    <Modal title={<><Ico.sparkle className="star"/> Study assistant</>} sub={book.title} onClose={onClose} wide={540}
      foot={
        <>
          <input
            style={{flex:1,height:34,padding:'0 12px',borderRadius:9,border:'1px solid var(--line)',background:'var(--surface)',fontFamily:'var(--font-ui)',fontSize:13.5,color:'var(--ink)',outline:'none'}}
            placeholder={scope === 'doc' ? 'Ask about this document…' : 'Ask the library…'}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && draft.trim()) { send(draft.trim()); setDraft(''); } }}
          />
          <button className="btn primary" disabled={!draft.trim()} onClick={() => { send(draft.trim()); setDraft(''); }}>Ask</button>
        </>
      }
    >
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:12,alignItems:'center'}}>
        <div className="seg2">
          <button className={scope === 'doc' ? 'on' : ''} onClick={() => setScope('doc')}>This document</button>
          <button className={scope === 'lib' ? 'on' : ''} onClick={() => setScope('lib')}>Library</button>
        </div>
        <div style={{fontSize:12,color:'var(--muted)',display:'inline-flex',alignItems:'center',gap:6}}>
          <span style={{width:6,height:6,borderRadius:999,background:'var(--good)'}}/>
          claude-opus-4-7
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginBottom:14}}>
        {actions.map(([label, kind, I]) => (
          <button key={kind} className="ai-card" style={{padding:10}} onClick={() => send(label)}>
            <div className="icon-box" style={{width:24,height:24,fontSize:12}}><I/></div>
            <div className="t" style={{fontSize:12.5}}>{label}</div>
          </button>
        ))}
      </div>
      <div ref={scrollRef} style={{display:'flex',flexDirection:'column',gap:8,maxHeight:'40vh',overflow:'auto',paddingRight:4}}>
        {msgs.map((m, i) => (
          m.role === 'user' ? (
            <div key={i} style={{alignSelf:'flex-end',background:'var(--surface)',border:'1px solid var(--line-2)',padding:'8px 12px',borderRadius:10,fontSize:13,maxWidth:'85%'}}>{m.text}</div>
          ) : (
            <div key={i} style={{background:'color-mix(in oklch, var(--accent-soft) 24%, var(--surface))',border:'1px solid color-mix(in oklch, var(--accent-soft) 60%, var(--line-2))',padding:'10px 12px',borderRadius:10,fontSize:13.5,fontFamily:'var(--font-read)',lineHeight:1.55}} dangerouslySetInnerHTML={{__html: m.html}}/>
          )
        ))}
        {thinking && (
          <div style={{background:'var(--surface)',border:'1px dashed var(--line)',padding:'10px 12px',borderRadius:10,fontSize:13,color:'var(--muted)',fontStyle:'italic',display:'inline-flex',alignItems:'center',gap:8,fontFamily:'var(--font-read)',alignSelf:'flex-start'}}>
            Thinking
            <span style={{display:'inline-flex',gap:3}}>
              <i style={{width:5,height:5,borderRadius:999,background:'var(--accent)',animation:'pulse 1.2s ease infinite'}}/>
              <i style={{width:5,height:5,borderRadius:999,background:'var(--accent)',animation:'pulse 1.2s ease infinite',animationDelay:'0.15s'}}/>
              <i style={{width:5,height:5,borderRadius:999,background:'var(--accent)',animation:'pulse 1.2s ease infinite',animationDelay:'0.3s'}}/>
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
function cannedReply(q, book) {
  const Q = q.toLowerCase();
  if (Q.includes('summar')) return `<strong>${book.title}</strong> in three lines:<ul><li>A book-style Markdown reader with paginated pages, themes, and a TOC.</li><li>Reads any folder; remembers your spot via heading anchors.</li><li>AI is optional and offline-first — your key stays in the OS keychain.</li></ul>`;
  if (Q.includes('flash')) return `Five flashcards drafted:<ul><li><strong>Q.</strong> Why heading anchors instead of page numbers? — <em>so font-size changes don't lose your place.</em></li><li><strong>Q.</strong> Ideal measure for reading? — <em>50–75 characters per line.</em></li></ul>`;
  if (Q.includes('quiz')) return `Quick check — what does <em>measure</em> mean in typography, and why does it matter for screen reading?`;
  if (Q.includes('eli5')) return `Pretend a book is made of pages. The app shows you a page at a time, like a real book. When you change text size, it remembers the chapter, not the page number — so it can put you back where you were.`;
  if (Q.includes('action')) return `Action items:<ul><li>Try the presentation mode</li><li>Paste an image into the editor</li><li>Run a cross-library search</li></ul>`;
  return `Based on <strong>${book.title}</strong>: this is a mock answer in the prototype — in the real app this is where your provider's response streams in.`;
}

// ───────── Folder dropdown ─────────
function FolderMenu({ open, onClose, onPick }) {
  if (!open) return null;
  return (
    <>
      <div style={{position:'fixed',inset:0,zIndex:39}} onClick={onClose}/>
      <div className="folder-menu" onClick={e => e.stopPropagation()}>
        <div className="folder-menu-h">Current library</div>
        <button className="folder-item current">
          <Ico.folder className="icon"/> sample-library
          <span className="ago">now</span>
        </button>
        <div className="folder-divider"/>
        <div className="folder-menu-h">Recent folders</div>
        <button className="folder-item" onClick={() => onPick('open')}>
          <Ico.folder className="icon"/> Coursework — Fall 2025
          <span className="ago">2d</span>
        </button>
        <button className="folder-item" onClick={() => onPick('open')}>
          <Ico.folder className="icon"/> Engineering notes
          <span className="ago">5d</span>
        </button>
        <button className="folder-item" onClick={() => onPick('open')}>
          <Ico.folder className="icon"/> Personal journal
          <span className="ago">2w</span>
        </button>
        <div className="folder-divider"/>
        <button className="folder-item" onClick={() => onPick('browse')}>
          <Ico.folder className="icon"/> Open folder…
        </button>
        <button className="folder-item" onClick={() => onPick('reveal')}>
          <Ico.folder className="icon"/> Reveal in Explorer
        </button>
      </div>
    </>
  );
}

// ───────── Command Palette v2 ─────────
function CmdPaletteV2({ open, onClose, onPick, onOpenBook }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  useEffect(() => { if (open) { setQ(''); setSel(0); } }, [open]);

  const commands = [
    { id: 'new', label: 'New note', icon: Ico.plus, grp: 'Action' },
    { id: 'import', label: 'Import folder…', icon: Ico.folder, grp: 'Action' },
    { id: 'settings', label: 'Open Settings', icon: Ico.cog, grp: 'Action' },
    { id: 'docinfo', label: 'Document info', icon: Ico.layers, grp: 'View' },
    { id: 'theme', label: 'Toggle theme', icon: Ico.moon, grp: 'View' },
    { id: 'toc', label: 'Toggle table of contents', icon: Ico.toc, grp: 'View' },
    { id: 'edit', label: 'Toggle editor', icon: Ico.edit, grp: 'View' },
    { id: 'ai-study', label: 'Open Study Assistant', icon: Ico.sparkle, grp: 'AI' },
    { id: 'ai-repurpose', label: 'Repurpose document…', icon: Ico.sparkle, grp: 'AI' },
    { id: 'tasks', label: 'Open Tasks', icon: Ico.check, grp: 'Tools' },
    { id: 'graph', label: 'Open graph view', icon: Ico.graph, grp: 'Tools' },
  ];
  const bookItems = BOOKS.map(b => ({ id: 'book-' + b.id, label: b.title, icon: Ico.book, grp: 'Open', book: b }));
  const all = [...commands, ...bookItems];
  const filtered = q ? all.filter(x => x.label.toLowerCase().includes(q.toLowerCase())) : all.slice(0, 14);
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(filtered.length - 1, s + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const it = filtered[sel];
        if (!it) return;
        if (it.book) onOpenBook(it.book);
        else onPick(it.id);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, sel, onClose, onPick, onOpenBook]);
  if (!open) return null;

  // group
  const groups = [];
  const seen = new Set();
  filtered.forEach(item => {
    if (!seen.has(item.grp)) { groups.push(item.grp); seen.add(item.grp); }
  });

  return (
    <div className="bd" onClick={onClose} style={{paddingTop:'15vh',alignItems:'start'}}>
      <div className="cmdp2" onClick={e => e.stopPropagation()}>
        <div className="cmdp2-input">
          <Ico.search/>
          <input autoFocus placeholder="Search library, commands, tags…" value={q} onChange={e => setQ(e.target.value)}/>
        </div>
        <div className="cmdp2-list">
          {groups.map(g => (
            <div key={g}>
              <div className="cmdp2-grp">{g}</div>
              {filtered.filter(f => f.grp === g).map((c, ci) => {
                const globalI = filtered.indexOf(c);
                return (
                  <button key={c.id} className={`cmdp2-item ${globalI === sel ? 'sel' : ''}`}
                    onMouseEnter={() => setSel(globalI)}
                    onClick={() => { if (c.book) onOpenBook(c.book); else onPick(c.id); onClose(); }}>
                    <c.icon className="icon"/> {c.label}
                    <span className="arr"><Ico.arrRight/></span>
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{padding:'30px',textAlign:'center',color:'var(--muted)',fontSize:13}}>No matches.</div>
          )}
        </div>
        <div className="cmdp2-hint">
          <span><kbd>↑↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Open</span>
          <span><kbd>esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}

// ───────── Aa popover ─────────
function AaPopover({ open, onClose, prefs, setPrefs, onOpenSettings }) {
  if (!open) return null;
  return (
    <>
      <div style={{position:'fixed',inset:0,zIndex:39}} onClick={onClose}/>
      <div className="folder-menu" style={{width:260, right:14}} onClick={e => e.stopPropagation()}>
        <div className="folder-menu-h">Reading</div>
        <div style={{display:'flex',padding:'4px 10px',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:13,color:'var(--ink-2)'}}>Size</span>
          <div className="seg2">
            {['sm','md','lg','xl'].map(s => (
              <button key={s} className={prefs.size === s ? 'on' : ''} onClick={() => setPrefs({...prefs, size:s})} style={{fontSize: s === 'sm' ? 10 : s === 'md' ? 12 : s === 'lg' ? 14 : 16}}>Aa</button>
            ))}
          </div>
        </div>
        <div style={{display:'flex',padding:'4px 10px 8px',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:13,color:'var(--ink-2)'}}>Font</span>
          <div className="seg2">
            <button className={prefs.readFont !== 'sans' && prefs.readFont !== 'easy' ? 'on' : ''} onClick={() => setPrefs({...prefs, readFont:'serif'})}>Serif</button>
            <button className={prefs.readFont === 'sans' ? 'on' : ''} onClick={() => setPrefs({...prefs, readFont:'sans'})}>Sans</button>
          </div>
        </div>
        <div className="folder-divider"/>
        <button className="folder-item" onClick={() => { onClose(); onOpenSettings(); }}>
          <Ico.cog className="icon"/> Full typography settings…
        </button>
      </div>
    </>
  );
}

window.SettingsModal = SettingsModal;
window.DocInfoModal = DocInfoModal;
window.TasksModal = TasksModal;
window.AiRepurposeModal = AiRepurposeModal;
window.AiStudyModal = AiStudyModal;
window.FolderMenu = FolderMenu;
window.CmdPaletteV2 = CmdPaletteV2;
window.AaPopover = AaPopover;
