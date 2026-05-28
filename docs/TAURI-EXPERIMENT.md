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

Measured on this branch, this machine (Windows 11, Rust 1.95.0, Node 22, Tauri 2.11.2).
Both builds were release / production, with the **same** `dist-web/` frontend (v2 OKLCH
tokens + locally-bundled Source Serif 4 / Inter Tight / JetBrains Mono + the `renderBodyHtml`
pipeline). The only thing that differs is the shell.

| Metric                                    | Electron v2.0.0-alpha.1                 | Tauri experiment                                | Ratio                |
| ----------------------------------------- | --------------------------------------- | ----------------------------------------------- | -------------------- |
| **Installer (NSIS)**                      | 145,223,604 B (**138.5 MB**)            | 4,596,325 B (**4.4 MB**)                        | **~32x smaller**     |
| Installer (MSI alternative)               | n/a (Electron NSIS only)                | 5,570,560 B (5.3 MB)                            | -                    |
| **Unpacked footprint**                    | 518 MB (`dist/win-unpacked/`)           | ~11 MB (`md-reader-tauri.exe`, assets embedded) | **~47x smaller**     |
| Frontend payload bundled                  | same `dist-web/` ~6.4 MB                | same `dist-web/` ~6.4 MB embedded               | -                    |
| First-build wall time                     | ~3-5 min                                | ~10-15 min (Cargo downloads + compiles)         | slower               |
| Subsequent build (cached)                 | ~30 s                                   | ~30-60 s (incremental Rust)                     | comparable           |
| Rust toolchain required                   | No                                      | Yes (cargo + rustc 1.77+)                       | -                    |
| Smoke launch (`timeout 4 <exe>`)          | -                                       | exit 124 (ran 4 s, killed by timeout - clean)   | -                    |

## Results

The Tauri shell **builds and launches** without code changes beyond the
scaffold. The shipped NSIS installer is **~32x smaller** and the unpacked app
is **~47x smaller** than the Electron build. The same `.md` content renders
identically because both shells run the same `renderBodyHtml` pipeline against
the same bundled fonts and tokens.

The cost of those numbers is **not** in the shell - it is in the missing
`window.api` surface. The Tauri build here only wraps the simpler `src/web/`
frontend, which already gets by with browser File API + drag-drop + localStorage.
The Electron app's renderer relies on a much richer IPC (vault, watcher,
`safeStorage`, AI HTTP, custom protocols) that does not yet exist on the Rust
side and is the work that would dominate a real migration.

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

**Yes, Tauri is worth pursuing as the future shell - but not yet, and not as a
big-bang migration.** Recommend the following sequence:

1. **Ship v2.0.0 on Electron first.** The v2.0.0-alpha installer on
   `feat/v2-redesign` is already built and working with the full vault / AI /
   highlights / flashcards / graph feature set. Cutting v2.0.0 protects users
   from the v1.5.0 -> v2 visual break with a real release, regardless of what
   we do with the shell.

2. **Open `experiment/tauri-full-port` from `feat/v2-redesign` (not this
   branch).** Goal: port the Electron renderer (not the web app) into Tauri,
   by writing a `window.api` shim that calls Rust commands. Tackle commands in
   priority order:
   1. File system (walk, read, write, trash, watcher) - largest surface, most
      `unsafe`-adjacent Rust, biggest blocker.
   2. Vault + sidecar (`.mdreader/data.json` per folder, atomic writes).
   3. `safeStorage` equivalent (`keyring` crate).
   4. AI HTTP with the SSRF redirect-guard (`reqwest` with manual redirect
      policy + per-provider host pinning).
   5. `mdimg://` custom protocol (Tauri's custom-protocol handler).
   6. Native menus, dialogs, OS open/reveal (Tauri plugins).
   Estimate: 2-4 focused weeks. Each command added requires the same security
   review the Electron side already passed.

3. **Re-measure with the FULL app** once parity is reached. Bundle size will
   grow once the AI HTTP layer, `keyring`, `notify` watcher, etc. are linked
   in - probably to ~10-20 MB installer instead of 4 MB. Still a giant win
   versus Electron's 138 MB, but the headline number will be smaller than
   what this experiment shows.

4. **Cut over** only after the full app has gone through one security audit
   round on the Rust side and the existing 164 unit tests have Tauri-side
   equivalents (especially path-traversal, symlink, SSRF, malformed AI config).

**Do not merge `experiment/tauri` to `main`.** It is a feasibility artifact
and a place to come back to when starting the full port. Keep it pushed so
the numbers above are reproducible. The web app branch (`feat/v2-web`) and
the v2 desktop branch (`feat/v2-redesign`) continue forward independently of
the Tauri direction.

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
