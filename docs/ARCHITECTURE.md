# Architecture

MD Reader is an Electron app with three isolated layers — **main**, **preload**, and **renderer** —
plus a set of pure, unit-tested libraries that hold the interesting logic. This document explains
how the pieces fit together.

```
┌─────────────────────────────────────────────────────────────────────┐
│ Renderer (sandboxed, no Node)         src/renderer/src                │
│   React 19 UI · App.tsx · components/ · lib/ (pure logic)             │
│        │  calls window.api.*  (typed, audited surface only)           │
└────────┼──────────────────────────────────────────────────────────────┘
         │  contextBridge
┌────────┼──────────────────────────────────────────────────────────────┐
│ Preload  src/preload/index.ts                                         │
│   Exposes a fixed window.api over ipcRenderer.invoke / on             │
└────────┼──────────────────────────────────────────────────────────────┘
         │  IPC (ipcMain.handle)
┌────────┼──────────────────────────────────────────────────────────────┐
│ Main (full Node + OS)   src/main                                      │
│   ipc.ts (FS, watch, vault, trash)  ai.ts (providers)  store.ts       │
│   sidecar.ts  index.ts (windows, mdimg:// protocol)  safe-path.ts     │
└───────────────────────────────────────────────────────────────────────┘
```

Shared TypeScript types live in `src/shared/` and are imported by all layers via the `@shared`
alias.

## Main process (`src/main`)

The only layer with Node and OS access. Responsibilities:

- **`index.ts`** — creates the `BrowserWindow` (with `contextIsolation`, `nodeIntegration: false`,
  the preload script), registers the custom **`mdimg://`** protocol for serving local images
  (root-confined + realpath-checked), restores window bounds, and handles file-association /
  single-instance open paths.
- **`ipc.ts`** — the bulk of privileged behavior: walking a folder into a Markdown file list,
  reading/writing files, front-matter parsing (`gray-matter`), the managed **vault** + folder
  creation + import, `chokidar` file watching (debounced change events), `shell.trashItem`
  deletes, `shell.showItemInFolder`, and the source-code **digest** for AI README generation
  (with secret-skipping + redaction). Every path is guarded by `isInsideRoot`.
- **`safe-path.ts`** — pure `isInside(root, path)` confinement check and `safeSeg(name)` filename
  sanitizer (no Electron deps, so they're unit-tested directly).
- **`ai.ts`** — the AI provider integration (see _AI provider boundary_ below).
- **`store.ts`** — JSON config persistence in the app's `userData` dir (window bounds, last folder,
  recent folders, encrypted AI key blobs). **`sidecar.ts`** — per-folder `.mdreader/data.json`
  holding positions/bookmarks/annotations so notes travel with the folder.

## Preload bridge (`src/preload/index.ts`)

A thin, security-critical shim. It uses `contextBridge.exposeInMainWorld('api', …)` to publish a
**fixed, typed `window.api`** whose methods map to `ipcRenderer.invoke(channel, …)` (request/reply)
or `ipcRenderer.on(channel, …)` (events: file-changed, AI stream chunks, open-path). The renderer
can only reach the main process through these declared methods — there is no general IPC access.
The shape is typed by `MdReaderApi` in `src/shared/types.ts`.

## Renderer (`src/renderer/src`)

A sandboxed React 19 app (Vite-built). It never touches the filesystem directly — only
`window.api`. Key parts:

- **`App.tsx`** — top-level state and orchestration: the open folder, file list, current document,
  tabs, settings, search query, panels (AI, create, settings, doc-info, templates), and persistence
  wiring.
- **`components/`** — `Library` (bookshelf + shelf actions + folder nav), `Reader` (paginated
  view), `Editor`, `SettingsView`, `GraphView`, `AiPanel`, `TemplatePicker`, `DocInfoPanel`,
  `ConfirmDeleteModal`, etc.
- **`lib/`** — **pure, testable** logic with no React/Electron deps: `markdown.tsx` (remark/rehype
  pipeline + components), `chart.ts`, `search.ts`, `docinfo.ts`, `table.ts`, `templates.ts`,
  `annotations.ts`, `graph.ts`, `export.tsx`, `aiClient.ts`. This is where most unit tests point.

### Renderer sandboxing

Because opened documents are untrusted, the renderer is hardened: no Node integration, a sanitized
Markdown pipeline (no `rehype-raw`; `javascript:` URLs stripped), remote images blocked by default,
Mermaid in `strict` mode with SVG sanitization, and charts that execute no code. See
[SECURITY.md](../SECURITY.md) for the full model.

## File indexing

When a folder opens, the main process recursively walks it (`walk` in `ipc.ts`, skipping
`node_modules`/`.git`/dotfiles) and returns `MarkdownFileMeta[]` (name, relative/absolute path,
size, mtime). The renderer caches this list, derives the bookshelf, "continue reading", tags, and
the link graph from it, and re-walks on `chokidar` change events.

## Search index

`lib/search.ts` builds an in-memory **MiniSearch** index (`buildIndex`) over each document's title,
headings, and body (Markdown stripped). At index time it also extracts front-matter **tags** and a
**feature set** (`has:math|mermaid|chart|table|todo|image|code`). `parseQuery` turns a query string
into free text + operator filters (`tag:` `title:` `path:` `content:` `has:`), and
`runLibrarySearch` runs MiniSearch for the text, applies the filters, and returns results with
matched-line previews. Indexing happens once per folder load (not per keystroke); only the
lightweight query runs as you type.

## Export pipeline

`lib/export.tsx` renders a document to **static HTML** (and Word, via the main-process docx step):

1. `prerenderMermaid(content)` extracts every ` ```mermaid ` block and renders each to a **sanitized
   SVG** asynchronously (same `securityLevel: 'strict'` + `sanitizeSvg` as the live reader).
2. `renderBodyHtml` runs the document through `react-markdown` with the rehype/remark plugins (so
   **KaTeX math** is rendered) and a static component set that swaps `chart` blocks for inline
   `ChartSvg` and `mermaid` blocks for their pre-rendered SVG.
3. `renderDocHtml` wraps the body with print-friendly CSS and a pinned KaTeX stylesheet.

The result is a self-contained, **script-free** HTML file. The renderer's `exportHtml` / `exportDocx`
hand the output to the main process to write to a user-chosen path.

## AI provider boundary

AI is optional and isolated:

- The renderer's `lib/aiClient.ts` (`runAiOnce`) only sends a request descriptor over `window.api`;
  the actual network call and key access happen in **`src/main/ai.ts`**.
- Keys are stored encrypted via `safeStorage` and never reach the renderer.
- `resolveBaseUrl` (`src/shared/ai-endpoints.ts`) decides the endpoint: **OpenAI is pinned to its
  official host** (SSRF guard, renderer base URL ignored), Ollama defaults to localhost, and the
  **custom** provider uses a caller-supplied URL. Responses stream back to the renderer as events.

See [SECURITY.md](../SECURITY.md) for the threat model and [CHANGELOG.md](../CHANGELOG.md) for
version history.
