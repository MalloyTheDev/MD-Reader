// Persistent settings + state store - the Rust port of src/main/store.ts. Holds the app's
// AppSettings, PersistedState, and window bounds in a single config.json under the OS app-config
// dir, written debounced-free (synchronously, the volume is tiny). AI keys do NOT live here (they
// go in the OS keyring in STEP 7), unlike the Electron store.
//
// CRITICAL contract: the renderer calls setSettings(getSettings()) directly, so get_settings MUST
// return a COMPLETE AppSettings. We therefore merge persisted settings over the full DEFAULT_*
// objects on load (mirroring `{...DEFAULT_SETTINGS, ...parsed.settings}` in store.ts) and clamp any
// legacy theme ('sepia'/'nord'/'contrast' from a v1.5 install) back to the default - the same fix
// that landed in store.ts (commit f986abe).

use serde_json::{json, Map, Value};
use std::path::PathBuf;
use std::sync::Mutex;

const APP_DIR: &str = "com.malloythedev.mdreader";
const THEME_NAMES: [&str; 2] = ["light", "dark"];

// Mirror of DEFAULT_SETTINGS in src/shared/types.ts. Keep in sync when the settings shape changes.
fn default_settings() -> Value {
    json!({
        "theme": "light",
        "fontSizePx": 19,
        "readingWidthCh": 72,
        "lineHeight": 1.7,
        "twoPage": true,
        "aiProvider": "anthropic",
        "aiModel": "claude-opus-4-7",
        "aiBaseUrl": "",
        "allowRemoteImages": false,
        "fontFamily": "serif",
        "accent": "",
        "accentEnabled": true,
        "pageAnimation": "fast",
        "focusRuler": false,
        "rulerOpacity": 14,
        "rulerHeight": 38,
        "fontWeight": 400,
        "letterSpacing": 0,
        "paragraphSpacing": 100,
        "margins": 100,
        "uiDensity": "comfortable",
        "justify": false,
        "autosave": false,
        "aiSummaryOnOpen": false
    })
}

// Mirror of DEFAULT_STATE in src/shared/types.ts.
fn default_state() -> Value {
    json!({
        "lastFolder": null,
        "lastFile": null,
        "positions": {},
        "bookmarks": {},
        "annotations": {},
        "aiChats": {},
        "favorites": [],
        "hidden": [],
        "recentFolders": []
    })
}

/// Shallow-merge `patch`'s top-level keys into `base` (patch wins), matching the JS spread
/// `{...base, ...patch}` used by store.ts setSettings/setState.
fn shallow_merge(base: &mut Value, patch: &Value) {
    if let (Some(b), Some(p)) = (base.as_object_mut(), patch.as_object()) {
        for (k, v) in p {
            b.insert(k.clone(), v.clone());
        }
    }
}

fn clamp_theme(settings: &mut Value) {
    if let Some(obj) = settings.as_object_mut() {
        let bad = obj
            .get("theme")
            .and_then(|t| t.as_str())
            .map(|t| !THEME_NAMES.contains(&t))
            .unwrap_or(true);
        if bad {
            obj.insert("theme".into(), json!("light"));
        }
    }
}

struct Data {
    settings: Value,
    state: Value,
    window: Option<Value>,
}

#[derive(Default)]
pub struct ConfigStore {
    data: Mutex<Option<Data>>,
}

impl ConfigStore {
    fn config_path() -> Option<PathBuf> {
        dirs::config_dir().map(|d| d.join(APP_DIR).join("config.json"))
    }

    /// Load config.json once, merging persisted values over the defaults and clamping the theme.
    /// A missing/corrupt file yields the defaults (same as store.ts's try/catch).
    fn ensure_loaded(&self) {
        let mut guard = self.data.lock().unwrap();
        if guard.is_some() {
            return;
        }
        let parsed: Option<Value> = Self::config_path()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|raw| serde_json::from_str(&raw).ok());

