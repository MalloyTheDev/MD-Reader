// Sample library data + small icon set + markdown renderer
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ───────── Icons ─────────
const Ico = {
  book: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21V5.5z"/><path d="M4 5.5A2.5 2.5 0 0 0 6.5 8H20"/></svg>,
  shelf: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}><rect x="3" y="4" width="4" height="16" rx="1"/><rect x="9" y="4" width="4" height="16" rx="1"/><rect x="15" y="8" width="6" height="12" rx="1"/></svg>,
  clock: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  pin: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 4h6l-1 5 3.5 3.5L17 14l-5 0v6l-1.5-1.5L9 14H7l1-2 -3.5-3.5L6 7l3 0z"/></svg>,
  tag: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z"/><circle cx="8" cy="8" r="1.2"/></svg>,
  graph: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><circle cx="12" cy="12" r="2"/><path d="m7.5 7.5 3 3M16.5 7.5l-3 3M7.5 16.5l3-3M16.5 16.5l-3-3"/></svg>,
  card: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}><rect x="3" y="6" width="14" height="12" rx="1.5"/><rect x="7" y="3" width="14" height="12" rx="1.5"/></svg>,
  check: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 3 3 6-6"/></svg>,
  search: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}><circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.6-3.6"/></svg>,
  sparkle: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/></svg>,
  edit: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="m14 6 4 4"/></svg>,
  type: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}><path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M9 19h6"/></svg>,
  sun: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/></svg>,
  moon: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5z"/></svg>,
  toc: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}><path d="M4 6h16M4 12h16M4 18h10"/></svg>,
  close: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...p}><path d="M6 6l12 12M18 6 6 18"/></svg>,
  arrLeft: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m14 6-6 6 6 6"/></svg>,
  arrRight: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m10 6 6 6-6 6"/></svg>,
  more: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" {...p}><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg>,
  plus: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...p}><path d="M12 5v14M5 12h14"/></svg>,
  folder: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>,
  send: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>,
  cog: (p) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8L4.2 7a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>,
  copy: (p) => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>,
  bookmark: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 4h12v17l-6-3.5L6 21z"/></svg>,
  bolt: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M13 3 4 14h7l-1 7 9-11h-7l1-7z"/></svg>,
  layers: (p) => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/></svg>,
};

// ───────── Sample books ─────────
// Color tuples used for book spines — warm-palette
const SPINES = {
  amber:  ['oklch(0.50 0.13 55)', 'oklch(0.40 0.12 50)'],
  rust:   ['oklch(0.45 0.12 35)', 'oklch(0.36 0.11 30)'],
  forest: ['oklch(0.42 0.08 150)', 'oklch(0.32 0.07 145)'],
  teal:   ['oklch(0.42 0.07 200)', 'oklch(0.32 0.06 200)'],
  navy:   ['oklch(0.34 0.07 260)', 'oklch(0.26 0.06 260)'],
  plum:   ['oklch(0.40 0.09 320)', 'oklch(0.32 0.08 320)'],
  olive:  ['oklch(0.46 0.06 100)', 'oklch(0.36 0.05 100)'],
  ink:    ['oklch(0.28 0.025 60)', 'oklch(0.20 0.022 60)'],
};

const spineStyle = (key) => {
  const [a, b] = SPINES[key] || SPINES.amber;
  return { background: `linear-gradient(135deg, ${a}, ${b})` };
};

