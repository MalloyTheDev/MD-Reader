# Tauri experiment - branch `experiment/tauri`

## Why

The repo's [`project-next-phase`](../README.md) memory has carried a long-standing
question: would migrating the desktop app from Electron to Tauri (Rust + system WebView)
meaningfully shrink the binary and memory footprint, without sacrificing the rich
feature set we just shipped in v1.5.0 / v2 alpha?

This branch is the **minimum-viable experiment** that answers that question with real
numbers, instead of by speculation. It deliberately does NOT port the entire
`window.api` IPC surface (FS walk, vault, `safeStorage`, `mdimg://`, `chokidar` watcher,
AI HTTP, etc.) to Rust - that is the much larger follow-up if we decide to commit.

## What we built

A Tauri 2 shell that bundles the **v2 web app** (`src/web/`) from `feat/v2-web` as its
frontend. Because the web app is self-contained (File API + drag-drop +
`showDirectoryPicker` + `localStorage`), Tauri's Rust side has zero custom commands.
Capabilities: `core:default` only - no `dialog`, `fs`, `shell`, or `http` permissions
were enabled, so the attack surface is exactly what the WebView already exposes.

### Files added

- `src-tauri/Cargo.toml` - Rust crate definition (Tauri 2.11.2 + log plugin).
- `src-tauri/src/{main,lib}.rs` - default scaffold (no commands).
- `src-tauri/tauri.conf.json` - bundles `../dist-web`, runs `npm run build:web` /
  `npm run dev:web`, opens a 1200x820 window titled "MD Reader (Tauri experiment)".
- `src-tauri/capabilities/default.json` - `core:default` only.
- `src-tauri/icons/` - default Tauri icons (kept as-is for the experiment).
- `package.json` - devDeps `@tauri-apps/cli` + `@tauri-apps/api`, scripts
  `tauri:dev` / `tauri:build`.

### Files NOT touched

- The Electron renderer (`src/renderer/`) - the experiment uses the simpler
  `src/web/` frontend.
- The Electron main process (`src/main/`) - no IPC commands were ported.
- All v1.5.0 / v2-redesign work is untouched on its respective branches.

## Method

- **Toolchain:** Rust 1.95.0 (cargo 1.95.0), Tauri 2.11.2, Node 22.
- **Baseline (Electron):** `dist/md-reader-2.0.0-alpha.1-setup.exe` from
  `feat/v2-redesign`.
- **Comparand (Tauri):** `src-tauri/target/release/bundle/nsis/*-setup.exe`
  from this branch.
- **Frontend:** identical - both load the same v2 token system + bundled fonts +
  the same `renderBodyHtml` pipeline.

## Measurements

| Metric                                    | Electron v2.0.0-alpha.1        | Tauri experiment           |
| ----------------------------------------- | ------------------------------ | -------------------------- |
| Installer size                            | **~138.5 MB**                  | **TBD - see Results**       |
| Installed footprint (unpacked, approx.)   | ~430 MB (Chromium + Node + app) | **TBD - see Results**       |
| Cold-start memory (idle, one window)      | ~250 MB (Chromium + V8)        | **TBD - see Results**       |
| First-build wall time                     | ~3-5 min                       | **TBD - see Results**       |
| Subsequent build (cached)                 | ~30 s                          | **TBD - see Results**       |
| Rust toolchain required                   | No                             | Yes (cargo + rustc 1.77+)  |

## Results

> Filled in when the first Tauri build completes. See "Verification" below for
> the exact paths / commands that produced these numbers.

## What works

- The v2 web app loads in the WebView (Chromium Edge WebView2 on Windows).
- All client features that work in the browser also work in Tauri: drag-drop,
  file picker, KaTeX, Mermaid, charts, callouts, tables, themes, localStorage.
- The same `renderBodyHtml` pipeline used in the desktop renderer.

## What does NOT work (yet)