        let mut settings = default_settings();
        let mut state = default_state();
        let mut window = None;
        if let Some(Value::Object(root)) = parsed {
            if let Some(s) = root.get("settings") {
                shallow_merge(&mut settings, s);
            }
            if let Some(st) = root.get("state") {
                shallow_merge(&mut state, st);
            }
            window = root.get("window").filter(|w| !w.is_null()).cloned();
        }
        clamp_theme(&mut settings);
        *guard = Some(Data { settings, state, window });
    }

    fn persist(data: &Data) {
        let Some(path) = Self::config_path() else { return };
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let mut root = Map::new();
        root.insert("settings".into(), data.settings.clone());
        root.insert("state".into(), data.state.clone());
        root.insert("window".into(), data.window.clone().unwrap_or(Value::Null));
        if let Ok(text) = serde_json::to_string_pretty(&Value::Object(root)) {
            let _ = std::fs::write(path, text);
        }
    }

    pub fn get_settings(&self) -> Value {
        self.ensure_loaded();
        self.data.lock().unwrap().as_ref().unwrap().settings.clone()
    }

    pub fn set_settings(&self, patch: &Value) -> Value {
        self.ensure_loaded();
        let mut guard = self.data.lock().unwrap();
        let data = guard.as_mut().unwrap();
        shallow_merge(&mut data.settings, patch);
        clamp_theme(&mut data.settings);
        Self::persist(data);
        data.settings.clone()
    }

    pub fn get_state(&self) -> Value {
        self.ensure_loaded();
        self.data.lock().unwrap().as_ref().unwrap().state.clone()
    }

    pub fn set_state(&self, patch: &Value) -> Value {
        self.ensure_loaded();
        let mut guard = self.data.lock().unwrap();
        let data = guard.as_mut().unwrap();
        shallow_merge(&mut data.state, patch);
        Self::persist(data);
        data.state.clone()
    }

    // Window bounds persistence is wired in STEP 8 (window-state); kept here so config.json carries
    // the same {settings, state, window} shape store.ts wrote.
    #[allow(dead_code)]
    pub fn get_window(&self) -> Option<Value> {
        self.ensure_loaded();
        self.data.lock().unwrap().as_ref().unwrap().window.clone()
    }

    #[allow(dead_code)]
    pub fn set_window(&self, bounds: Value) {
        self.ensure_loaded();
        let mut guard = self.data.lock().unwrap();
        let data = guard.as_mut().unwrap();
        data.window = Some(bounds);
        Self::persist(data);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_complete() {
        let s = default_settings();
        // a representative spread of the 24 keys the renderer reads
        for key in ["theme", "fontSizePx", "twoPage", "aiModel", "accentEnabled", "uiDensity"] {
            assert!(s.get(key).is_some(), "default settings missing {key}");
        }
        assert_eq!(s.get("theme").unwrap(), "light");
    }

    #[test]
    fn shallow_merge_overrides_only_given_keys() {
        let mut base = default_settings();
        shallow_merge(&mut base, &json!({ "theme": "dark", "fontSizePx": 22 }));
        assert_eq!(base["theme"], "dark");
        assert_eq!(base["fontSizePx"], 22);
        // untouched keys keep their defaults
        assert_eq!(base["twoPage"], true);
        assert_eq!(base["aiModel"], "claude-opus-4-7");
    }

    #[test]
    fn clamps_legacy_theme_to_default() {
        let mut s = json!({ "theme": "sepia" });
        clamp_theme(&mut s);
        assert_eq!(s["theme"], "light");
        let mut s2 = json!({ "theme": "nord" });
        clamp_theme(&mut s2);
        assert_eq!(s2["theme"], "light");
        // valid themes are preserved
        let mut s3 = json!({ "theme": "dark" });
        clamp_theme(&mut s3);
        assert_eq!(s3["theme"], "dark");
    }

    #[test]
    fn default_state_has_collections() {
        let st = default_state();
        assert!(st["positions"].is_object());
        assert!(st["favorites"].is_array());
        assert!(st["recentFolders"].is_array());
        assert!(st["lastFolder"].is_null());
    }
}
