// Tauri command surface for MD Reader.
//
// Every method of the renderer's MdReaderApi (window.api) maps to exactly one command here.
// File/vault commands are real (STEP 4-5); settings/state/AI/export are stubs until their step.
//
// Pattern: each side-effectful command is a thin #[tauri::command] wrapper over a pure `*_impl`
// function that takes the library root explicitly. The impls are unit-tested against
// sample-library/ (see the tests module) - the same "pure helpers, tested separately" approach
// the Electron main process uses for safe-path.ts. This lets us verify the file layer without
// driving the WebView UI.

use crate::config::ConfigStore;
use crate::frontmatter;
use crate::paths::{is_inside, normalize, safe_seg};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::State;
use tauri_plugin_dialog::DialogExt;
use walkdir::WalkDir;

// Typed opts for the structured commands. serde maps the renderer's camelCase JSON keys onto these
// snake_case fields via rename_all, so the shim can pass the same object shape it used in Electron.
#[derive(Deserialize)]
struct CourseFile {
    name: String,
    content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseOpts {
    folder_name: String,
    files: Vec<CourseFile>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveImageOpts {
    base_dir: String,
    name: String,
    data: Vec<u8>,
}

type R<T> = Result<T, String>;

const MD_EXTS: [&str; 5] = ["md", "markdown", "mdown", "mkd", "mdx"];
const SKIP_DIRS: [&str; 5] = ["node_modules", ".git", ".obsidian", ".trash", ".vscode"];

fn is_markdown(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| MD_EXTS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMeta {
    pub name: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub size: u64,
    pub mtime_ms: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub absolute_path: String,
    pub relative_path: String,
    pub name: String,
    pub content: String,
    pub title: Option<String>,
    pub author: Option<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReadResult {
    pub content: String,
    pub raw: String,
    pub base_dir: String,
    pub title: Option<String>,
    pub author: Option<String>,
}

#[derive(Serialize)]
pub struct OpResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn rel_posix(root: &Path, abs: &Path) -> String {
    abs.strip_prefix(root)
        .unwrap_or(abs)
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

// ── Pure, testable impls ────────────────────────────────────────────────────

/// Recursively collect markdown files under `root`, skipping dotfiles/dot-dirs and SKIP_DIRS.
/// Sorted by relative path (numeric-aware-ish via natural string order).
pub fn list_markdown_impl(root: &Path) -> Vec<FileMeta> {
    let mut out = Vec::new();
    let walker = WalkDir::new(root).into_iter().filter_entry(|e| {
        let name = e.file_name().to_string_lossy();
        // skip hidden entries and known noise dirs (but never skip the root itself)
        if e.depth() == 0 {
            return true;
        }
        if name.starts_with('.') {
            return false;
        }
        if e.file_type().is_dir() && SKIP_DIRS.contains(&name.as_ref()) {
            return false;
        }
        true
    });
    for entry in walker.flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let abs = entry.path();
        if !is_markdown(abs) {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let mtime_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as f64)
            .unwrap_or(0.0);
        out.push(FileMeta {
            name: abs.file_name().unwrap_or_default().to_string_lossy().to_string(),
            relative_path: rel_posix(root, abs),
            absolute_path: abs.to_string_lossy().to_string(),
            size: meta.len(),
            mtime_ms,
        });
    }
    out.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    out
}

pub fn read_all_impl(root: &Path) -> Vec<FileContent> {
    let mut out = Vec::new();
    for m in list_markdown_impl(root) {
        let Ok(raw) = std::fs::read_to_string(&m.absolute_path) else { continue };
        let fm = frontmatter::parse(&raw);
        out.push(FileContent {
            absolute_path: m.absolute_path,
            relative_path: m.relative_path,
            name: m.name,
            content: fm.content,
            title: fm.title,
            author: fm.author,
        });
    }
    out
}

/// Read one file, confined to `root`. NOTE: ![[embed]] expansion is not yet ported (tracked as a
/// follow-on); the body is returned with embeds intact, which the renderer shows literally.
pub fn read_file_impl(root: &Path, file_path: &str) -> R<ReadResult> {
    let abs = normalize(Path::new(file_path));
    if !is_inside(root, &abs) {
        return Err("Access denied: file is outside the library folder".into());
    }
    let raw = std::fs::read_to_string(&abs).map_err(|e| e.to_string())?;
    let fm = frontmatter::parse(&raw);
    let base_dir = abs.parent().unwrap_or(&abs).to_string_lossy().to_string();
    Ok(ReadResult {
        content: fm.content,
        raw,
        base_dir,
        title: fm.title,
        author: fm.author,
    })
}

pub fn write_file_impl(root: &Path, file_path: &str, content: &str) -> R<()> {
    let abs = normalize(Path::new(file_path));
    if !is_inside(root, &abs) {
        return Err("Access denied: file is outside the library folder".into());
    }
    std::fs::write(&abs, content).map_err(|e| e.to_string())
}

pub fn new_file_impl(root: &Path, folder_path: &str, name: &str) -> R<String> {
    let safe = safe_seg(name, "Untitled");
    let folder = PathBuf::from(folder_path);
    let mut target = folder.join(format!("{safe}.md"));
    let mut i = 1;
    while target.exists() {
        target = folder.join(format!("{safe} {i}.md"));
        i += 1;
    }
    let abs = normalize(&target);
    if !is_inside(root, &abs) {
        return Err("Access denied".into());
    }
    std::fs::write(&abs, format!("# {safe}\n\n")).map_err(|e| e.to_string())?;
    Ok(abs.to_string_lossy().to_string())
}

// ── Files / vault / folders ────────────────────────────────────────────────

#[tauri::command]
pub fn list_markdown(folder_path: String, state: State<'_, AppState>) -> R<Vec<FileMeta>> {
    let root = normalize(Path::new(&folder_path));
    if !state.is_authorized(&root) {
        return Err("Folder not authorized - open it with the folder picker.".into());
    }
    state.set_library_root(&root);
    Ok(list_markdown_impl(&root))
}

#[tauri::command]
pub fn read_all(folder_path: String, state: State<'_, AppState>) -> R<Vec<FileContent>> {
    let root = normalize(Path::new(&folder_path));
    if !state.is_authorized(&root) {
        return Err("Folder not authorized".into());
    }
    state.set_library_root(&root);
    Ok(read_all_impl(&root))
}

#[tauri::command]
pub fn read_file(file_path: String, state: State<'_, AppState>) -> R<ReadResult> {
    let root = state.library_root().ok_or("Access denied: no library open")?;
    read_file_impl(&root, &file_path)
}

#[tauri::command]
pub fn write_file(file_path: String, content: String, state: State<'_, AppState>) -> R<()> {
    let root = state.library_root().ok_or("Access denied: no library open")?;
    write_file_impl(&root, &file_path, &content)
}

#[tauri::command]
pub fn new_file(folder_path: String, name: String, state: State<'_, AppState>) -> Option<String> {
    let root = state.library_root()?;
    new_file_impl(&root, &folder_path, &name).ok()
}

#[tauri::command]
pub fn trash_file(file_path: String, state: State<'_, AppState>) -> OpResult {
    let abs = normalize(Path::new(&file_path));
    if !state.is_inside_root(&abs) {
        return OpResult { ok: false, error: Some("That file is outside the current library.".into()) };
    }
    if !abs.exists() {
        return OpResult { ok: false, error: Some("The file no longer exists on disk.".into()) };
    }
    match trash::delete(&abs) {
        Ok(()) => OpResult { ok: true, error: None },
        Err(e) => OpResult { ok: false, error: Some(format!("Could not move the file to the Recycle Bin: {e}")) },
    }
}

// Folder trashing is wired in STEP 5 (needs create/import alongside it); stub for now so the full
// command surface stays registered and the shim never hits a missing command.
#[tauri::command]
pub fn trash_folder(_folder_rel: String) -> OpResult {
    OpResult { ok: false, error: Some("not implemented".into()) }
}

#[tauri::command]
pub fn check_missing(paths: Vec<String>) -> Vec<String> {
    paths
        .into_iter()
        .filter(|p| !Path::new(p).exists())
        .collect()
}

// open_vault: ensure Documents/MD Reader exists, seed a welcome note on first creation, authorize
// it as a root, and make it the current library. No dialog (that is pick_folder, STEP 5).
#[tauri::command]
pub fn open_vault(state: State<'_, AppState>) -> R<String> {
    let docs = dirs::document_dir().ok_or("Could not locate the Documents folder")?;
    let dir = docs.join("MD Reader");
    let existed = dir.exists();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    if !existed {
        let welcome = dir.join("Welcome.md");
        let _ = std::fs::write(
            &welcome,
            "# Welcome to your MD Reader vault\n\nThis folder is your personal Markdown library - everything you create or import lives here, in one place.\n\n- Make collections with **New folder** (e.g. \"Coding Projects\", \"Studying\").\n- **Import** existing Markdown to bring it in.\n- Generate notes, courses, and READMEs with AI - they save here too.\n",
        );
    }
    let norm = normalize(&dir);
    state.authorize_root(&norm);
    state.set_library_root(&norm);
    Ok(norm.to_string_lossy().to_string())
}

// ── Vault / folders / import (STEP 5) ───────────────────────────────────────
// Dialog-driven commands are async and use a oneshot channel + the plugin's callback picker: the
// blocking picker would deadlock if called on the main thread, and async commands that borrow
// State<'_> must return Result, so each returns R<...>.

#[tauri::command]
pub async fn pick_folder(app: tauri::AppHandle, state: State<'_, AppState>) -> R<Option<String>> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Choose your library folder")
        .pick_folder(move |f| {
            let _ = tx.send(f);
        });
    let picked = rx.await.ok().flatten().and_then(|fp| fp.into_path().ok());
    Ok(picked.map(|p| {
        let norm = normalize(&p);
        state.authorize_root(&norm);
        state.set_library_root(&norm);
        norm.to_string_lossy().to_string()
    }))
}

#[tauri::command]
pub fn create_folder(name: String, state: State<'_, AppState>) -> Option<String> {
    let root = state.library_root()?;
    let safe = safe_seg(&name, "New Folder");
    let mut dir = root.join(&safe);
    let mut i = 1;
    while dir.exists() {
        dir = root.join(format!("{safe} {i}"));
        i += 1;
    }
    let abs = normalize(&dir);
    if !is_inside(&root, &abs) {
        return None;
    }
    std::fs::create_dir_all(&abs).ok()?;
    Some(abs.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn import_files(subdir: String, app: tauri::AppHandle, state: State<'_, AppState>) -> R<u32> {
    let Some(root) = state.library_root() else { return Ok(0) };
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Import Markdown files")
        .add_filter("Markdown", &["md", "markdown", "mdown", "mkd", "mdx"])
        .pick_files(move |f| {
            let _ = tx.send(f);
        });
    let Some(files) = rx.await.ok().flatten() else { return Ok(0) };
    // `subdir` is an existing collection's relative path chosen in the UI; the is_inside guard (not
    // safe_seg) is what prevents traversal here, so nested collection paths are preserved.
    let target = if subdir.is_empty() {
        root.clone()
    } else {
        normalize(&root.join(&subdir))
    };
    if !is_inside(&root, &target) || std::fs::create_dir_all(&target).is_err() {
        return Ok(0);
    }
    let mut count = 0u32;
    for fp in files {
        let Ok(src) = fp.into_path() else { continue };
        if !is_markdown(&src) {
            continue;
        }
        let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("Imported");
        let base = safe_seg(stem, "Imported");
        let mut dest = target.join(format!("{base}.md"));
        let mut i = 1;
        while dest.exists() {
            dest = target.join(format!("{base} {i}.md"));
            i += 1;
        }
        if !is_inside(&root, &normalize(&dest)) {
            continue;
        }
        if std::fs::copy(&src, &dest).is_ok() {
            count += 1;
        }
    }
    Ok(count)
}

#[tauri::command]
pub async fn import_folder(app: tauri::AppHandle, state: State<'_, AppState>) -> R<u32> {
    let Some(root) = state.library_root() else { return Ok(0) };
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Import a folder of Markdown")
        .pick_folder(move |f| {
            let _ = tx.send(f);
        });
    let Some(src_root) = rx.await.ok().flatten().and_then(|fp| fp.into_path().ok()) else {
        return Ok(0);
    };
    let metas = list_markdown_impl(&src_root);
    if metas.is_empty() {
        return Ok(0);
    }
    let coll_name = safe_seg(
        src_root.file_name().and_then(|n| n.to_str()).unwrap_or("Imported"),
        "Imported",
    );
    let mut coll_dir = root.join(&coll_name);
    let mut n = 1;
    while coll_dir.exists() {
        coll_dir = root.join(format!("{coll_name} {n}"));
        n += 1;
    }
    let coll_dir = normalize(&coll_dir);
    if !is_inside(&root, &coll_dir) {
        return Ok(0);
    }
    let mut count = 0u32;
    for m in metas {
        let segs: Vec<&str> = m.relative_path.split('/').collect();
        let mut dest = coll_dir.clone();
        for (idx, seg) in segs.iter().enumerate() {
            if idx == segs.len() - 1 {
                let stem = Path::new(seg).file_stem().and_then(|s| s.to_str()).unwrap_or("Imported");
                dest = dest.join(format!("{}.md", safe_seg(stem, "Imported")));
            } else {
                dest = dest.join(safe_seg(seg, "folder"));
            }
        }
        if !is_inside(&root, &normalize(&dest)) {
            continue;
        }
        if let Some(parent) = dest.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if std::fs::copy(&m.absolute_path, &dest).is_ok() {
            count += 1;
        }
    }
    Ok(count)
}

// Read a digest of a user-picked project's source (read-only) for AI README generation. The folder
// is explicitly chosen via dialog and only read, so it is intentionally NOT confined to the library
// root. Secrets are redacted in digest::build_digest before the text can reach an LLM.
#[tauri::command]
pub async fn digest_project(app: tauri::AppHandle) -> R<Option<Value>> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Choose a project folder to document")
        .pick_folder(move |f| {
            let _ = tx.send(f);
        });
    let Some(root) = rx.await.ok().flatten().and_then(|fp| fp.into_path().ok()) else {
        return Ok(None);
    };
    let (name, digest, file_count) = crate::digest::build_digest(&root);
    Ok(Some(json!({ "name": name, "digest": digest, "fileCount": file_count })))
}

// Create a course pack: a new collection of related notes written together. Returns the absolute
// path of the first file (the Overview) so the renderer can open it.
#[tauri::command]
pub fn create_course(opts: CourseOpts, state: State<'_, AppState>) -> Option<String> {
    let root = state.library_root()?;
    let safe_folder = safe_seg(&opts.folder_name, "Course");
    let mut dir = root.join(&safe_folder);
    let mut i = 1;
    while dir.exists() {
        dir = root.join(format!("{safe_folder} {i}"));
        i += 1;
    }
    let dir = normalize(&dir);
    if !is_inside(&root, &dir) {
        return None;
    }
    std::fs::create_dir_all(&dir).ok()?;
    let mut first: Option<String> = None;
    for f in opts.files {
        let safe_name = safe_seg(&f.name, "Untitled");
        let target = normalize(&dir.join(format!("{safe_name}.md")));
        if !is_inside(&root, &target) {
            continue;
        }
        if std::fs::write(&target, &f.content).is_ok() && first.is_none() {
            first = Some(target.to_string_lossy().to_string());
        }
    }
    first
}

// Save a pasted/dropped image into an `assets` folder next to the document. Returns the relative
// href to embed (e.g. "assets/pasted-123.png").
#[tauri::command]
pub fn save_image(opts: SaveImageOpts, state: State<'_, AppState>) -> R<String> {
    let root = state.library_root().ok_or("Access denied: no library open")?;
    let base_abs = normalize(Path::new(&opts.base_dir));
    if !is_inside(&root, &base_abs) {
        return Err("Access denied: target is outside the library folder".into());
    }
    let assets_dir = base_abs.join("assets");
    let raw_name: String = opts.name.chars().filter(|c| !"\\/:*?\"<>|".contains(*c)).collect();
    let raw_name = raw_name.trim();
    let ext_lower = Path::new(raw_name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e.to_ascii_lowercase()))
        .unwrap_or_default();
    let ext = if [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".avif"].contains(&ext_lower.as_str()) {
        ext_lower
    } else {
        ".png".to_string()
    };
    let stem_src = Path::new(raw_name).file_stem().and_then(|s| s.to_str()).unwrap_or("image");
    let stem: String = safe_seg(stem_src, "image").replace(' ', "-").chars().take(60).collect();
    let mut target = assets_dir.join(format!("{stem}{ext}"));
    let mut i = 1;
    while target.exists() {
        target = assets_dir.join(format!("{stem}-{i}{ext}"));
        i += 1;
    }
    let target = normalize(&target);
    if !is_inside(&root, &target) {
        return Err("Access denied".into());
    }
    std::fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;
    std::fs::write(&target, &opts.data).map_err(|e| e.to_string())?;
    Ok(format!("assets/{}", target.file_name().unwrap_or_default().to_string_lossy()))
}

// ── Settings / state / sidecars (STEP 6) ────────────────────────────────────
// get_settings/get_state return COMPLETE objects (defaults merged with persisted) because the
// renderer assigns the result directly into React state; set_* shallow-merge a patch and persist.

#[tauri::command]
pub fn get_settings(config: State<'_, ConfigStore>) -> Value {
    config.get_settings()
}

#[tauri::command]
pub fn set_settings(patch: Value, config: State<'_, ConfigStore>) -> Value {
    config.set_settings(&patch)
}

#[tauri::command]
pub fn get_state(config: State<'_, ConfigStore>) -> Value {
    config.get_state()
}

#[tauri::command]
pub fn set_state(patch: Value, config: State<'_, ConfigStore>) -> Value {
    config.set_state(&patch)
}

// Sidecar notes live in the library's own .mdreader/data.json. load is keyed to the open library
// root; save confines to it. Both no-op safely when no library is open.
#[tauri::command]
pub fn sidecar_load(_folder_path: String, state: State<'_, AppState>) -> Value {
    match state.library_root() {
        Some(root) => crate::sidecar::load(&root),
        None => json!({}),
    }
}

#[tauri::command]
pub fn sidecar_save(file_path: String, data: Value, state: State<'_, AppState>) -> R<()> {
    if let Some(root) = state.library_root() {
        crate::sidecar::save(&root, &file_path, &data);
    }
    Ok(())
}

#[tauri::command]
pub fn open_external(_url: String) -> R<()> {
    Err("not implemented".into())
}

#[tauri::command]
pub fn show_item(_base: String, _p: String) -> bool {
    false
}

#[tauri::command]
pub fn get_pending_open_path() -> Option<String> {
    None
}

#[tauri::command]
pub fn ai_status(_provider: String) -> Value {
    json!({ "available": false, "configured": false })
}

#[tauri::command]
pub fn ai_set_key(_provider: String, _key: String) -> bool {
    false
}

#[tauri::command]
pub fn ai_clear_key(_provider: String) {}

#[tauri::command]
pub fn ai_list_models(_provider: String, _base_url: Option<String>, _refresh: Option<bool>) -> Vec<String> {
    Vec::new()
}

#[tauri::command]
pub fn ai_run(_request: Value) -> R<()> {
    Err("not implemented".into())
}

#[tauri::command]
pub fn ai_cancel(_run_id: String) {}

#[tauri::command]
pub fn export_save(_opts: Value) -> bool {
    false
}

#[tauri::command]
pub fn export_docx(_opts: Value) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    // Resolve the repo's sample-library/demos relative to this crate (src-tauri/).
    fn sample_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("sample-library")
            .join("demos")
    }

    #[test]
    fn lists_sample_markdown_files() {
        let dir = sample_dir();
        assert!(dir.exists(), "sample-library/demos should exist for this test");
        let files = list_markdown_impl(&dir);
        assert!(files.len() >= 5, "expected several demo md files, got {}", files.len());
        // every entry is markdown, has a posix relative path, and a nonzero size
        for f in &files {
            assert!(f.name.to_lowercase().ends_with(".md"));
            assert!(!f.relative_path.contains('\\'));
            assert!(f.size > 0);
        }
        // skip-dirs are honored: nothing from a .mdreader/.git dir leaks in
        assert!(files.iter().all(|f| !f.relative_path.contains(".mdreader")));
    }

    #[test]
    fn reads_a_file_confined_to_root() {
        let dir = sample_dir();
        let files = list_markdown_impl(&dir);
        let first = &files[0];
        let res = read_file_impl(&dir, &first.absolute_path).expect("should read");
        assert!(!res.raw.is_empty());
        assert_eq!(res.base_dir.replace('\\', "/"), dir.to_string_lossy().replace('\\', "/"));
    }

    #[test]
    fn read_file_rejects_escape() {
        let dir = sample_dir();
        let outside = dir.join("..").join("..").join("Cargo.toml");
        let err = read_file_impl(&dir, &outside.to_string_lossy()).unwrap_err();
        assert!(err.contains("Access denied"));
    }

    #[test]
    fn write_then_read_roundtrip() {
        let dir = std::env::temp_dir().join("mdreader-test-vault");
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("note.md");
        write_file_impl(&dir, &target.to_string_lossy(), "# hi\n\nbody").unwrap();
        let res = read_file_impl(&dir, &target.to_string_lossy()).unwrap();
        assert_eq!(res.content, "# hi\n\nbody");
        let _ = std::fs::remove_file(&target);
    }

    #[test]
    fn write_rejects_escape() {
        let dir = std::env::temp_dir().join("mdreader-test-vault");
        std::fs::create_dir_all(&dir).unwrap();
        let outside = dir.join("..").join("evil.md");
        let err = write_file_impl(&dir, &outside.to_string_lossy(), "x").unwrap_err();
        assert!(err.contains("Access denied"));
    }
}
