//! Tauri IPC command surface. Every `invoke()` from the React side lands here.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::auth::Account;
use crate::error::Result;
use crate::settings::Settings;
use crate::state::AppState;
use crate::updater;
use crate::{api, auth, minecraft};

#[derive(Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub install_dir: String,
    pub instance_dir: String,
    pub os: String,
}

#[tauri::command]
pub fn get_app_info(state: State<'_, Arc<AppState>>) -> AppInfo {
    AppInfo {
        name: "MoonCraft Launcher".into(),
        version: env!("CARGO_PKG_VERSION").into(),
        install_dir: state.paths.install_dir.display().to_string(),
        instance_dir: state.paths.instance_dir.display().to_string(),
        os: std::env::consts::OS.into(),
    }
}

#[tauri::command]
pub fn get_settings(state: State<'_, Arc<AppState>>) -> Settings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
pub fn save_settings(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
    new_settings: Settings,
) -> Result<Settings> {
    new_settings.save(&app)?;
    *state.settings.lock().unwrap() = new_settings.clone();
    Ok(new_settings)
}

#[tauri::command]
pub async fn pick_install_dir(app: AppHandle) -> Result<Option<String>> {
    use tauri_plugin_dialog::{DialogExt, FilePath};
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Choose MoonCraft install directory")
        .pick_folder(move |folder: Option<FilePath>| {
            // FilePath is an enum (Path | Url); we only care about the Path
            // variant for a folder picker. Convert via the PathBuf accessor
            // so behavior is consistent regardless of platform encoding.
            let s = folder.and_then(|fp| fp.into_path().ok())
                .map(|p| p.to_string_lossy().into_owned());
            let _ = tx.send(s);
        });
    Ok(rx.await.unwrap_or(None))
}

#[tauri::command]
pub async fn check_update(state: State<'_, Arc<AppState>>) -> Result<updater::UpdateCheck> {
    updater::check(state.inner().clone()).await
}

#[tauri::command]
pub async fn run_update(state: State<'_, Arc<AppState>>) -> Result<updater::UpdateReport> {
    updater::run(state.inner().clone()).await
}

#[derive(Deserialize)]
pub struct LaunchArgs {
    pub account_id: String,
}

#[tauri::command]
pub async fn launch_game(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
    args: LaunchArgs,
) -> Result<u32> {
    let account = auth::get(&app, &args.account_id)?
        .ok_or_else(|| crate::error::Error::Custom("Account not found".into()))?;
    let pid = minecraft::launch(state.inner().clone(), account).await?;
    *state.child_pid.lock().unwrap() = Some(pid);
    Ok(pid)
}

#[tauri::command]
pub fn stop_game(state: State<'_, Arc<AppState>>) -> Result<()> {
    let pid = state.child_pid.lock().unwrap().take();
    if let Some(pid) = pid {
        minecraft::kill(pid)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_news() -> Result<Vec<api::news::NewsEntry>> {
    api::news::fetch().await
}

#[tauri::command]
pub async fn get_server_status() -> Result<api::status::ServerStatus> {
    api::status::ping().await
}

#[tauri::command]
pub async fn get_server_gate(state: State<'_, Arc<AppState>>) -> Result<api::gate::ServerGate> {
    api::gate::fetch(&state.http).await
}

#[tauri::command]
pub fn list_accounts(app: AppHandle) -> Result<Vec<Account>> {
    auth::list(&app)
}

#[derive(Deserialize)]
pub struct AddOfflineArgs {
    pub username: String,
    /// Optional contact email — saved locally for the launcher only.
    #[serde(default)]
    pub email: Option<String>,
    /// Set to `false` to skip the Mojang availability check (admin / debug).
    #[serde(default = "default_true")]
    pub enforce_unique: bool,
}

fn default_true() -> bool { true }

#[tauri::command]
pub async fn add_offline_account(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
    args: AddOfflineArgs,
) -> Result<Account> {
    // Collision rule: reject any pseudo that's already claimed by a real
    // premium Minecraft account. This prevents impersonation when the
    // server later flips to online-mode.
    if args.enforce_unique {
        let availability = auth::mojang::check_username(&state.http, &args.username).await?;
        if availability.invalid_format {
            return Err(crate::error::Error::Custom(
                "Pseudo invalide. Mojang attend 3-16 caractères [A-Za-z0-9_].".into(),
            ));
        }
        if !availability.available {
            return Err(crate::error::Error::Custom(format!(
                "Le pseudo « {} » est déjà utilisé par un compte premium. Choisis-en un autre.",
                args.username
            )));
        }
    }
    auth::add(&app, Account::new_offline(args.username, args.email))
}

#[derive(Deserialize)]
pub struct CheckUsernameArgs {
    pub username: String,
}

#[tauri::command]
pub async fn check_mc_username(
    state: State<'_, Arc<AppState>>,
    args: CheckUsernameArgs,
) -> Result<auth::mojang::UsernameAvailability> {
    auth::mojang::check_username(&state.http, &args.username).await
}

#[tauri::command]
pub fn remove_account(app: AppHandle, id: String) -> Result<()> {
    auth::remove(&app, &id)
}

#[tauri::command]
pub fn set_active_account(app: AppHandle, id: String) -> Result<()> {
    auth::set_active(&app, &id)
}

#[tauri::command]
pub async fn pick_skin_file(app: AppHandle) -> Result<Option<String>> {
    use tauri_plugin_dialog::{DialogExt, FilePath};
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Choisis ton skin Minecraft")
        .add_filter("Image PNG", &["png"])
        .pick_file(move |path: Option<FilePath>| {
            let s = path
                .and_then(|fp| fp.into_path().ok())
                .map(|p| p.to_string_lossy().into_owned());
            let _ = tx.send(s);
        });
    Ok(rx.await.unwrap_or(None))
}

#[derive(Deserialize)]
pub struct ImportSkinArgs {
    pub account_id: String,
    pub source_path: String,
}

#[derive(Serialize)]
pub struct SkinImported {
    pub stored_path: String,
    /// Public URL of the uploaded skin (catbox). Null if upload failed.
    pub remote_url: Option<String>,
    /// `/skin set <url>` to paste in chat once for SkinRestorer.
    pub skin_command: Option<String>,
}

#[tauri::command]
pub async fn import_skin(
    state: State<'_, Arc<AppState>>,
    args: ImportSkinArgs,
) -> Result<SkinImported> {
    let res = crate::skin::import(
        &state.http,
        &state.paths.instance_dir,
        &args.account_id,
        std::path::Path::new(&args.source_path),
    )
    .await?;
    Ok(SkinImported {
        stored_path: res.stored_path.to_string_lossy().into_owned(),
        remote_url: res.remote_url,
        skin_command: res.skin_command,
    })
}

#[derive(Deserialize)]
pub struct AccountIdArg {
    pub account_id: String,
}

#[tauri::command]
pub fn get_skin_path(
    state: State<'_, Arc<AppState>>,
    args: AccountIdArg,
) -> Option<String> {
    crate::skin::skin_path_for(&state.paths.instance_dir, &args.account_id)
        .map(|p| p.to_string_lossy().into_owned())
}

/// Returns the imported skin as a base64-encoded PNG, suitable for an
/// `<img src="data:image/png;base64,…">` tag. `None` if not imported yet.
#[tauri::command]
pub fn get_skin_data_url(
    state: State<'_, Arc<AppState>>,
    args: AccountIdArg,
) -> Option<String> {
    let path = crate::skin::skin_path_for(&state.paths.instance_dir, &args.account_id)?;
    let bytes = std::fs::read(&path).ok()?;
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    Some(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
}

#[tauri::command]
pub fn open_install_dir(state: State<'_, Arc<AppState>>, app: AppHandle) -> Result<()> {
    use tauri_plugin_opener::OpenerExt;
    let path = state.paths.install_dir.display().to_string();
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| crate::error::Error::Custom(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub fn admin_get_config(state: State<'_, Arc<AppState>>) -> serde_json::Value {
    serde_json::json!({
        "manifest_url": crate::config::MANIFEST_URL,
        "server_host": crate::config::SERVER_HOST,
        "server_port": crate::config::SERVER_PORT,
        "version": env!("CARGO_PKG_VERSION"),
        "install_dir": state.paths.install_dir.display().to_string(),
        "instance_dir": state.paths.instance_dir.display().to_string(),
        "cache_dir": state.paths.cache_dir.display().to_string(),
    })
}

#[tauri::command]
pub async fn admin_clear_cache(state: State<'_, Arc<AppState>>) -> Result<Vec<String>> {
    let instance_dir = state.paths.instance_dir.clone();
    let cache_dir = state.paths.cache_dir.clone();
    let mut cleared = Vec::new();

    // Wipe modpack-managed directories so the next launch re-downloads everything.
    for dir in ["mods", "config", "resourcepacks", "shaderpacks", "kubejs"] {
        let path = instance_dir.join(dir);
        if path.exists() {
            tokio::fs::remove_dir_all(&path).await?;
            tokio::fs::create_dir_all(&path).await?;
            cleared.push(dir.to_string());
        }
    }

    // Drop snapshots (rollback staging area).
    let snaps = cache_dir.join("snapshots");
    if snaps.exists() {
        tokio::fs::remove_dir_all(&snaps).await?;
        cleared.push("cache/snapshots".to_string());
    }

    Ok(cleared)
}

