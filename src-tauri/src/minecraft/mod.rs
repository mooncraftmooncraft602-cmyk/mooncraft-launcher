//! Minecraft pipeline: vanilla assets/libs → Fabric loader → JVM spawn.

pub mod assets;
pub mod instance;
pub mod launcher;

use std::sync::Arc;

use tauri::Emitter;

use crate::auth::Account;
use crate::error::Result;
use crate::fabric;
use crate::neoforge;
use crate::java;
use crate::state::AppState;
use crate::updater;

/// Top-level orchestrator. Runs everything needed to put Minecraft on screen.
pub async fn launch(state: Arc<AppState>, account: Account) -> Result<u32> {
    // 1. Read the meta we wrote during the last update, or fetch fresh.
    let meta = match updater::manifest::read_local_meta(&state.paths.instance_dir) {
        Ok(m) => m,
        Err(_) => {
            // First launch / corrupted — run an update which writes meta.
            updater::run(state.clone()).await?;
            updater::manifest::read_local_meta(&state.paths.instance_dir)?
        }
    };

    emit(&state, "Resolving Java runtime…");
    let java_bin = java::ensure(state.clone(), meta.java).await
        .map_err(|e| crate::error::Error::Custom(format!("[Java] {}", e)))?;

    emit(&state, "Installing vanilla Minecraft…");
    let vanilla = assets::ensure(state.clone(), &meta.minecraft).await
        .map_err(|e| crate::error::Error::Custom(format!("[Assets] {}", e)))?;

    // Branch on the loader declared in the manifest (fabric | neoforge).
    let loader = meta.loader_kind();
    let loader_version = meta.loader_version();

    let plan = if loader == "neoforge" {
        emit(&state, "Installing NeoForge…");
        let nf = neoforge::install(state.clone(), &meta.minecraft, &loader_version, &java_bin).await
            .map_err(|e| crate::error::Error::Custom(format!("[NeoForge] {}", e)))?;

        emit(&state, "Building launch arguments…");
        launcher::build_plan_neoforge(&state, &account, &vanilla, &nf, &java_bin)
            .map_err(|e| crate::error::Error::Custom(format!("[Plan] {}", e)))?
    } else {
        emit(&state, "Installing Fabric loader…");
        let fabric_profile = fabric::install(state.clone(), &meta.minecraft, &loader_version).await
            .map_err(|e| crate::error::Error::Custom(format!("[Fabric] {}", e)))?;

        emit(&state, "Building launch arguments…");
        launcher::build_plan(&state, &account, &vanilla, &fabric_profile, &java_bin)
            .map_err(|e| crate::error::Error::Custom(format!("[Plan] {}", e)))?
    };

    // Force le resource pack Moon Craft actif dans options.txt avant chaque lancement.
    let _ = crate::skin::ensure_resource_pack(
        &state.paths.instance_dir,
        "MoonCraft-ResourcePack.zip",
    );

    // Anti-flou : si le bureau est sous la résolution native, force le plein écran natif
    // (sinon le moniteur agrandit le signal et tout paraît flou « mal focusé »).
    crate::display::ensure_sharp(&state.paths.instance_dir);

    emit(&state, "Launching Minecraft…");
    let pid = launcher::spawn(&state, plan).await
        .map_err(|e| crate::error::Error::Custom(format!("[Spawn] {}", e)))?;
    let _ = state.app_handle.emit(
        "game:started",
        serde_json::json!({ "pid": pid }),
    );
    Ok(pid)
}

pub fn kill(pid: u32) -> Result<()> {
    #[cfg(unix)]
    {
        use std::process::Command;
        Command::new("kill").arg(pid.to_string()).status().ok();
    }
    #[cfg(windows)]
    {
        use std::process::Command;
        Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .status()
            .ok();
    }
    Ok(())
}

fn emit(state: &AppState, message: &str) {
    #[derive(serde::Serialize, Clone)]
    struct P<'a> {
        phase: &'a str,
        message: &'a str,
    }
    let _ = state.app_handle.emit(
        "update:status",
        P {
            phase: "launch",
            message,
        },
    );
}
