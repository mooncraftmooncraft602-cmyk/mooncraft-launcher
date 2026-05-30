//! Build the final JVM argv and spawn the child process.

use std::path::{Path, PathBuf};
use std::process::Stdio;

use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::auth::Account;
use crate::error::{Error, Result};
use crate::fabric::FabricProfile;
use crate::neoforge::NeoForgeProfile;
use crate::state::AppState;

use super::assets::Vanilla;
use super::instance::Layout;

pub struct LaunchPlan {
    pub java_bin: PathBuf,
    pub jvm_args: Vec<String>,
    pub classpath: Vec<PathBuf>,
    pub main_class: String,
    pub game_args: Vec<String>,
    pub game_dir: PathBuf,
}

pub fn build_plan(
    state: &AppState,
    account: &Account,
    vanilla: &Vanilla,
    fabric: &FabricProfile,
    java_bin: &Path,
) -> Result<LaunchPlan> {
    let layout = Layout::for_state(state);
    let settings = state.settings.lock().unwrap().clone();

    // ── Classpath: Fabric libs + vanilla libs + client jar ──
    let mut classpath = Vec::new();
    classpath.extend(fabric.libraries.clone());
    classpath.extend(vanilla.libraries.iter().cloned());
    classpath.push(vanilla.client_jar.clone());

    let cp_sep = if cfg!(windows) { ";" } else { ":" };
    let cp_string = classpath
        .iter()
        .map(|p| p.display().to_string())
        .collect::<Vec<_>>()
        .join(cp_sep);

    // ── JVM args ──
    let mut jvm_args = Vec::new();

    // Memory.
    jvm_args.push(format!("-Xms{}M", settings.ram_min_mb));
    jvm_args.push(format!("-Xmx{}M", settings.ram_max_mb));

    // G1 GC tuning that's standard for modern Minecraft.
    jvm_args.extend([
        "-XX:+UnlockExperimentalVMOptions",
        "-XX:+UseG1GC",
        "-XX:G1NewSizePercent=20",
        "-XX:G1ReservePercent=20",
        "-XX:MaxGCPauseMillis=50",
        "-XX:G1HeapRegionSize=32M",
        "-XX:+DisableExplicitGC",
        "-XX:+AlwaysPreTouch",
    ].iter().map(|s| s.to_string()));

    jvm_args.push(format!("-Djava.library.path={}", layout.natives.display()));
    jvm_args.push("-Dminecraft.launcher.brand=mooncraft-launcher".into());
    jvm_args.push(format!(
        "-Dminecraft.launcher.version={}",
        env!("CARGO_PKG_VERSION")
    ));

    jvm_args.push("-cp".into());
    jvm_args.push(cp_string);

    // ── Game args (template substitution) ──
    let mut game_args = Vec::new();
    let template_args = if !vanilla.game_args.is_empty() {
        vanilla.game_args.clone()
    } else {
        // Fallback minimal arg set if version JSON had none we could flatten.
        vec![
            "--username".into(), "${auth_player_name}".into(),
            "--version".into(),  "${version_name}".into(),
            "--gameDir".into(),  "${game_directory}".into(),
            "--assetsDir".into(), "${assets_root}".into(),
            "--assetIndex".into(), "${assets_index_name}".into(),
            "--uuid".into(),     "${auth_uuid}".into(),
            "--accessToken".into(), "${auth_access_token}".into(),
            "--userType".into(), "${user_type}".into(),
            "--versionType".into(), "${version_type}".into(),
        ]
    };

    let substitutions = [
        ("${auth_player_name}", account.username.clone()),
        ("${version_name}", format!("fabric-loader-{}-{}", fabric.loader_version, vanilla.version_id)),
        ("${game_directory}", layout.game_dir.display().to_string()),
        ("${assets_root}", layout.assets.display().to_string()),
        ("${assets_index_name}", vanilla.asset_index.clone()),
        ("${auth_uuid}", account.uuid.clone()),
        ("${auth_access_token}", account.access_token.clone().unwrap_or_else(|| "0".into())),
        ("${clientid}", "mooncraft".into()),
        ("${auth_xuid}", "0".into()),
        ("${user_type}", account.user_type().into()),
        ("${version_type}", "release".into()),
        ("${launcher_name}", "mooncraft-launcher".into()),
        ("${launcher_version}", env!("CARGO_PKG_VERSION").into()),
        ("${natives_directory}", layout.natives.display().to_string()),
    ];
    for arg in template_args {
        let mut replaced = arg;
        for (k, v) in &substitutions {
            replaced = replaced.replace(k, v);
        }
        game_args.push(replaced);
    }

    // Window size.
    if settings.fullscreen {
        game_args.push("--fullscreen".into());
    } else {
        game_args.push("--width".into());
        game_args.push(settings.window_width.to_string());
        game_args.push("--height".into());
        game_args.push(settings.window_height.to_string());
    }

    // Auto-join — IP is locked at compile time and cannot be overridden by players.
    // `--server` / `--port` were removed in Minecraft 1.20+ ("Completely ignored
    // arguments" in the game log). The modern entry point is
    // `--quickPlayMultiplayer <host:port>` which spawns the player directly
    // into the multiplayer connect screen, then connects.
    game_args.push("--quickPlayMultiplayer".into());
    game_args.push(format!(
        "{}:{}",
        crate::config::SERVER_HOST,
        crate::config::SERVER_PORT
    ));
    // Keep the legacy pair as a fallback for pre-1.20 worlds. Modern Minecraft
    // simply ignores them.
    game_args.push("--server".into());
    game_args.push(crate::config::SERVER_HOST.into());
    game_args.push("--port".into());
    game_args.push(crate::config::SERVER_PORT.to_string());

    Ok(LaunchPlan {
        java_bin: java_bin.to_path_buf(),
        jvm_args,
        classpath,
        main_class: fabric.main_class.clone(),
        game_args,
        game_dir: layout.game_dir,
    })
}

