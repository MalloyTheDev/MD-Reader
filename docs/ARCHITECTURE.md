# Architecture

MD Reader v2+ is a **Tauri** app. The renderer is a sandboxed React 19 web app that talks to a Rust
backend exclusively through a thin `window.api` shim (`src/renderer/src/lib/tauri-api.ts` using
`@tauri-apps/api`). This keeps the UI byte-for-byte compatible with the previous Electron
reference build.

```
┌─────────────────────────────────────────────────────────────────────┐
│ Renderer (sandboxed webview)      src/renderer/src                    │
│   React 19 UI · App.tsx · components/ · lib/ (pure logic)             │
│        │  calls window.api.*  (typed, audited surface only)           │
└────────┼──────────────────────────────────────────────────────────────┘
         │  @tauri-apps/api (invoke + listen)
┌────────┼──────────────────────────────────────────────────────────────┐
│ Tauri Rust backend (src-tauri)                                        │
│   lib.rs (setup, plugins, mdimg:// protocol, invoke_handler)          │
│   commands.rs (file/vault/AI/export impls)  state.rs  config.rs       │
│   ai.rs (keyring + streaming)  paths.rs (confinement)  sidecar.rs     │
│   + notify for FS watching, trash crate, reqwest, etc.                │
└───────────────────────────────────────────────────────────────────────┘
```

The legacy Electron code (`src/main`, `src/preload`, `electron-vite`) is retained for reference
and comparison but is no longer the primary target.

Shared TypeScript types live in `src/shared/` and are imported by all layers via the `@shared`
alias.

## Tauri Rust backend (`src-tauri`)

The privileged layer (Rust + Tauri 2 plugins). Responsibilities:

- **`lib.rs`** - app setup, single-instance handling, custom `mdimg://` protocol (root-confined +
  symlink-safe canonicalize checks), plugin registration (dialog, opener, window-state), and the
  full `invoke_handler` list.
- **`commands.rs`** - the bulk of the API surface: list/read/write files, vault + folder ops,
  import, trash (via `trash` crate), settings/state/sidecar persistence, shell actions, AI
  commands, and export stubs (renderer does most HTML/DOCX prep). All paths are guarded by
  `is_inside` / `is_inside_root`.
- **`paths.rs`** - pure `normalize`, `is_inside`, and `safe_seg` (unit-tested confinement + name
  sanitization).
- **`ai.rs`** - multi-provider AI (OpenAI/Anthropic/Ollama) with keyring storage, SSRF host
  pinning, streaming via reqwest + SSE parsing, cancellation, and usage/cost reporting.
- **`config.rs`** + **`sidecar.rs`** - JSON config in the OS app config dir + per-library
  `.mdreader/data.json` for positions/bookmarks/annotations.
- **`state.rs`** - in-memory authorized roots + current library root.
- **`protocol.rs`** + **`digest.rs`** + **`frontmatter.rs`** - supporting helpers.
- File watching uses the `notify` + `notify-debouncer-full` crates (emits `library:changed`).

The old Electron `src/main/*` and `src/preload` are legacy reference only.

## Renderer bridge (Tauri)

In the Tauri build there is no classic preload. Instead `src/renderer/src/main.tsx` conditionally
loads `src/renderer/src/lib/tauri-api.ts` (only when `__TAURI__` globals are present). That module
implements the exact same `MdReaderApi` interface by mapping every call to `invoke(...)` or
`listen(...)` from `@tauri-apps/api`. The renderer never talks to the OS directly.

## Renderer (`src/renderer/src`)

A sandboxed React 19 app (Vite-built). It never touches the filesystem directly - only
`window.api`. Key parts:

- **`App.tsx`** - top-level state and orchestration: the open folder, file list, current document,
  tabs, settings, search query, panels (AI, create, settings, doc-info, templates), and persistence
  wiring.
- **`components/`** - `Library` (bookshelf + shelf actions + folder nav), `Reader` (paginated
  view), `Editor`, `SettingsView`, `GraphView`, `AiPanel`, `TemplatePicker`, `DocInfoPanel`,
  `ConfirmDeleteModal`, etc.
- **`lib/`** - **pure, testable** logic with no React/Electron deps: `markdown.tsx` (remark/rehype
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
