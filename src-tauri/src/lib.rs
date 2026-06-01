mod ai;
mod commands;
mod config;
mod digest;
mod frontmatter;
mod paths;
mod protocol;
mod sidecar;
mod state;

use ai::AiRuns;
use config::ConfigStore;
use state::AppState;
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};

const MD_EXTS: [&str; 4] = ["md", "markdown", "mdown", "mkd"];

fn is_md(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| MD_EXTS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Find a Markdown file path among CLI args (file association / `Open with`). Skips flags.
fn find_md_arg(args: &[String]) -> Option<PathBuf> {
    for a in args.iter().skip(1) {
        if a.starts_with('-') {
            continue;
        }
        let p = PathBuf::from(a);
        if is_md(&p) && p.exists() {
            return Some(paths::normalize(&p));
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // single-instance MUST be the first plugin registered (Tauri requirement). A second launch
        // (e.g. opening another .md) focuses this instance and emits the file to open.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(p) = find_md_arg(&argv) {
                let state = app.state::<AppState>();
                state.set_pending_open(&p);
                let _ = app.emit("app:openPath", p.to_string_lossy().to_string());
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .manage(AppState::default())
        .manage(ConfigStore::default())
        .manage(AiRuns::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // mdimg:// local-image protocol. Confined to the open library root with a symlink-safe
        // re-check (see protocol::confine_image_path). On Windows this is served from
        // http://mdimg.localhost (see the CSP img-src in tauri.conf.json).
        .register_uri_scheme_protocol("mdimg", |ctx, request| {
            use tauri::http::{header, Response, StatusCode};
            let app = ctx.app_handle();
            let query = request.uri().query().unwrap_or("");
            let (base, p) = protocol::parse_base_p(query);
            let root = app.state::<AppState>().library_root();
            let result = root.ok_or_else(|| "Forbidden: no library open".to_string()).and_then(
                |root| protocol::confine_image_path(&root, &base, &p),
            );
            match result.and_then(|real| {
                let ct = protocol::content_type_for(&real);
                std::fs::read(&real).map(|bytes| (bytes, ct)).map_err(|_| "Not found".to_string())
            }) {
                Ok((bytes, ct)) => Response::builder()
                    .header(header::CONTENT_TYPE, ct)
                    .body(bytes)
                    .unwrap(),
                Err(msg) => {
                    let code = if msg.contains("Not found") {
                        StatusCode::NOT_FOUND
                    } else {
                        StatusCode::FORBIDDEN
                    };
                    Response::builder().status(code).body(Vec::new()).unwrap()
                }
            }
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // Initial file-association / CLI open: record it so the renderer can fetch it via
            // get_pending_open_path on startup.
            let args: Vec<String> = std::env::args().collect();
            if let Some(p) = find_md_arg(&args) {
                app.state::<AppState>().set_pending_open(&p);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pick_folder,
            commands::open_vault,
            commands::create_folder,
            commands::import_files,
            commands::import_folder,
            commands::digest_project,
            commands::list_markdown,
            commands::read_all,
            commands::read_file,
            commands::write_file,
            commands::new_file,
            commands::trash_file,
            commands::trash_folder,
            commands::check_missing,
            commands::create_course,
            commands::save_image,
            commands::get_settings,
            commands::set_settings,
            commands::get_state,
            commands::set_state,
            commands::sidecar_load,
            commands::sidecar_save,
            commands::open_external,
            commands::show_item,
            commands::get_pending_open_path,
            commands::ai_status,
            commands::ai_set_key,
            commands::ai_clear_key,
            commands::ai_list_models,
            commands::ai_run,
            commands::ai_cancel,
            commands::export_save,
            commands::export_docx
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