/// Build the launch plan for a **NeoForge** instance.
///
/// NeoForge launches through `cpw.mods.bootstraplauncher.BootstrapLauncher` and
/// needs the module-path / add-opens / `-D…` JVM args + the `--launchTarget` /
/// `--fml.*` game args that the installer wrote into the version JSON. We append
/// those (after placeholder substitution) to the standard memory/GC/classpath args.
pub fn build_plan_neoforge(
    state: &AppState,
    account: &Account,
    vanilla: &Vanilla,
    neoforge: &NeoForgeProfile,
    java_bin: &Path,
) -> Result<LaunchPlan> {
    let layout = Layout::for_state(state);
    let settings = state.settings.lock().unwrap().clone();

    // Classpath: NeoForge libs + vanilla libs + client jar (deduped by path).
    let mut classpath: Vec<PathBuf> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for p in neoforge
        .libraries
        .iter()
        .chain(vanilla.libraries.iter())
        .chain(std::iter::once(&vanilla.client_jar))
    {
        if seen.insert(p.display().to_string()) {
            classpath.push(p.clone());
        }
    }
    let cp_sep = if cfg!(windows) { ";" } else { ":" };
    let cp_string = classpath
        .iter()
        .map(|p| p.display().to_string())
        .collect::<Vec<_>>()
        .join(cp_sep);

    // Placeholder substitutions (vanilla set + NeoForge module-system extras).
    let subs: Vec<(&str, String)> = vec![
        ("${auth_player_name}", account.username.clone()),
        ("${version_name}", neoforge.version_id.clone()),
        ("${game_directory}", layout.game_dir.display().to_string()),
        ("${assets_root}", layout.assets.display().to_string()),
        ("${assets_index_name}", vanilla.asset_index.clone()),
        ("${auth_uuid}", account.uuid.clone()),
        ("${auth_access_token}", account.access_token.clone().unwrap_or_else(|| "0".into())),
        ("${clientid}", "mooncraft".into()),
        ("${auth_xuid}", "0".into()),
        ("${user_type}", account.user_type().into()),
        ("${version_type}", "release".into()),
        ("${launcher_name}", "mooncraft-launcher".into()),
        ("${launcher_version}", env!("CARGO_PKG_VERSION").into()),
        ("${natives_directory}", layout.natives.display().to_string()),
        ("${library_directory}", layout.libraries.display().to_string()),
        ("${classpath_separator}", cp_sep.to_string()),
        ("${classpath}", cp_string.clone()),
        ("${primary_jar}", vanilla.client_jar.display().to_string()),
    ];
    let subst = |arg: &str| -> String {
        let mut r = arg.to_string();
        for (k, v) in &subs {
            r = r.replace(k, v);
        }
        r
    };

    // ── JVM args ──
    let mut jvm_args = Vec::new();
    jvm_args.push(format!("-Xms{}M", settings.ram_min_mb));
    jvm_args.push(format!("-Xmx{}M", settings.ram_max_mb));
    jvm_args.extend([
        "-XX:+UnlockExperimentalVMOptions",
        "-XX:+UseG1GC",
        "-XX:G1NewSizePercent=20",
        "-XX:G1ReservePercent=20",
        "-XX:MaxGCPauseMillis=50",
        "-XX:G1HeapRegionSize=32M",
        "-XX:+DisableExplicitGC",
        "-XX:+AlwaysPreTouch",
    ].iter().map(|s| s.to_string()));
    jvm_args.push(format!("-Djava.library.path={}", layout.natives.display()));
    jvm_args.push("-Dminecraft.launcher.brand=mooncraft-launcher".into());
    jvm_args.push(format!("-Dminecraft.launcher.version={}", env!("CARGO_PKG_VERSION")));

    // NeoForge module-system JVM args (module path, add-opens, -D props…).
    for a in &neoforge.jvm_args {
        jvm_args.push(subst(a));
    }

    // Classpath last (NeoForge's args do not include -cp; vanilla normally adds it).
    jvm_args.push("-cp".into());
    jvm_args.push(cp_string.clone());

    // ── Game args ──
    let mut game_args = Vec::new();
    let van_game = if vanilla.game_args.is_empty() {
        vec![
            "--username".into(), "${auth_player_name}".into(),
            "--version".into(), "${version_name}".into(),
            "--gameDir".into(), "${game_directory}".into(),
            "--assetsDir".into(), "${assets_root}".into(),
            "--assetIndex".into(), "${assets_index_name}".into(),
            "--uuid".into(), "${auth_uuid}".into(),
            "--accessToken".into(), "${auth_access_token}".into(),
            "--userType".into(), "${user_type}".into(),
            "--versionType".into(), "${version_type}".into(),
        ]
    } else {
        vanilla.game_args.clone()
    };
    for a in van_game {
        game_args.push(subst(&a));
    }
    // NeoForge game args, verbatim from the version JSON
    // (e.g. `--launchTarget forgeclient`, `--fml.neoForgeVersion`, `--fml.mcVersion`…).
    for a in &neoforge.game_args {
        game_args.push(subst(a));
    }

    // Window size.
    if settings.fullscreen {
        game_args.push("--fullscreen".into());
    } else {
        game_args.push("--width".into());
        game_args.push(settings.window_width.to_string());
        game_args.push("--height".into());
        game_args.push(settings.window_height.to_string());
    }

    // Auto-join the locked server.
    game_args.push("--quickPlayMultiplayer".into());
    game_args.push(format!("{}:{}", crate::config::SERVER_HOST, crate::config::SERVER_PORT));

    Ok(LaunchPlan {
        java_bin: java_bin.to_path_buf(),
        jvm_args,
        classpath,
        main_class: neoforge.main_class.clone(),
        game_args,
        game_dir: layout.game_dir,
    })
}

