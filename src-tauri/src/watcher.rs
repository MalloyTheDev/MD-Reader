// File watcher for library changes using notify + debouncer (parity with Electron chokidar).
// Emits "library:changed" (no payload, matching the bridge in tauri-api.ts) so the renderer
// can re-list files and update UI, search index, etc.
//
// Started/restarted whenever the library root changes (via list_markdown, read_all, pick, open_vault, etc).
// Stopped by dropping the debouncer (or explicit stop).

use notify::{RecommendedWatcher, Watcher};
use notify_debouncer_full::{new_debouncer, Debouncer, FileIdMap, notify::RecursiveMode};
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub type LibraryDebouncer = Debouncer<RecommendedWatcher, FileIdMap>;

// A changed path we should ignore: any component that is a dot-entry (notably our own .mdreader
// sidecar, plus .git/.obsidian/.vscode) or node_modules. Mirrors the Electron chokidar `ignored`
// regex. Without this, ordinary reading (which writes .mdreader/data.json on every position or
// annotation save) would provoke a full library re-list and re-index on every save.
fn is_ignored_path(path: &Path) -> bool {
    path.components().any(|c| {
        let s = c.as_os_str().to_string_lossy();
        s.starts_with('.') || s == "node_modules"
    })
}

#[derive(Default)]
pub struct WatcherManager {
    watcher: Mutex<Option<LibraryDebouncer>>,
}

impl WatcherManager {
    /// Stop any active watcher (drops the debouncer which unwatches).
    pub fn stop(&self) {
        if let Ok(mut guard) = self.watcher.lock() {
            *guard = None;
        }
    }

    /// Stop previous watcher (if any) and start a new debounced recursive watcher on `root`.
    /// On any relevant FS event inside the tree, emit "library:changed" to trigger UI refresh.
    /// Debounce ~400ms to match the old Electron behavior and avoid spam.
    pub fn restart(&self, root: &Path, app: AppHandle) -> Result<(), String> {
        self.stop();

        let app_for_handler = app.clone();
        let mut debouncer = new_debouncer(
            Duration::from_millis(400),
            None,
            move |res: Result<Vec<notify_debouncer_full::DebouncedEvent>, _>| {
                if let Ok(events) = res {
                    // Only refresh when a non-ignored path changed (see is_ignored_path); this keeps
                    // the app's own .mdreader sidecar writes from provoking a re-list/re-index loop.
                    let relevant = events
                        .iter()
                        .flat_map(|e| e.paths.iter())
                        .any(|p| !is_ignored_path(p));
                    if relevant {
                        let _ = app_for_handler.emit("library:changed", ());
                    }
                }
            },
        )
        .map_err(|e| format!("failed to create debouncer: {e}"))?;

        debouncer
            .watcher()
            .watch(root, RecursiveMode::Recursive)
            .map_err(|e| format!("failed to watch root: {e}"))?;

        if let Ok(mut guard) = self.watcher.lock() {
            *guard = Some(debouncer);
        }
        Ok(())
    }
}