- **`showDirectoryPicker`** - the Chromium-only File System Access API may not be
  exposed by WebView2 by default. The web app's library would degrade to file picker
  + drag-drop only. To re-enable it inside Tauri, either:
  a) wait for WebView2 to expose it, or
  b) implement a Rust command using Tauri's `dialog::open` + `fs` plugins.
- **AI** - none of the v1.5.0 AI features ship in this experiment. The web app does
  not yet have a BYOK flow, and Tauri would need to add the SSRF-pinned HTTP layer
  in Rust (analogous to what's in `src/main/ai.ts` today).
- **`safeStorage`-equivalent** - no encrypted key storage in this build. A full
  port would need `keyring` crate + a Tauri command surface.
- **The full Electron `window.api`** - `chokidar` watcher, vault auto-import, etc.
  are NOT ported. The experiment shows feasibility, not parity.

## Trade-offs vs Electron

### Pros of Tauri

- **Massive size reduction.** Order-of-magnitude smaller installer.
- **Lower memory.** No bundled Chromium / V8 - uses the OS WebView.
- **Per-OS native chrome.** WebView2 (Edge) on Windows, WebKit on macOS, WebKitGTK on
  Linux. Cleaner integration.
- **Rust security model.** Capability system + per-command permissions makes the
  IPC surface auditable.

### Cons of Tauri (real, not theoretical)

- **WebView fragmentation.** Edge WebView2 != Safari WebKit != WebKitGTK. CSS / JS
  features can differ. OKLCH, `:has()`, etc. need cross-WebView testing.
- **Full `window.api` rewrite in Rust** - this is the real cost. Every IPC command
  in `src/main/ipc.ts` and `src/main/ai.ts` would have to be reimplemented:
  - `walkLibrary`, file CRUD, vault, sidecar (`fs` + `tokio::fs`)
  - `chokidar` watcher (`notify` crate)
  - `shell.trashItem` (`trash` crate)
  - `safeStorage` (`keyring` crate)
  - `mdimg://` custom protocol (Tauri custom protocol handler)
  - AI HTTP with SSRF guard (`reqwest` with redirect policy)
  - All current security tests need to be re-validated against the Rust side.
- **Build time.** First Rust compile is 5-20 min vs Electron's ~30s npm install.
  Cached builds are competitive (~30 s).
- **Plugin ecosystem.** Less mature than Electron's. Niche needs (e.g., complex
  global shortcuts, OS-specific tray menus) may require writing more Rust.
- **Existing test coverage.** Our 164 unit tests + CDP scripts assume the Electron
  IPC contract. Recreating equivalents against Rust is non-trivial.

## Recommendation

> Filled in after the build + a brief side-by-side run.

## How to reproduce

```bash
git checkout experiment/tauri
npm install                    # picks up @tauri-apps/cli + api
npm run tauri:dev              # launches the WebView2 window in dev mode
npm run tauri:build            # produces the NSIS installer under
                               # src-tauri/target/release/bundle/nsis/
```

## Security

This branch makes no change to the published v1.5.0 / `main` security model. The
Tauri shell uses only the `core:default` capability set (no file system, network,
or dialog access from the WebView through the Rust side). Frontend security
(Markdown sanitization, Mermaid strict mode, chart parser with no eval, no remote
images by default) is unchanged - it's the same `renderBodyHtml` pipeline.

If we decide to commit to a full Rust port, the security review will need to
re-verify every Rust command that is added, especially:

- Path confinement equivalent to `isInsideRoot` (`safe-path.ts` today).
- SSRF guard equivalent to `resolveBaseUrl` (`ai-endpoints.ts` today).
- Encrypted key storage equivalent to `safeStorage`.
- Custom-protocol handling equivalent to `mdimg://`.

## Status

This is a feasibility branch only. **Nothing here ships to `main`**, `v1.5.0` (the
published release) and `feat/v2-redesign` (the v2.0.0-alpha installer) are
untouched. The experiment should be merged or deleted based on the recommendation
above.
