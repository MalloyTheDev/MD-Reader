// Per-library notes sidecar - the Rust port of src/main/sidecar.ts. Annotations, bookmarks and
// reading positions live in the library's own .mdreader/data.json (keyed by POSIX-relative path)
// so they travel with the folder. Unlike the Electron version there is no migrate-from-central-
// config path: the Tauri build is a fresh store with no prior central annotations to import.
//
// load returns the map re-keyed to ABSOLUTE paths (what the renderer holds); save writes one file's
// entry, dropping empties. Confined to the library root via is_inside. Values are passed through as
// opaque JSON (FileSidecar shape) since only the renderer interprets them.

use crate::paths::{is_inside, normalize};
use serde_json::{json, Map, Value};
use std::path::Path;

const SIDECAR_DIR: &str = ".mdreader";
const SIDECAR_FILE: &str = "data.json";

fn sidecar_path(root: &Path) -> std::path::PathBuf {
    root.join(SIDECAR_DIR).join(SIDECAR_FILE)
}

fn rel_posix(root: &Path, abs: &Path) -> String {
    abs.strip_prefix(root)
        .unwrap_or(abs)
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

/// Read the `files` map (rel-path -> entry) from disk, or an empty map if absent/corrupt.
fn read_files(root: &Path) -> Map<String, Value> {
    let parsed: Option<Value> = std::fs::read_to_string(sidecar_path(root))
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok());
    if let Some(Value::Object(obj)) = parsed {
        if let Some(Value::Object(files)) = obj.get("files") {
            return files.clone();
        }
    }
    Map::new()
}

fn write_files(root: &Path, files: &Map<String, Value>) {
    let dir = root.join(SIDECAR_DIR);
    if std::fs::create_dir_all(&dir).is_err() {
        return; // read-only volume; notes still live in the renderer this session
    }
    let mut shape = Map::new();
    shape.insert("version".into(), json!(1));
    shape.insert("files".into(), Value::Object(files.clone()));
    if let Ok(text) = serde_json::to_string_pretty(&Value::Object(shape)) {
        let _ = std::fs::write(sidecar_path(root), text);
    }
}

/// Load all per-file notes for a library, re-keyed to absolute paths for the renderer.
pub fn load(root: &Path) -> Value {
    let files = read_files(root);
    let mut out = Map::new();
    for (rel, data) in files {
        let abs = root.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
        out.insert(abs.to_string_lossy().to_string(), data);
    }
    Value::Object(out)
}

/// Persist one file's notes (annotations / bookmarks / position), dropping empty entries.
pub fn save(root: &Path, file_path: &str, data: &Value) {
    let abs = normalize(Path::new(file_path));
    if !is_inside(root, &abs) {
        return;
    }
    let key = rel_posix(root, &abs);
    let mut files = read_files(root);

    // Keep only the non-empty known fields, matching saveSidecarFile's filtering.
    let mut entry = Map::new();
    if let Some(obj) = data.as_object() {
        if let Some(a) = obj.get("annotations") {
            if a.as_array().map(|x| !x.is_empty()).unwrap_or(false) {
                entry.insert("annotations".into(), a.clone());
            }
        }
        if let Some(b) = obj.get("bookmarks") {
            if b.as_array().map(|x| !x.is_empty()).unwrap_or(false) {
                entry.insert("bookmarks".into(), b.clone());
            }
        }
        if let Some(p) = obj.get("position") {
            if !p.is_null() {
                entry.insert("position".into(), p.clone());
            }
        }
    }

    if entry.is_empty() {
        files.remove(&key);
    } else {
        files.insert(key, Value::Object(entry));
    }
    write_files(root, &files);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_root(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("mdreader-sidecar-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn save_then_load_roundtrip() {
        let root = tmp_root("roundtrip");
        let file = root.join("note.md");
        std::fs::write(&file, "x").unwrap();
        let data = json!({
            "annotations": [{ "id": "a1", "start": 0, "end": 3, "color": "yellow", "text": "hi", "createdAt": 1 }],
            "position": { "page": 2, "anchorId": null }
        });
        save(&root, &file.to_string_lossy(), &data);

        let loaded = load(&root);
        let obj = loaded.as_object().unwrap();
        let abs_key = file.to_string_lossy().to_string();
        assert!(obj.contains_key(&abs_key), "loaded map should key by absolute path");
        assert_eq!(obj[&abs_key]["position"]["page"], 2);
    }

    #[test]
    fn empty_entry_is_removed() {
        let root = tmp_root("empty");
        let file = root.join("n.md");
        std::fs::write(&file, "x").unwrap();
        save(&root, &file.to_string_lossy(), &json!({ "annotations": [{ "id": "a" }] }));
        // now overwrite with all-empty -> entry should be dropped
        save(&root, &file.to_string_lossy(), &json!({ "annotations": [], "position": null }));
        let loaded = load(&root);
        assert!(loaded.as_object().unwrap().is_empty());
    }

    #[test]
    fn save_rejects_escape() {
        let root = tmp_root("escape");
        let outside = root.join("..").join("evil.md");
        save(&root, &outside.to_string_lossy(), &json!({ "position": { "page": 1 } }));
        // nothing written -> no sidecar dir created with that entry
        let loaded = load(&root);
        assert!(loaded.as_object().unwrap().is_empty());
    }
}
