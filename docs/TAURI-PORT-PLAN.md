# MD Reader v2.0.0 - Tauri port plan and handoff

Status: PLANNING / NOT STARTED. Last updated 2026-05-29.
Author: Brendan Malloy.

This is the single source of truth for the Tauri swap. Read this top to bottom before
touching code. It exists so we do not repeat the mistake that prompted it.

---

## 0. What happened, and the decision (read this first)

The intent for v2.0.0 was always: **the new v2 UI shipped on a Tauri (Rust) shell, not
Electron.** The whole point of the redesign was a full rework, frontend AND backend.

What actually got built first was the v2 UI packaged in **Electron** (versions
2.0.0-alpha.1 / .2 / .3). That packaging is NOT the intended v2.0.0. It is useful only as a
reference build to validate the look and feel (which is approved - the UI looks great).

**Decision: v2.0.0 = the v2 UI on Tauri.** The Electron alphas are throwaway validation
builds. We do the real Rust backend port next.

Guardrails that still apply (do not drop any of these):
- Sole authorship: commit as Brendan Malloy, NO Co-Authored-By trailers, NO em/en-dashes
  anywhere (commits, code, docs, release notes). Plain hyphens only.
- Installer is UNSIGNED. All wording says "unsigned" + the SmartScreen "unknown publisher
  -> More info -> Run anyway" note. Never say "signed".
- Security model must reach PARITY with the Electron app (see section 4). Do not ship a
  Tauri build that is weaker than the Electron one.
- Navigation: never leave the user stuck; always a one-click way back.

---

## 1. Current branch state (as of 2026-05-29)

- `feat/v2-redesign` - the v2 UI on Electron. HEAD has the approved UI + audit fixes.
  Latest commits: `6515b78` settings-import hardening (NOTE: see caveat below), `4636bfa`
  screenshots, `1125d87` v2.0.0-alpha.3 bump, `f986abe` accent-off + legacy-theme fixes,
  `6b4f2c6` shoot.mjs selectors, `62eb582` installer bloat fix. Pushed to origin.