pub async fn spawn(state: &AppState, plan: LaunchPlan) -> Result<u32> {
    let mut cmd = Command::new(&plan.java_bin);
    cmd.args(&plan.jvm_args)
        .arg(&plan.main_class)
        .args(&plan.game_args)
        .current_dir(&plan.game_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(false);

    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW — don't pop a black console. `creation_flags` is
        // re-exposed on `tokio::process::Command` on Windows targets.
        cmd.creation_flags(0x0800_0000);
    }

    tracing::info!(?plan.java_bin, "spawning minecraft");
    let mut child = cmd
        .spawn()
        .map_err(|e| Error::Launch(format!("Failed to spawn JVM: {}", e)))?;

    let pid = child.id().ok_or_else(|| Error::Launch("No PID".into()))?;

    // Pipe stdout / stderr → UI as `game:log` events.
    if let Some(stdout) = child.stdout.take() {
        spawn_log_pump(state.app_handle.clone(), stdout, "stdout");
    }
    if let Some(stderr) = child.stderr.take() {
        spawn_log_pump(state.app_handle.clone(), stderr, "stderr");
    }

    // Watcher task — emit game:stopped when the JVM exits.
    let app = state.app_handle.clone();
    tokio::spawn(async move {
        let exit = child.wait().await;
        let code = exit.as_ref().ok().and_then(|s| s.code()).unwrap_or(-1);
        let _ = app.emit(
            "game:stopped",
            serde_json::json!({ "exit_code": code }),
        );
    });

    Ok(pid)
}

fn spawn_log_pump<R>(app: tauri::AppHandle, reader: R, source: &'static str)
where
    R: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            // Drop OpenGL debug spam from buggy mods that call GL from
            // worker threads. Minecraft logs every callback at INFO level
            // which floods the journal. The raw lines are still in
            // latest.log on disk for anyone who wants to dig in.
            if line.contains("OpenGL debug message") || line.contains("[GL_DEBUG]") {
                continue;
            }

            // Magic marker emitted by our mooncraftclient mod when the
            // player has actually joined the server. Triggers the launcher
            // to reveal MC and hide its own "Connexion en cours" overlay.
            if line.contains("[mooncraft-ready]") {
                let _ = app.emit("game:joined", serde_json::json!({}));
                // We still forward the line as a normal log entry.
            }
            let level = if line.contains("ERROR") || source == "stderr" {
                "error"
            } else if line.contains("WARN") {
                "warn"
            } else {
                "info"
            };
            let _ = app.emit(
                "game:log",
                serde_json::json!({ "line": line, "level": level, "source": source }),
            );
        }
    });
}
