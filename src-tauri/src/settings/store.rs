use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::config;
use crate::error::Result;
use crate::utils::paths::settings_path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub ram_min_mb: u32,
    pub ram_max_mb: u32,
    pub window_width: u32,
    pub window_height: u32,
    pub fullscreen: bool,
    #[serde(default)]
    pub java_path: Option<String>,
    #[serde(default)]
    pub install_dir: Option<PathBuf>,
    #[serde(default = "default_auto_join_host")]
    pub auto_join_host: Option<String>,
    #[serde(default = "default_auto_join_port")]
    pub auto_join_port: u16,
    #[serde(default)]
    pub close_launcher_on_play: bool,
}

fn default_auto_join_host() -> Option<String> {
    Some(config::SERVER_HOST.to_string())
}
fn default_auto_join_port() -> u16 {
    config::SERVER_PORT
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            ram_min_mb: 2048,
            ram_max_mb: 4096,
            window_width: 1280,
            window_height: 720,
            fullscreen: false,
            java_path: None,
            install_dir: None,
            auto_join_host: default_auto_join_host(),
            auto_join_port: default_auto_join_port(),
            close_launcher_on_play: false,
        }
    }
}

impl Settings {
    pub fn load_or_default(app: &AppHandle) -> Result<Self> {
        let path = settings_path(app);
        if !path.exists() {
            return Ok(Self::default());
        }
        let raw = std::fs::read_to_string(&path)?;
        Ok(serde_json::from_str(&raw).unwrap_or_default())
    }

    pub fn save(&self, app: &AppHandle) -> Result<()> {
        let path = settings_path(app);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&path, serde_json::to_string_pretty(self)?)?;
        Ok(())
    }
}
