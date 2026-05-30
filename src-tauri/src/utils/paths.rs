//! OS-aware path helpers.

use std::path::PathBuf;

use crate::config::APP_DISPLAY_NAME;

/// Default install directory:
/// - Windows: `%APPDATA%\MoonCraft`
/// - macOS:   `~/Library/Application Support/MoonCraft`
/// - Linux:   `~/.local/share/MoonCraft`
pub fn default_install_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(APP_DISPLAY_NAME)
}

/// Where settings.json lives — separate from install dir so reinstalls don't nuke it.
pub fn settings_path(app_handle: &tauri::AppHandle) -> PathBuf {
    use tauri::Manager;
    app_handle
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| dirs::config_dir().unwrap_or_default().join(APP_DISPLAY_NAME))
        .join("settings.json")
}

pub fn accounts_path(app_handle: &tauri::AppHandle) -> PathBuf {
    use tauri::Manager;
    app_handle
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| dirs::config_dir().unwrap_or_default().join(APP_DISPLAY_NAME))
        .join("accounts.json")
}

/// Normalize a manifest path: forbid backtracking outside the instance dir.
/// Returns `None` if the path tries to escape via `..` or absolute components.
pub fn normalize_safe(rel: &str) -> Option<PathBuf> {
    let pb = PathBuf::from(rel.replace('\\', "/"));
    if pb.is_absolute() {
        return None;
    }
    let mut out = PathBuf::new();
    for c in pb.components() {
        use std::path::Component;
        match c {
            Component::Normal(s) => out.push(s),
            Component::CurDir => continue,
            _ => return None,
        }
    }
    Some(out)
}
