// Tauri command surface for MD Reader.
//
// Every method of the renderer's MdReaderApi (window.api) maps to exactly one command here.
// At STEP 3 these are stubs that return type-correct empty/default values so the v2 UI boots
// on the Tauri shell with no console errors. Real implementations land in later steps:
//   STEP 4  files + path confinement   (read_file/write_file/new_file/trash_file/list_markdown/read_all/check_missing)
//   STEP 5  vault + folders + import   (pick_folder/open_vault/create_folder/import_*/trash_folder/create_course/save_image/digest_project)
//   STEP 6  settings/state/sidecars    (get/set_settings, get/set_state, sidecar_load/save)
//   STEP 7  AI                         (ai_status/ai_set_key/ai_clear_key/ai_list_models/ai_run/ai_cancel)
//   STEP 8  shell/window/app           (open_external/show_item/get_pending_open_path)
//   STEP 9  export                     (export_save/export_docx)
//
// The boot path only calls get_settings, get_state, and get_pending_open_path; the renderer
// spreads those over DEFAULT_SETTINGS / DEFAULT_STATE, so {} / null are safe boot stubs.

use serde_json::{json, Value};

type R<T> = Result<T, String>;

// ── Files / vault / folders ────────────────────────────────────────────────
#[tauri::command]
pub fn pick_folder() -> Option<String> {
    None
}

#[tauri::command]
pub fn open_vault() -> R<String> {
    Err("not implemented".into())
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
pub fn list_markdown(_folder_path: String) -> Vec<Value> {
    Vec::new()
}

#[tauri::command]
pub fn read_all(_folder_path: String) -> Vec<Value> {
    Vec::new()
}

#[tauri::command]
pub fn read_file(_file_path: String) -> R<Value> {
    Err("not implemented".into())
}

#[tauri::command]
pub fn write_file(_file_path: String, _content: String) -> R<()> {
    Err("not implemented".into())
}

#[tauri::command]
pub fn new_file(_folder_path: String, _name: String) -> Option<String> {
    None
}

#[tauri::command]
pub fn trash_file(_file_path: String) -> Value {
    json!({ "ok": false, "error": "not implemented" })
}

#[tauri::command]
pub fn trash_folder(_folder_rel: String) -> Value {
    json!({ "ok": false, "error": "not implemented" })
}

#[tauri::command]
pub fn check_missing(_paths: Vec<String>) -> Vec<String> {
    Vec::new()
}

#[tauri::command]
pub fn create_course(_opts: Value) -> Option<String> {
    None
}

#[tauri::command]
pub fn save_image(_opts: Value) -> R<String> {
    Err("not implemented".into())
}

// ── Settings / state / sidecars ────────────────────────────────────────────
// {} merges into DEFAULT_SETTINGS / DEFAULT_STATE on the renderer side, so the app boots
// with defaults until STEP 6 wires the real config store.
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

// ── Shell / window / app ───────────────────────────────────────────────────
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

// ── AI ─────────────────────────────────────────────────────────────────────
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

// ── Export ─────────────────────────────────────────────────────────────────
#[tauri::command]
pub fn export_save(_opts: Value) -> bool {
    false
}

#[tauri::command]
pub fn export_docx(_opts: Value) -> bool {
    false
}
