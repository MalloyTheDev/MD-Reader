mod commands;
mod config;
mod digest;
mod frontmatter;
mod paths;
mod sidecar;
mod state;

use config::ConfigStore;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .manage(ConfigStore::default())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
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
