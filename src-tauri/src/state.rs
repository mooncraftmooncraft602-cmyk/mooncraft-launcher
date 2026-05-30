//! Shared application state passed to every Tauri command.

use std::path::PathBuf;
use std::sync::Mutex;

use once_cell::sync::OnceCell;
use reqwest::Client;
use tauri::AppHandle;

use crate::config;
use crate::error::Result;
use crate::settings::Settings;
use crate::utils::paths;

pub struct AppState {
    pub app_handle: AppHandle,
    pub http: Client,

    /// Paths derived from OS conventions or overridden by settings.
    pub paths: Paths,

    /// User settings — guarded by Mutex to keep AppState `Send + Sync`
    /// without forcing every command into `async fn`.
    pub settings: Mutex<Settings>,

    /// PID of the currently-running Minecraft process (if any).
    pub child_pid: Mutex<Option<u32>>,
}

#[derive(Debug, Clone)]
pub struct Paths {
    /// Root install dir, e.g. `%APPDATA%/MoonCraft`.
    pub install_dir: PathBuf,
    /// Per-instance dir under install_dir, e.g. `<install>/instances/main`.
    pub instance_dir: PathBuf,
    /// `<install>/cache`.
    pub cache_dir: PathBuf,
    /// `<install>/runtime` (downloaded JVMs).
    pub runtime_dir: PathBuf,
    /// `<install>/logs`.
    pub logs_dir: PathBuf,
}

impl Paths {
    pub fn from_root(root: PathBuf) -> Self {
        let instance_dir = root.join("instances").join("main");
        let cache_dir = root.join("cache");
        let runtime_dir = root.join("runtime");
        let logs_dir = root.join("logs");
        Self {
            install_dir: root,
            instance_dir,
            cache_dir,
            runtime_dir,
            logs_dir,
        }
    }

    pub fn ensure(&self) -> Result<()> {
        for p in [
            &self.install_dir,
            &self.instance_dir,
            &self.cache_dir,
            &self.runtime_dir,
            &self.logs_dir,
            &self.instance_dir.join("mods"),
            &self.instance_dir.join("config"),
            &self.instance_dir.join("resourcepacks"),
            &self.instance_dir.join("shaderpacks"),
        ] {
            std::fs::create_dir_all(p)?;
        }
        Ok(())
    }
}

/// Process-wide singleton — handy for background tasks that don't carry State<>.
static GLOBAL: OnceCell<std::sync::Arc<AppState>> = OnceCell::new();

impl AppState {
    pub fn bootstrap(app_handle: AppHandle) -> Result<Self> {
        let http = Client::builder()
            .user_agent(config::USER_AGENT)
            .timeout(std::time::Duration::from_secs(config::HTTP_TIMEOUT_SECS))
            .https_only(true)
            .build()?;

        // Load settings or fall back to defaults.
        let settings = Settings::load_or_default(&app_handle)?;
        let root = settings
            .install_dir
            .clone()
            .unwrap_or_else(paths::default_install_dir);
        let paths = Paths::from_root(root);
        paths.ensure()?;

        Ok(Self {
            app_handle,
            http,
            paths,
            settings: Mutex::new(settings),
            child_pid: Mutex::new(None),
        })
    }

    #[allow(dead_code)] // wired in M2 when background tasks need ambient state
    pub fn register_global(self: &std::sync::Arc<Self>) {
        let _ = GLOBAL.set(self.clone());
    }

    #[allow(dead_code)]
    pub fn global() -> Option<std::sync::Arc<Self>> {
        GLOBAL.get().cloned()
    }
}
