# Security

MD Reader is built to be safe to point at any folder of Markdown - including files you didn't
write - and to keep your notes and credentials private. This document explains the security model
and how to report a vulnerability.

> **Privacy in one line:** MD Reader works fully offline. Nothing leaves your machine unless _you_
> enable AI features with your own key, and even then only the request you trigger is sent to the
> provider you chose.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Instead, report privately via
[GitHub Security Advisories](https://github.com/MalloyTheDev/MD-Reader/security/advisories/new).
Include steps to reproduce and the version. You'll get an acknowledgement, and fixes for confirmed
issues are prioritized and noted in the [CHANGELOG](CHANGELOG.md).

## Electron process hardening

The renderer (the UI) is treated as untrusted and cannot touch the system directly.

- **`contextIsolation: true`** and **`nodeIntegration: false`** - the renderer has no `require`,
  no Node globals, and no direct filesystem access.
- All privileged operations (file read/write, dialogs, shell, trash) live in the **main process**
  and are exposed through a **typed `contextBridge` API** (`window.api`) with a fixed, audited
  surface - the renderer can only call those specific functions.
- The app does not load remote URLs as application windows; the UI is local bundled content.

## Filesystem sandboxing (library-root confinement)

File access is confined to the **library root** you opened (a folder you explicitly chose via the
picker, a file association, or the managed vault):

- Every path that crosses the IPC boundary is checked with **`isInside(root, path)`**
  (`src/main/safe-path.ts`) - it rejects `..` traversal and absolute paths that escape the root.
- The set of roots is an **explicit allow-list** (`authorizedRoots`): the renderer cannot silently
  widen the root to somewhere else on disk.
- User/AI-supplied file and folder names are run through **`safeSeg`**, which strips path
  separators, control characters, and Windows-illegal characters; neutralizes `..`; and avoids
  reserved device names (`con`, `nul`, `lpt1`, …) - so a "name" can never become a sub-path or
  escape the folder.
- The `mdimg://` image protocol additionally **realpath-checks** the resolved file before serving
  bytes, defending against symlinks that point outside the root (note that `isInside` itself is a
  fast _lexical_ check and does not resolve symlinks).

These guards are unit-tested in `src/main/safe-path.test.ts` (path traversal, escape attempts,
delete-outside-root, name sanitization).

## Deletion behavior

Destructive actions are explicit and recoverable:

- **Remove from Library** only hides a file from the app (and is undoable) - the file stays on disk.
- **Delete file / folder** moves the item to the **OS Recycle Bin** (`shell.trashItem`) - never an
  irreversible `unlink`. A confirmation dialog shows the full path first.

## Rendering untrusted Markdown

Opened documents can contain anything, so rendering is locked down:

- **No raw HTML execution** - the Markdown pipeline does not use `rehype-raw`; embedded HTML is
  rendered as inert, escaped text. Link URLs are passed through a transform that strips
  `javascript:` and other dangerous schemes.
- **Remote images are blocked by default** (opt-in in settings) to prevent tracking pixels and
  IP-leaking requests from documents you open.
- **Mermaid** diagrams render with `securityLevel: 'strict'`, and the produced SVG is additionally
  **sanitized** (`sanitizeSvg`) to remove `<script>`, event handlers, and dangerous `href`s - in
  both the in-app reader and the HTML/Word export path.
- **Charts** (` ```chart ` blocks) execute **no code**: they parse a static key/value or JSON spec
  and render pure React SVG. Input size is capped to avoid denial-of-service from a pathological
  document, and parsing is linear-time (no ReDoS).
- Parsing of document features (wiki-links, math, tables) uses linear regexes; adversarial inputs
  (e.g. a huge `[[[[…` run or a multi-MB file) are covered by tests in
  `src/renderer/src/lib/robustness.test.ts` and `docinfo.test.ts`.

## AI key storage and provider boundary

AI features are **optional** and require _your_ API key.

- Keys are stored **encrypted at rest** using the OS keychain via Electron **`safeStorage`** - never
  written in plaintext, and never committed or logged.
- The provider base URL is resolved by **`resolveBaseUrl`** (`src/shared/ai-endpoints.ts`):
  - The **OpenAI** key is **pinned to `api.openai.com`** - any renderer-supplied base URL is ignored
    (an SSRF guard so the key can't be redirected to an attacker endpoint). Use the **custom**
    provider for OpenAI-compatible proxies.
  - **Ollama** defaults to `localhost`; **custom** uses the URL you provide.
- Source-code digests sent to the AI (README generation) **skip likely-secret files** and **redact**
  obvious secrets (private keys, API tokens, AWS keys) before sending.

This boundary is unit-tested in `src/shared/ai-endpoints.test.ts`.

## Installer signing

The published Windows installer is currently **not code-signed** (see "Windows install notes" in the
[README](README.md#windows-install-notes)). Windows SmartScreen will show an "unknown publisher"
prompt. The build is wired for signing (`SIGNING.md`) but ships unsigned until a certificate is in
place - the wording here and in the README is deliberately accurate about this.
