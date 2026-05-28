// AI study assistant rail
const { Ico } = window.MDR;
const { useState, useRef, useEffect } = React;

function AiRail({ book, onClose }) {
  const [scope, setScope] = useState('doc');
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      html: `Hi — I can summarize, quiz, or explain anything in <strong>${book.title}</strong>. Pick an action above, or ask me a question.`
    }
  ]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking]);

  const runAction = (kind) => {
    const prompts = {
      summarize: 'Summarize this document',
      explain: 'Explain the selection',
      flashcards: 'Make 5 flashcards from this document',
      study: 'Build me a study guide',
      quiz: 'Quiz me on this',
      keyterms: 'Extract key terms',
      eli5: 'Explain this like I\u2019m five',
      critique: 'Critique the writing',
      action: 'Extract action items',
      diagram: 'Draw a mermaid diagram for this',
      table: 'Turn this into a table',
      suggest: 'Suggest links to other notes',
    };
    const q = prompts[kind];
    setMessages(m => [...m, { role: 'user', text: q }]);
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      setMessages(m => [...m, { role: 'bot', html: cannedReply(kind, book) }]);
    }, 900 + Math.random() * 700);
  };

  const send = () => {
    if (!draft.trim()) return;
    const q = draft.trim();
    setMessages(m => [...m, { role: 'user', text: q }]);
    setDraft('');
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      setMessages(m => [...m, { role: 'bot', html: cannedFreeform(q, book) }]);
    }, 800 + Math.random() * 600);
  };

  const actions = [
    { id: 'summarize', label: 'Summarize', icon: Ico.layers },
    { id: 'explain', label: 'Explain selection', icon: Ico.sparkle },
    { id: 'flashcards', label: 'Flashcards', icon: Ico.card },
    { id: 'study', label: 'Study guide', icon: Ico.book },
    { id: 'quiz', label: 'Quiz', icon: Ico.bolt },
    { id: 'keyterms', label: 'Key terms', icon: Ico.tag },
    { id: 'eli5', label: 'ELI5', icon: Ico.sparkle },
    { id: 'critique', label: 'Critique', icon: Ico.edit },
    { id: 'action', label: 'Action items', icon: Ico.check },
    { id: 'diagram', label: 'Diagram', icon: Ico.graph },
  ];

  return (
    <aside className="ai-rail">
      <div className="ai-rail-head">
        <div className="title"><Ico.sparkle className="star"/> Study assistant</div>
        <button className="icon-btn close" onClick={onClose} title="Close"><Ico.close/></button>
      </div>
      <div className="ai-rail-body" ref={scrollRef}>
        <div className="ai-scope" role="tablist">
          <button className={scope === 'doc' ? 'on' : ''} onClick={() => setScope('doc')}>This document</button>
          <button className={scope === 'lib' ? 'on' : ''} onClick={() => setScope('lib')}>Whole library</button>
        </div>

        <div className="ai-model">
          <div>
            <span className="dot"/>
            <span style={{color:'var(--ink)', fontWeight:500}}>Claude</span>{' '}
            <span style={{color:'var(--faint)'}}>·</span>{' '}
            <span>claude-opus-4-7</span>
          </div>
          <button className="icon-btn" title="Switch model" style={{width:22,height:22}}><Ico.cog/></button>
        </div>

        <div className="ai-actions">
          {actions.map(a => (
            <button key={a.id} className="ai-action" onClick={() => runAction(a.id)}>
              <a.icon className="icon"/> {a.label}
            </button>
          ))}
        </div>

        <div className="ai-chat">
          {messages.map((m, i) => (
            m.role === 'user' ? (
              <div key={i} className="ai-msg user">{m.text}</div>
            ) : (
              <div key={i} className="ai-msg bot" dangerouslySetInnerHTML={{ __html: m.html }}/>
            )
          ))}
          {thinking && (
            <div className="ai-thinking">
              Thinking
              <span className="pulse"><i/><i/><i/></span>
            </div>
          )}
        </div>
      </div>
      <div className="ai-input-wrap">
        <div className="ai-input">
          <textarea
            placeholder={scope === 'doc' ? 'Ask about this document…' : 'Ask the library…'}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
          />
          <button className="send" disabled={!draft.trim()} onClick={send} title="Send"><Ico.send/></button>
        </div>
      </div>
    </aside>
  );
}

function cannedReply(kind, book) {
  switch (kind) {
    case 'summarize':
      return `<strong>${book.title}</strong> in three lines:<ul>
        <li>A book-style Markdown reader with paginated pages, themes, and a TOC built from headings.</li>
        <li>Reads any folder; remembers your spot via heading anchors, not stale page numbers.</li>
        <li>AI is optional and offline-first &mdash; your key stays in the OS keychain.</li></ul>`;
    case 'flashcards':
      return `Five flashcards drafted:<ul>
        <li><strong>Q.</strong> Why are heading anchors used instead of page numbers? &mdash; <em>so font-size changes don\u2019t lose your place.</em></li>
        <li><strong>Q.</strong> What measure makes long-form text easiest to read? &mdash; <em>about 50&ndash;75 characters per line.</em></li>
        <li><strong>Q.</strong> What does the sepia theme reduce? &mdash; <em>harsh contrast under bright light.</em></li>
        <li><strong>Q.</strong> Which keyboard key turns the page forward? &mdash; <em>Right arrow / Space / Page Down.</em></li>
        <li><strong>Q.</strong> Where is your AI key stored? &mdash; <em>the OS keychain (encrypted at rest).</em></li></ul>
        Add to deck?`;
    case 'quiz':
      return `Quick check &mdash; what does <em>measure</em> mean in typography, and why does it matter for screen reading?`;
    case 'keyterms':
      return `Key terms in this doc: <strong>measure</strong>, <strong>pagination</strong>, <strong>heading anchor</strong>, <strong>vault</strong>, <strong>wiki-link</strong>, <strong>callout</strong>.`;
    case 'eli5':
      return `Pretend a book is made of pages. Instead of scrolling forever, the app gives you a page at a time, like a real book. When you change the text size, it remembers the chapter you were in, not the page number, so it can put you back in the right place.`;
    case 'critique':
      return `The opening is strong but a little long. Consider tightening the first paragraph and moving the privacy section above the typography one &mdash; security usually wins reader trust earlier.`;
    case 'action':
      return `Action items extracted:<ul>
        <li>Try the presentation mode</li>
        <li>Paste an image into the editor</li>
        <li>Run a cross-library search</li></ul>`;
    case 'study':
      return `<strong>Study guide</strong><ul>
        <li>Reading surface: measure, contrast, margins</li>
        <li>Pacing: pages vs scroll</li>
        <li>Re-finding your place via heading anchors</li>
        <li>Privacy posture &mdash; offline by default</li></ul>`;
    case 'explain':
      return `That paragraph argues that reading on a screen can feel as restful as reading a book, provided the surface gets out of the way: a comfortable measure, calm color, and generous margins.`;
    case 'diagram':
      return `<pre style="margin:0;padding:8px;background:transparent;border:none;font-size:11.5px;color:var(--ink-2);font-family:var(--font-mono)">flowchart LR
  A[Folder] --> B[Index]
  B --> C[Bookshelf]
  C --> D[Reader]
  D --> E[Pages]</pre>`;
    default:
      return `Done.`;
  }
}
function cannedFreeform(q, book) {
  return `Based on <strong>${book.title}</strong>: ${q.endsWith('?') ? '' : 'You asked about that. '}This is a mock answer in the prototype &mdash; in the real app, this is where your provider\u2019s response streams in.`;
}

window.AiRail = AiRail;