const BOOKS = [
  {
    id: 'handbook',
    title: 'The MD Reader Handbook',
    folder: 'sample-library',
    spine: 'ink',
    tags: ['guide', 'reference'],
    pages: 12, read: 0.72,
    updated: '2 days ago',
    words: 2850,
    label: 'GUIDE',
  },
  {
    id: 'ch1',
    title: 'Chapter 1: Getting Comfortable',
    folder: 'sample-library',
    spine: 'amber',
    tags: ['guide'],
    pages: 6, read: 0.34,
    updated: 'yesterday',
    words: 1640,
    label: 'CH 01',
  },
  {
    id: 'ch2',
    title: 'Chapter 2: Under the Hood',
    folder: 'sample-library',
    spine: 'rust',
    tags: ['guide'],
    pages: 8, read: 0.18,
    updated: '3 days ago',
    words: 2100,
    label: 'CH 02',
  },
  {
    id: 'rich',
    title: 'Rich Content Showcase',
    folder: 'demos',
    spine: 'plum',
    tags: ['demo', 'reference'],
    pages: 5, read: 0.55,
    updated: 'last week',
    words: 1100,
    label: 'DEMO',
  },
  {
    id: 'math',
    title: 'Math & Science Showcase',
    folder: 'demos',
    spine: 'navy',
    tags: ['demo', 'science'],
    pages: 9, read: 1.0,
    updated: 'last week',
    words: 2400,
    label: 'DEMO',
  },
  {
    id: 'charts',
    title: 'Charts & Diagrams',
    folder: 'demos',
    spine: 'teal',
    tags: ['demo'],
    pages: 7, read: 0.13,
    updated: '2 weeks ago',
    words: 1900,
    label: 'DEMO',
  },
  {
    id: 'tables',
    title: 'Tables & Callouts',
    folder: 'demos',
    spine: 'forest',
    tags: ['demo', 'reference'],
    pages: 5, read: 0.20,
    updated: '2 weeks ago',
    words: 1300,
    label: 'DEMO',
  },
  {
    id: 'kb',
    title: 'Keyboard Shortcuts',
    folder: 'guides',
    spine: 'olive',
    tags: ['guide'],
    pages: 3, read: 0.0,
    updated: '3 weeks ago',
    words: 720,
    label: 'GUIDE',
  },
  {
    id: 'slides',
    title: 'Slides & Tasks Demo',
    folder: 'demos',
    spine: 'amber',
    tags: ['demo', 'tutorial'],
    pages: 4, read: 1.0,
    updated: 'last week',
    words: 940,
    label: 'DEMO',
  },
];