- `experiment/tauri` - forked from `feat/v2-redesign` at commit `0182f00` ("v2 polish
  round 2"), which is AFTER the full v2 reskin. So this branch ALREADY HAS the complete
  v2 UI. Its Rust side is a 3-command toy (see section 3). Pushed to origin.
- `main` - v1.5.0 (published, current public Latest). Untouched. Stays Latest until
  v2.0.0 (Tauri) is approved and published.
- `v1.4.2-stable` - saved stable foundation. Untouched.
- `feat/v2-web` - v2 PWA (separate web deliverable). Not part of the Tauri port.
- `feat/web-reader`, `feat/main-update` - parked/legacy; ignore for this work.

Commits on `feat/v2-redesign` that `experiment/tauri` is MISSING (must be synced over
first - see step 1 in section 5):
```
6515b78 Harden settings-import trust boundary ...
4636bfa Regenerate docs screenshots for v2 from the alpha.3 build
1125d87 Bump version to 2.0.0-alpha.3 ...
f986abe Fix accent-off using a nonexistent CSS token, clamp legacy persisted themes
6b4f2c6 Update shoot.mjs selectors to v2 class names
62eb582 Stop electron-builder from bundling cross-branch artifacts (3x bloat fix)
```
The two correctness fixes in `f986abe` (accent-off `--fg-muted`->`--muted`, and the legacy
theme clamp in `src/main/store.ts`) MUST be carried into the Tauri build. The store.ts clamp
logic also has to be reimplemented Rust-side (the Tauri config loader is new code).

---

## 2. The goal in one sentence

Replace Electron's Node main process with a Rust Tauri 2 backend, while keeping the entire
v2 React renderer (`src/renderer/**`) byte-for-byte unchanged, by providing a `window.api`
shim that maps the existing typed API onto Tauri `invoke`/`event` calls.

Why the shim approach: the renderer talks to the backend ONLY through `window.api`
(the `MdReaderApi` interface in `src/shared/types.ts`, implemented today by
`src/preload/index.ts`). If we implement the same interface against Tauri, NO renderer code
changes. This is the lowest-risk path and protects the approved UI.

Measured upside (from `docs/TAURI-EXPERIMENT.md`): ~32x smaller installer, ~47x smaller
footprint vs Electron.

---

## 3. What exists on `experiment/tauri` today

Verified contents on `experiment/tauri` (byte sizes from `git cat-file -s`):
```
src-tauri/
  .gitignore
  Cargo.toml          (676 bytes - minimal deps)
  Cargo.lock
  build.rs
  capabilities/default.json
  tauri.conf.json     (931 bytes)
  icons/*             (full icon set: ico/icns/png + Square* tiles)
  src/main.rs         (177 bytes - calls lib::run())
  src/lib.rs          (417 bytes - boilerplate only)
```

CORRECTION (verified 2026-05-29): the Rust backend implements ZERO commands. `src/lib.rs`
is just the default Tauri 2 scaffold - `pub fn run()` building `tauri::Builder::default()`
with a debug log plugin and `generate_context!()`. There is NO `commands.rs` file, NO
`invoke_handler`, NO `generate_handler`. (An earlier note claimed 3 toy commands existed;
that was wrong - confirmed by dumping the file.)

Implication: the Rust backend is genuinely 0% done. Nothing to tear out, nothing to build
on - it is a clean scaffold. Every one of the 36 commands in section 6 is net-new Rust.
This was a bundle-size feasibility spike (it measured ~32x smaller) not a port.

---

## 4. Security parity checklist (NON-NEGOTIABLE)

The Electron app's security model (verified intact in the 2026-05-28 audit). Each item must
have a Rust equivalent before v2.0.0 ships. Map of where it lives in Electron today:

1. Path confinement - `src/main/safe-path.ts` `isInside()` (lexical: rejects `..` and
   absolute escape) wrapped by `isInsideRoot()` against the live library root. Every fs IPC
   handler calls it. RUST: implement `is_inside_root(root, candidate) -> bool` (canonicalize
   both, then check prefix; also reject before-canonicalize on `..`). Apply to EVERY file/
   folder command. There is a Rust unit-test target to mirror `safe-path.test.ts` (16 cases).
2. Authorized-roots allowlist - the folder-widening handlers (`library:listMarkdown`,
   `library:readAll`) only accept a root that came from the picker dialog, a file-association
   open, or the persisted lastFolder. RUST: keep an in-memory `authorized_roots` set, add to
   it only via the dialog/open paths, check membership in the list/readAll commands.
3. safeStorage for AI keys - `src/main/ai.ts:35-47` encrypts keys with Electron safeStorage
   (`enc:` prefix), refuses to store if encryption unavailable, never returns plaintext to
   renderer (`ai:status` returns only a boolean). RUST: use the `keyring` crate (Windows
   Credential Manager) OR `tauri-plugin-stronghold`. MIGRATION NOTE: existing users' keys
   live in Electron's config and will NOT carry over - the Tauri build starts with no keys
   and the user re-enters them once. Document this in the release notes. Never expose the key
   to the renderer; `ai_status` returns only `{configured: bool}`.
4. SSRF host-pinning - `src/shared/ai-endpoints.ts:9-16` forces openai ->
   `https://api.openai.com/v1` and anthropic -> `https://api.anthropic.com/v1`, IGNORING any
   renderer-supplied baseUrl (custom/ollama may set their own). Key-bearing fetches use
   `redirect: 'manual'` and reject 3xx. RUST: replicate exactly with `reqwest`
   (`.redirect(reqwest::redirect::Policy::none())`); pin the host for openai/anthropic;
   only honor custom baseUrl for the custom/ollama providers.
5. Mermaid strict + SVG sanitize, charts parse-only - these live ENTIRELY in the renderer
   (`src/renderer/src/lib/markdown.tsx`, `chart.ts`, `export.tsx`). They carry over
   unchanged. No Rust work. Just confirm they still run in the Tauri webview.
6. Local-image protocol - `src/main/index.ts:158-182` serves `mdimg://` by resolving the
   path, `realpathSync`-rechecking containment (symlink defense), then streaming bytes.
   RUST: register a custom URI scheme protocol (`register_uri_scheme_protocol`) that does the
   same canonicalize + confinement check before returning bytes. Default-deny remote images
   stays a renderer setting (`allowRemoteImages:false`).
7. Renderer hardening - contextIsolation/nodeIntegration are Electron concepts; the Tauri
   equivalent is: do NOT enable `withGlobalTauri` broadly, lock down the Tauri `capabilities`
   /permissions to only the plugins we use, set a strict CSP in `tauri.conf.json` mirroring
   `src/renderer/index.html` (`script-src 'self'`), and use `dangerousRemoteDomainIpcAccess`
   = none. External links open via `tauri-plugin-shell` `open`, http(s) only.
8. No new attack surface - the `window.api` shim must expose ONLY the same ~36 methods, each
   mapped to one named `invoke`. No generic `invoke(channel, ...)` passthrough to the
   renderer.

---

## 5. The port, step by step (do in this order)

Each step ends with a verify-in-the-Tauri-window check before moving on. Commit per group.

STEP 1 - Sync + branch hygiene
- Merge/rebase the 6 missing `feat/v2-redesign` commits onto `experiment/tauri` (or
  fast-forward if clean) so the Tauri branch has the approved UI + both audit fixes + this
  doc. Confirm `book2` cards, accent-off fix, and store.ts clamp are present.
- Decide working branch: rename `experiment/tauri` -> `feat/v2-tauri` (the real port) or
  keep the name. Document the choice in the first commit.

STEP 2 - Toolchain + scaffold real backend
- Confirm `cargo`/`rustc` 1.95 present (they are). Confirm `@tauri-apps/cli` +
  `@tauri-apps/api` installed.
- Flesh out `Cargo.toml` deps: `tauri` 2, `tauri-plugin-dialog`, `tauri-plugin-shell`,
  `tauri-plugin-single-instance`, `tauri-plugin-window-state`, `serde`/`serde_json`,
  `reqwest` (rustls, stream), `keyring`, `notify` (file watch), `walkdir`, `dirs`.
- Add npm scripts: `tauri:dev`, `tauri:build`. Wire electron-vite renderer build output as
  Tauri's `frontendDist`, or run Tauri against the vite dev server in dev.

STEP 3 - The window.api shim (KEY STEP - unlocks everything)
- New file `src/renderer/src/lib/tauri-api.ts` (or a small preload-equivalent) that
  implements the `MdReaderApi` interface using `@tauri-apps/api` `invoke` for request/reply
  methods and `event.listen` for the 3 event subscriptions (`onLibraryChanged`,
  `onOpenPath`, `onAiEvent`). Assign it to `window.api` at startup.
- This means the React app stays UNCHANGED. Verify the app boots in the Tauri window with
  every command stubbed to return empty/typed defaults, before implementing the Rust side.

STEP 4 - Files + path confinement (the security spine)
- Rust: `is_inside_root`, `authorized_roots`, then commands: `read_file`, `write_file`,
  `new_file`, `trash_file` (use OS recycle bin), `list_markdown` (recursive, returns
  `MarkdownFileMeta` shape), `read_all`, `check_missing`.
- Verify: open the vault, see `book2` cards populate from real files, open a doc, edit+save.

STEP 5 - Vault + folders + import
- `pick_folder` (dialog), `open_vault`, `create_folder`, `import_files`, `import_folder`,
  `trash_folder`, `create_course`, `save_image`, `project_digest`.
- Verify: create a folder, import markdown, the recent-folders menu works.

STEP 6 - Settings + state + sidecars (persistence)
- Rust config store at the Tauri app-config dir. Reimplement the `store.ts` logic INCLUDING
  the legacy-theme clamp (theme not in THEME_NAMES -> default) and the old single-aiKey ->
  per-provider migration. `get/set_settings`, `get/set_state`, `sidecar_load/save`.
- Verify: change a setting, reload, it persists; reading position restores.

STEP 7 - AI (with safeStorage + SSRF parity)
- `ai_set_key`/`ai_clear_key` (keyring), `ai_status` (boolean only), `ai_list_models`,
  `ai_run` (streaming -> emit `ai:event`), `ai_cancel`. SSRF pin + manual redirect.
- Verify: enter a key, run a study action, streaming tokens appear, cancel works.

STEP 8 - Protocol + shell + window + file associations
- `mdimg://` custom protocol with confinement. `open_external` (http/https only),
  `show_item` (reveal in explorer). Window-state plugin for bounds. File associations in
  `tauri.conf.json` + single-instance + emit `app:openPath` / `get_pending_open_path`.
- Verify: a doc with a local image shows it; double-clicking a .md opens it in the app.

STEP 9 - Export
- `export_save` (save dialog + write). For `export_docx`: simplest is to generate the docx
  blob in the renderer (the `html-to-docx` JS lib already runs there) and save via the
  dialog, OR a Rust docx crate. Pick renderer-side to avoid a Rust docx dependency.
- Verify: export HTML and DOCX land on disk.

STEP 10 - Verify, package, release
- Full pass: typecheck/lint/test (renderer tests unchanged), then `tauri:build`.
- Confirm bundle size is the expected ~4-5 MB NSIS (vs ~134 MB Electron).
- Run the app end to end against the real vault (Library, Reader paginate + oversized code
  scroll, all panels, AI, settings, slides, graph, flashcards, highlights).
- Update README + `docs/index.html` + CHANGELOG for v2.0.0 (unsigned wording, sole
  authorship, note the one-time AI-key re-entry from #3). Bump version to `2.0.0`.
- Tag `v2.0.0`, merge the Tauri branch to `main`, push, `gh release create v2.0.0` with the
  Tauri installer. main was v1.5.0; this makes Tauri v2.0.0 the new Latest.

---

## 6. The full window.api surface to port (36 methods)

Source of truth: `MdReaderApi` in `src/shared/types.ts`; current Electron impl in
`src/preload/index.ts`; handlers in `src/main/{ipc.ts,ai.ts,index.ts}`. Channel -> method:

Files/vault/folders (ipc.ts):
- library:pickFolder -> pickFolder            (dialog; adds authorized root)
- library:openVault -> openVault              (ensures Documents/MD Reader, returns path)
- folder:create -> createFolder
- library:importFiles -> importFiles
- library:importFolder -> importFolder
- project:digest -> digestProject
- library:listMarkdown -> listMarkdown        (authorized-roots gated)
- library:readAll -> readAll                  (authorized-roots gated)
- file:read -> readFile                        (isInsideRoot)
- file:write -> writeFile                      (isInsideRoot)
- file:newFile -> newFile                      (isInsideRoot + safeSeg name)
- file:trash -> trashFile                      (isInsideRoot, recycle bin)
- folder:trash -> trashFolder                  (isInsideRoot, cannot delete root itself)
- library:checkMissing -> checkMissing         (existence probe; add confinement for parity)
- course:create -> createCourse
- file:saveImage -> saveImage                  (isInsideRoot)

Settings/state/sidecars (ipc.ts + store.ts):
- settings:get / settings:set -> getSettings / setSettings   (clamp theme on load!)
- state:get / state:set -> getState / setState
- sidecar:load / sidecar:save -> sidecarLoad / sidecarSave

Shell/window/app (ipc.ts + index.ts):
- shell:openExternal -> openExternal           (http/https only)
- shell:showItem -> showItem
- app:getPendingOpenPath -> getPendingOpenPath
- (event) library:changed -> onLibraryChanged  (file watch via notify)
- (event) app:openPath -> onOpenPath           (file association / single-instance)

AI (ai.ts):
- ai:status -> aiStatus                        (boolean only, never the key)
- ai:setKey -> aiSetKey                         (keyring; refuse if unavailable)
- ai:clearKey -> aiClearKey
- ai:listModels -> aiListModels
- ai:run -> aiRun                               (stream -> ai:event)
- ai:cancel -> aiCancel
- (event) ai:event -> onAiEvent

Export (ipc.ts):
- export:save -> exportSave
- export:docx -> exportDocx                     (generate blob renderer-side, save via dialog)

---

## 7. Gotchas / decisions already made

- The asar-integrity workaround (`asar:false`) is Electron-only. N/A to Tauri. Drop it from
  any Tauri config.
- AI keys do NOT migrate from the Electron build (different secret store). One-time re-entry.
  Call this out in the v2.0.0 release notes.
- Renderer markdown/mermaid/chart/katex pipeline is 100% reused; no Rust work there.
- Keep `feat/v2-redesign` (Electron) intact as the reference build. Do NOT delete it until
  the Tauri v2.0.0 is shipped and confirmed working.
- `main` stays on v1.5.0 / Latest the entire time. Reversible until the final merge.
- Caveat to re-check tomorrow: the `6515b78` settings-import hardening commit sits at the tip
  of `feat/v2-redesign` history listing but the audit referenced it as already present -
  confirm it is actually included when syncing onto the Tauri branch (git log on the synced
  branch should show it).

---

## 8. First three actions tomorrow (quick start)

1. `git checkout experiment/tauri` and sync the 6 missing commits from `feat/v2-redesign`
   (confirm accent-off fix + store.ts clamp + this doc are present). Optionally rename to
   `feat/v2-tauri`.
2. Build the `window.api` shim (section 5, STEP 3) and get the v2 UI booting in a Tauri
   window with stubbed commands - prove the frontend is intact on the new shell.
3. Implement STEP 4 (files + `is_inside_root`) so the Library populates from the real vault.

Then continue down section 5. Verify each group in the window before the next. Commit as
Brendan Malloy, no trailers, no dashes.
