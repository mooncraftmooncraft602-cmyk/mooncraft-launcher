//! MoonCraft Launcher — Rust backend entry.
//!
//! Module map:
//! - [`config`]    : compile-time constants (manifest URL, branding)
//! - [`error`]     : unified error/result types
//! - [`state`]     : `AppState` shared across commands
//! - [`commands`]  : Tauri IPC surface (`#[tauri::command]`)
//! - [`updater`]   : manifest fetch · diff · rollback
//! - [`downloader`]: parallel HTTPS engine with resume
//! - [`minecraft`] : vanilla assets + JVM spawn
//! - [`fabric`]    : Fabric loader installer
//! - [`java`]      : JVM detection
//! - [`auth`]      : account management
//! - [`settings`]  : persisted user preferences
//! - [`api`]       : remote news + server status

pub mod api;
pub mod auth;
pub mod commands;
pub mod config;
pub mod display;
pub mod downloader;
pub mod error;
pub mod fabric;
pub mod neoforge;
pub mod java;
pub mod minecraft;
pub mod settings;
pub mod skin;
pub mod state;
pub mod updater;
pub mod utils;

use std::sync::Arc;

use tauri::Manager;
use tracing_subscriber::EnvFilter;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,mooncraft_launcher_lib=debug")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Build app state once; clone-cheap via Arc.
            let state = AppState::bootstrap(app.handle().clone())?;
            app.manage(Arc::new(state));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::get_settings,
            commands::save_settings,
            commands::pick_install_dir,
            commands::check_update,
            commands::run_update,
            commands::launch_game,
            commands::stop_game,
            commands::get_news,
            commands::get_server_status,
            commands::get_server_gate,
            commands::list_accounts,
            commands::add_offline_account,
            commands::check_mc_username,
            commands::remove_account,
            commands::set_active_account,
            commands::open_install_dir,
            commands::pick_skin_file,
            commands::import_skin,
            commands::get_skin_path,
            commands::get_skin_data_url,
            commands::admin_get_config,
            commands::admin_clear_cache,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MoonCraft Launcher");
}