// ───────── Sample markdown ─────────
const DOCS = {
  handbook: `# The MD Reader Handbook

Welcome to **MD Reader** — a desktop reader that turns a folder of Markdown into a comfortable, book-like reading surface. This handbook walks through what it does, what it doesn't, and how it stays out of your way.

> [!tip] Tip — keyboard first
> Use the arrow keys (or Page Up / Page Down) to turn pages, and click the left or right third of a page to flip with the mouse. Press \`Cmd+K\` for the command palette.

## What this app does

MD Reader scans a folder for \`.md\` files and presents them as a *bookshelf*. Open a book and you can flip through it page by page, jump around with the table of contents, search inside it, and read in light, sepia, or dark themes.

It supports GitHub-Flavored Markdown, including tables, task lists, math, diagrams, and callouts.

| Feature        | Where                    | Notes                        |
| -------------- | ------------------------ | ---------------------------- |
| Turn page      | Arrow keys / click edges | Smooth animated flip         |
| Contents       | ☰ button (top right)     | Click a heading to jump      |
| Search in page | \`Cmd+F\` while reading  | Highlights and jumps to hits |
| Themes         | Aa button                | Light · Sepia · Dark         |

## A short checklist

- [x] Render Markdown
- [x] Paginate like a book
- [x] Table of contents
- [ ] Your own notes go here

## A code sample

\`\`\`js
function greet(name) {
  // syntax highlighting comes from highlight.js
  return \`Hello, \${name}!\`
}
console.log(greet('reader'))
\`\`\`

## Privacy

Everything runs locally. AI features only call out when you supply your own API key, and keys are stored in the OS keychain — never in plaintext. Remote images are blocked by default.

Continue to [[ch1]].`,

  ch1: `# Chapter 1: Getting Comfortable

Reading on a screen does not have to feel like reading a web page. With a fixed page, generous margins, and a calm color theme, long-form text becomes far easier to stay with. This chapter is intentionally a little long so you can see how pagination splits it into several pages.

## The reading surface

A good reading surface gets out of the way. The *measure* — the number of characters per line — matters more than almost anything else. Lines that are too long make it hard for the eye to find the start of the next line; lines that are too short break the rhythm of reading. Somewhere between fifty and seventy-five characters tends to feel right for most people, which is why MD Reader lets you adjust the width directly.

Typography also depends on contrast. Pure black on pure white can feel harsh under bright light, which is why the sepia theme exists: a warm paper tone with soft brown ink. In a dark room, the dark theme reduces glare. None of these are merely cosmetic — they change how long you can read before your eyes tire.

### Margins and breathing room

White space is not wasted space. The margins around a block of text frame it and give the eye somewhere to rest at the end of each line. When everything is packed edge to edge, reading feels like work. A page with room to breathe invites you to keep going.

### Pacing with pages

Scrolling is open-ended; there is always more, and the bar never quite reaches the bottom. A page, by contrast, has edges. Turning a page is a small moment of progress, a tiny reward that scrolling never gives you. That is the feeling this app tries to recreate.

## Finding your place again

If you close a book and come back later, you expect it to open where you left off. MD Reader remembers your page for each file. Even better, it remembers the *heading* you were near, so if you change the font size — which changes how many pages there are — it still brings you back to the right spot rather than a stale page number.

> [!warning] Heads up
> Page numbers are *recomputed* from heading anchors when you change font size. That means the number you see may differ across sessions, but your spot doesn't move.

Continue to [[ch2]].`,

  rich: `# Rich Content Showcase

This file shows off the richer rendering features. Its title and author come from the YAML front-matter at the top.

## Math

Inline math like $a^2 + b^2 = c^2$ renders right in the sentence, and display math gets its own centered line:

$$\\int_0^1 x^2\\,dx = \\frac{1}{3} \\qquad e^{i\\pi} + 1 = 0$$

## A table

| Symbol    | Meaning      |
| --------- | ------------ |
| \`$...$\`   | inline math  |
| \`$$...$$\` | display math |
| \`mermaid\` | a diagram    |

## Callouts

> [!tip] Study tip
> Link notes together with wiki-links and the graph view will map them.

> [!warning] Heads up
> The AI features send document text to your chosen provider only when you invoke them.

See also [[ch1]] and [[handbook]]. Tags: #demo #reference`,

  math: `# Math & Science Showcase

## Wave equation

A pretty classic. The 1D wave equation is

$$\\frac{\\partial^2 u}{\\partial t^2} = c^2 \\frac{\\partial^2 u}{\\partial x^2}$$

where $c$ is the wave speed.

## Maxwell's equations (compact form)

In differential form, vacuum:

$$\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}, \\quad \\nabla \\cdot \\mathbf{B} = 0$$

## Lists

- Newtonian mechanics
- Lagrangian mechanics
- Hamiltonian mechanics`,

  charts: `# Charts & Diagrams

This document demonstrates safe, code-free charts. Each chart is parsed from a YAML-ish spec — no JS runs at render time.

\`\`\`chart
type: line
title: Daily sessions
data:
  - [Mon, 12]
  - [Tue, 18]
  - [Wed, 14]
  - [Thu, 22]
  - [Fri, 28]
\`\`\`

A short note about why this matters: untrusted Markdown shouldn't be able to execute arbitrary code, so MD Reader parses chart specs into a fixed shape and renders them server-side as SVG.

## A diagram

\`\`\`mermaid
flowchart LR
  A[Folder of .md] --> B[Bookshelf]
  B --> C[Reader]
  C --> D{Flip pages}
  D -->|next| C
\`\`\``,

  tables: `# Tables & Callouts

## Inline data

| Course      | Credits | Grade |
| ----------- | ------- | ----- |
| Linear Alg  | 4       | A     |
| Mech I      | 4       | A−    |
| Writing 101 | 3       | B+    |

> [!tip] Tip
> Press \`Cmd+/\` to convert a CSV selection into a Markdown table.

## A nested list

- Phase one
  - Survey
  - Outline
- Phase two
  - Draft
  - Revise`,

  ch2: `# Chapter 2: Under the Hood

## The library model

A *library* is a folder. The app scans it for \`.md\` files, indexes their frontmatter, headings, tags, wiki-links, and tasks, and writes the result to a hidden \`.mdreader/data.json\` so opening it again is instant.

## The reader pipeline

1. Parse Markdown with \`remark\`.
2. Walk the AST to find headings (for the TOC) and tasks (for the dashboard).
3. Render with \`rehype-react\` so equations, diagrams, and charts can be replaced by interactive components.
4. Paginate by laying out the rendered tree against the visible page box.

## Security model

\`contextIsolation\` is on, \`nodeIntegration\` is off, and the renderer talks to the main process through a small typed bridge. Remote images are blocked; Mermaid runs with \`securityLevel: 'strict'\`.`,

  kb: `# Keyboard Shortcuts

## Reading

| Action            | Shortcut       |
| ----------------- | -------------- |
| Next page         | →  /  Space    |
| Previous page     | ←              |
| Table of contents | ☰              |
| Find in page      | Cmd / Ctrl + F |
| Bookmark page     | B              |

## Library

| Action            | Shortcut       |
| ----------------- | -------------- |
| Command palette   | Cmd / Ctrl + K |
| Quick switcher    | Cmd / Ctrl + P |
| New note          | Cmd / Ctrl + N |`,

  slides: `# Slides & Tasks Demo

This note shows two new modes. Open it, then click the grid button in the top bar to present it as slides. Each \`---\` on its own line starts a new slide.

#tutorial #demo

---

## Slide Two

- Use the **arrow keys** or **Space** to move between slides.
- Press **Esc** to leave the presentation.
- Click the dots at the bottom to jump around.

---

## Slide Three: Math & Code Still Work

$$E = mc^2$$

\`\`\`js
console.log('Slides render the same Markdown as the reader.')
\`\`\`

## Task List

These checkboxes show up in the Tasks dashboard on the library screen.

- [x] Read the welcome guide
- [x] Pick a library folder
- [ ] Try the presentation mode
- [ ] Paste an image into the editor
- [ ] Run a cross-library search`,
};

