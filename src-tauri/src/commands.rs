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

use crate::frontmatter;
use crate::paths::{is_inside, normalize, safe_seg};
use crate::state::AppState;
use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::State;
use walkdir::WalkDir;

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

// ── Stubs (implemented in later steps) ──────────────────────────────────────

#[tauri::command]
pub fn pick_folder() -> Option<String> {
    None // STEP 5 (dialog)
}

#[tauri::command]
pub fn create_folder(_name: String) -> Option<String> {
    None
}

#[tauri::command]
pub fn import_files(_subdir: String) -> u32 {
    0
}

#[tauri::command]
pub fn import_folder() -> u32 {
    0
}

#[tauri::command]
pub fn digest_project() -> Option<Value> {
    None
}

#[tauri::command]
pub fn create_course(_opts: Value) -> Option<String> {
    None
}

#[tauri::command]
pub fn save_image(_opts: Value) -> R<String> {
    Err("not implemented".into())
}

// Settings / state / sidecars - {} merges into the renderer's DEFAULT_SETTINGS / DEFAULT_STATE.
#[tauri::command]
pub fn get_settings() -> Value {
    json!({})
}

#[tauri::command]
pub fn set_settings(patch: Value) -> Value {
    patch
}

#[tauri::command]
pub fn get_state() -> Value {
    json!({})
}

#[tauri::command]
pub fn set_state(patch: Value) -> Value {
    patch
}

#[tauri::command]
pub fn sidecar_load(_folder_path: String) -> Value {
    json!({})
}

#[tauri::command]
pub fn sidecar_save(_file_path: String, _data: Value) -> R<()> {
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
