# Web and native distribution: options and decision

MD Reader currently ships as a Windows Electron app. This note weighs the realistic paths to
broader reach (the biggest gap at v1.4.2) and records the decision.

## The three options

### 1. Electron (today)

- **Pros:** full local-vault experience, real filesystem access, OS keychain (encrypted AI keys),
  file watching, Recycle-Bin deletes, and the whole feature set. Already shipping.
- **Cons:** large installer (~134 MB) and higher memory than native; currently Windows-only
  (macOS/Linux builds are wired in electron-builder but not yet produced); requires a download +
  the unsigned-installer SmartScreen prompt.

### 2. Tauri (Rust + system webview)

- **Pros:** much smaller binaries (often ~5-15 MB) and lower memory; uses the OS webview.
- **Cons:** the **entire main process would have to be re-implemented in Rust** - the `window.api`
  surface (folder walking, file read/write, vault/import, `chokidar` watching, `shell.trashItem`,
  `safeStorage` key encryption, the `mdimg://` protocol, the AI provider calls). That is a large,
  risky rewrite for a backend that currently works. Requires a Rust toolchain and a different
  ecosystem. The renderer itself would mostly carry over.
- **Verdict:** a worthwhile *later* option if binary size / memory becomes a real adoption blocker.
  Not now. Note that the renderer's logic already lives in pure, dependency-light `lib/` modules, so
  a future Tauri shell only needs the main process ported, not the UI.

### 3. Web / PWA reader (this branch)

- **Pros:** **zero install, instant reach**, runs anywhere a browser does, deployable to the
  existing GitHub Pages site. It reuses the desktop app's exact rendering pipeline: the pure
  `renderBodyHtml` already turns Markdown into sanitized static HTML with KaTeX math, pre-rendered
  Mermaid, inline chart SVGs, and callouts. So the web reader is high-fidelity with almost no new
  rendering code.
- **Cons / limits:** the browser has no persistent local vault by default. Folder access depends on
  the File System Access API (Chromium-only, permission-gated); other browsers fall back to a file
  picker / drag-and-drop. There is no OS keychain, so AI features are out of scope for the web
  reader v0. Local relative-path images do not resolve (remote/data-URI images do).

## Decision

- **Keep Electron as the full local-first vault.** It is the product's strength and the privacy
  story depends on it.
- **Ship a Web / PWA reader now** (started on the `feat/web-reader` branch) as the reach play: a
  read-first, install-free companion that renders Markdown - including math, diagrams, and charts -
  in any browser, installable as a PWA, deployable to GitHub Pages. It complements the desktop vault
  rather than replacing it.
- **Defer Tauri.** Revisit if/when binary size or memory becomes a concrete blocker; the pure-`lib/`
  architecture keeps that door open.

## Web reader v0 scope (this branch)

- Open one or more `.md` files via picker, drag-and-drop, or `showDirectoryPicker` (where available).
- Render with the shared pipeline (math / Mermaid / charts / callouts / GFM), bundled KaTeX CSS, and
  the app's theme styling.
- Installable PWA (manifest + a runtime-cache service worker) so it works offline after first load.
- Out of scope for v0: persistent vault, editing/saving back to disk, AI features, local-image
  resolution. These are follow-ups once the reader proves out.