// ───────── Tiny markdown renderer ─────────
// Handles: # ## ###, paragraphs, ul/ol, task list, code fence, inline code,
// **bold**, *italic*, [link](url), [[wikilink]], > [!type] callouts, hr,
// tables, $...$ inline math, $$...$$ block math.
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderInline(text) {
  // wikilinks
  text = text.replace(/\[\[([^\]]+)\]\]/g, (_, k) => `<a class="wiki" data-wiki="${k}">${k.replace(/[-_]/g, ' ')}</a>`);
  // inline math
  text = text.replace(/\$([^$]+)\$/g, (_, m) => `<span class="math-inline">${m}</span>`);
  // bold
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // italic
  text = text.replace(/(^|[\s(])\*([^\s*][^*]*?)\*(?=[\s.,;:!?)]|$)/g, '$1<em>$2</em>');
  text = text.replace(/(^|[\s(])_([^\s_][^_]*?)_(?=[\s.,;:!?)]|$)/g, '$1<em>$2</em>');
  // inline code
  text = text.replace(/`([^`]+)`/g, (_, c) => `<code>${escapeHtml(c)}</code>`);
  // links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="#$2" data-link="$2">$1</a>');
  // strikethrough
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return text;
}
function renderMd(src) {
  // strip front-matter
  src = src.replace(/^---[\s\S]*?---\s*/m, '');
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  const flushPara = (buf) => {
    if (buf.length) out.push(`<p>${renderInline(buf.join(' ').trim())}</p>`);
  };
  while (i < lines.length) {
    let l = lines[i];
    // horizontal rule  --- (slide break)
    if (/^---\s*$/.test(l)) { out.push('<hr/>'); i++; continue; }
    // heading
    const h = /^(#{1,6})\s+(.+)$/.exec(l);
    if (h) {
      const level = h[1].length;
      const text = renderInline(h[2]);
      const id = h[2].toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
      out.push(`<h${level} id="h-${id}">${text}</h${level}>`);
      i++; continue;
    }
    // code fence
    if (/^```/.test(l)) {
      const lang = l.replace(/^```/, '').trim() || 'text';
      i++;
      const codeLines = [];
      while (i < lines.length && !/^```/.test(lines[i])) { codeLines.push(lines[i]); i++; }
      i++;
      out.push(`<pre><span class="lang">${lang}</span><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }
    // block math
    if (/^\$\$/.test(l)) {
      const m = [];
      let line = l.replace(/^\$\$/, '');
      if (/\$\$\s*$/.test(line)) {
        m.push(line.replace(/\$\$\s*$/, ''));
      } else {
        m.push(line); i++;
        while (i < lines.length && !/\$\$\s*$/.test(lines[i])) { m.push(lines[i]); i++; }
        if (i < lines.length) m.push(lines[i].replace(/\$\$\s*$/, ''));
      }
      i++;
      out.push(`<div class="math-block">${m.join(' ').trim()}</div>`);
      continue;
    }
    // callout >[!type] title
    if (/^>\s*\[!(\w+)\]/.test(l)) {
      const m = /^>\s*\[!(\w+)\]\s*(.*)$/.exec(l);
      const type = m[1].toLowerCase();
      const title = m[2] || type;
      i++;
      const body = [];
      while (i < lines.length && /^>/.test(lines[i])) {
        body.push(lines[i].replace(/^>\s?/, '').trim());
        i++;
      }
      out.push(`<div class="callout ${type}"><div class="ctitle">${renderInline(title)}</div><p>${renderInline(body.join(' '))}</p></div>`);
      continue;
    }
    // blockquote
    if (/^>/.test(l)) {
      const body = [];
      while (i < lines.length && /^>/.test(lines[i])) {
        body.push(lines[i].replace(/^>\s?/, '').trim()); i++;
      }
      out.push(`<blockquote>${renderInline(body.join(' '))}</blockquote>`);
      continue;
    }
    // table
    if (/^\|/.test(l) && i + 1 < lines.length && /^\|?\s*[-:|\s]+$/.test(lines[i+1])) {
      const head = l.split('|').slice(1, -1).map(s => s.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        rows.push(lines[i].split('|').slice(1, -1).map(s => s.trim())); i++;
      }
      let html = '<table><thead><tr>';
      head.forEach(c => html += `<th>${renderInline(c)}</th>`);
      html += '</tr></thead><tbody>';
      rows.forEach(r => {
        html += '<tr>';
        r.forEach(c => html += `<td>${renderInline(c)}</td>`);
        html += '</tr>';
      });
      html += '</tbody></table>';
      out.push(html);
      continue;
    }
    // list (ul or ol or task)
    if (/^[-*]\s/.test(l) || /^\d+\.\s/.test(l)) {
      const isOl = /^\d+\.\s/.test(l);
      const items = [];
      while (i < lines.length && (/^[-*]\s/.test(lines[i]) || /^\d+\.\s/.test(lines[i]) || /^\s{2,}/.test(lines[i]))) {
        const ln = lines[i];
        if (/^\s{2,}/.test(ln) && items.length) {
          // continuation; ignore nested for simplicity
          items[items.length - 1] += ' ' + ln.trim();
          i++; continue;
        }
        items.push(ln.replace(/^([-*]|\d+\.)\s/, '').trim());
        i++;
      }
      let html = isOl ? '<ol>' : '<ul>';
      items.forEach(it => {
        const t = /^\[( |x|X)\]\s(.+)$/.exec(it);
        if (t) {
          html += `<li class="task-li"><input type="checkbox" ${t[1].toLowerCase() === 'x' ? 'checked' : ''} readOnly />${renderInline(t[2])}</li>`;
        } else {
          html += `<li>${renderInline(it)}</li>`;
        }
      });
      html += isOl ? '</ol>' : '</ul>';
      out.push(html);
      continue;
    }
    // paragraph
    if (l.trim() === '') { i++; continue; }
    const paraBuf = [l];
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !/^(#|>|\||```|\$\$|[-*]\s|\d+\.\s|---\s*$)/.test(lines[i])) {
      paraBuf.push(lines[i]); i++;
    }
    flushPara(paraBuf);
  }
  return out.join('\n');
}

