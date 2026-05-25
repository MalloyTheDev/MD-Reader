# Changelog

All notable changes to MD Reader. Versions are published as Windows installers on the
[Releases](https://github.com/MalloyTheDev/MD-Reader/releases) page. (Installers are currently
unsigned - see [Windows install notes](README.md#windows-install-notes).)

## [Unreleased]

### Added

- **Live AI model lists**: the model picker now fetches available models directly from OpenAI and
  Anthropic (cached, with a Refresh button and an offline fallback), so new models appear without
  an app update.
- **Four new AI actions**: _Translate_ (to any language) and _Tone rewrite_ in the Repurpose panel;
  _Extract action items_ and _Text → Mermaid diagram / table_ in the study assistant.

### Changed

- **Sturdier AI requests**: automatic retry/backoff for OpenAI, SDK-level retries and a larger
  per-action output budget for Anthropic, adaptive thinking on Claude 4.x, and clearer errors.
  Anthropic is now pinned to its official host (matching the OpenAI SSRF guard).

### Fixed

- **Reading scroll**: oversized code blocks, equations, and images taller than the page are capped
  to the page height and scroll internally, so content is never clipped at large font sizes or in
  single-page mode.

## [1.4.2] - 2026-05-25

### Fixed

- The folder-navigation control is now **always visible** in the library toolbar as **📂 Folders ▾**
  (it was previously hidden when you had no other folder open). Its menu offers _Open another
  folder…_ plus one-click switching to any recent folder - so you're never stuck without a way out.

## [1.4.1] - 2026-05-25

### Added

- **Recent folders**: the app remembers every library root you open and lets you switch back in one
  click, including a _Back to <folder>_ button on the empty-library screen - no re-browsing the file
  system. A removed/missing folder is dropped from the list with a notice.

## [1.4.0] - 2026-05-25

A large "power-user" upgrade delivered in 10 audited phases.

### Added

- **Safe delete system**: _Remove from Library_ (hidden, undoable) vs _Delete_ (to the Recycle Bin),
  both behind a confirmation showing the full path; missing-file detection + cleanup.
- **Math actions**: per-equation _Copy LaTeX_ / _Expand_, plus a science/quantum/genetics example doc.
- **Mermaid controls**: zoom / pan / fullscreen / copy source / export SVG·PNG and a graceful error panel.
- **Media**: image captions, width hints, missing-image warnings, copy-path / open-in-Explorer.
- **Charts**: a safe, dependency-free ` ```chart ` block (line · bar · pie · scatter · area).
- **Templates**: 15 curated note scaffolds across software, science, education, and business.
- **Tables & callouts**: extra science/engineering callout types with icons, wide-table horizontal
  scrolling, and CSV ↔ Markdown-table conversion in the editor.
- **Advanced search**: operators `tag:` `title:` `path:` `content:` `has:…` with matched-line previews.
- **Document intelligence**: a Document-info panel with content counts + broken-wiki-link health checks.
- **Rich export**: HTML and Word export now render math, Mermaid diagrams, and charts.

### Security

- Per-phase security & bug/code audits; fixed ReDoS, false-positive feature detection, and several
  edge-case bugs uncovered during review.

## [1.3.0] - 2026-05-25

### Added

- A managed **vault** (`Documents/MD Reader`), collection **folders**, and file/folder **import**.
- An **AI README generator** that studies a project's source code.

## [1.2.0] - 2026-05-25

### Added

- **Multi-provider AI** (Anthropic, OpenAI, OpenAI-compatible / Ollama) with keys stored encrypted
  via the OS keychain.
- Generative features: study assistant, repurpose-a-doc, topic → course pack, and auto-organize
  (title / tags / links).

## [1.1.0] - 2026-05-25

### Added

- Initial public release: paginated book-style reader, library/bookshelf, themes & reading settings,
  in-document and cross-library search, KaTeX math, Mermaid diagrams, bookmarks, table of contents,
  highlights, and flashcards.

[Unreleased]: https://github.com/MalloyTheDev/MD-Reader/compare/v1.4.2...main
[1.4.2]: https://github.com/MalloyTheDev/MD-Reader/releases/tag/v1.4.2
[1.4.1]: https://github.com/MalloyTheDev/MD-Reader/releases/tag/v1.4.1
[1.4.0]: https://github.com/MalloyTheDev/MD-Reader/releases/tag/v1.4.0
[1.3.0]: https://github.com/MalloyTheDev/MD-Reader/releases/tag/v1.3.0
[1.2.0]: https://github.com/MalloyTheDev/MD-Reader/releases/tag/v1.2.0
[1.1.0]: https://github.com/MalloyTheDev/MD-Reader/releases/tag/v1.1.0