// Extract headings for TOC
function tocOf(src) {
  const out = [];
  src.replace(/^(#{1,3})\s+(.+)$/gm, (_, h, txt) => {
    const id = txt.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
    out.push({ level: h.length, text: txt.replace(/\*\*|`/g, ''), id: 'h-' + id });
    return '';
  });
  return out;
}

// Simple markdown source highlighter for editor
function highlightMd(src) {
  // Process line-by-line for safety
  return escapeHtml(src).split('\n').map(line => {
    if (/^#{1,6}\s/.test(line)) return `<span class="md-h">${line}</span>`;
    if (/^---\s*$/.test(line)) return `<span class="md-hr">${line}</span>`;
    if (/^```/.test(line)) return `<span class="md-fence">${line}</span>`;
    let l = line
      .replace(/(\*\*[^*]+\*\*)/g, '<span class="md-strong">$1</span>')
      .replace(/(?:^|\s)(\*[^*\s][^*]*\*)/g, m => m.replace(/(\*[^*]+\*)/, '<span class="md-em">$1</span>'))
      .replace(/(`[^`]+`)/g, '<span class="md-code">$1</span>')
      .replace(/(\[[^\]]+\]\([^)]+\))/g, '<span class="md-link">$1</span>')
      .replace(/(\[\[[^\]]+\]\])/g, '<span class="md-link">$1</span>')
      .replace(/^(\s*[-*]\s)/, '<span class="md-list">$1</span>')
      .replace(/^(\s*\d+\.\s)/, '<span class="md-list">$1</span>')
      .replace(/^(\s*&gt;\s)/, '<span class="md-key">$1</span>');
    return l;
  }).join('\n');
}

window.MDR = { Ico, BOOKS, DOCS, SPINES, spineStyle, renderMd, tocOf, highlightMd, escapeHtml, renderInline };
