//! Runs the official NeoForge installer headlessly and parses the produced
//! version profile JSON.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Deserialize;

use crate::downloader;
use crate::downloader::DownloadJob;
use crate::error::{Error, Result};
use crate::state::AppState;

/// Resolved NeoForge profile, consumed by `minecraft::launcher::build_plan_neoforge`.
#[derive(Debug, Clone)]
pub struct NeoForgeProfile {
    /// e.g. `neoforge-21.1.77`
    pub version_id: String,
    pub main_class: String,
    /// Absolute paths to every NeoForge library on disk.
    pub libraries: Vec<PathBuf>,
    /// Raw template JVM args from the version JSON (module path, add-opens, -D…).
    pub jvm_args: Vec<String>,
    /// Raw template game args from the version JSON (--launchTarget, --fml.*…).
    pub game_args: Vec<String>,
}

// ── version JSON shape (subset we need) ──────────────────────────────────────
#[derive(Deserialize)]
struct NeoVersionJson {
    #[serde(rename = "mainClass")]
    main_class: String,
    #[serde(default)]
    libraries: Vec<NeoLib>,
    #[serde(default)]
    arguments: Option<NeoArgs>,
}
#[derive(Deserialize)]
struct NeoLib {
    name: String,
    #[serde(default)]
    downloads: Option<NeoDownloads>,
}
#[derive(Deserialize)]
struct NeoDownloads {
    #[serde(default)]
    artifact: Option<NeoArtifact>,
}
#[derive(Deserialize)]
struct NeoArtifact {
    path: String,
}
#[derive(Deserialize, Default)]
struct NeoArgs {
    #[serde(default)]
    jvm: Vec<serde_json::Value>,
    #[serde(default)]
    game: Vec<serde_json::Value>,
}

/// Install (if needed) NeoForge for `mc` at `version`, returning the launch profile.
/// `java_bin` is required because the official installer is itself a Java program.
pub async fn install(
    state: Arc<AppState>,
    _mc: &str,
    version: &str,
    java_bin: &Path,
) -> Result<NeoForgeProfile> {
    let instance = state.paths.instance_dir.clone();
    let libraries = instance.join("libraries");
    let versions = instance.join("versions");
    let nf_id = format!("neoforge-{}", version);
    let version_json_path = versions.join(&nf_id).join(format!("{}.json", nf_id));

    if !version_json_path.exists() {
        run_installer(&state, &instance, version, java_bin).await?;
    }
    if !version_json_path.exists() {
        return Err(Error::Custom(format!(
            "NeoForge install produced no profile at {:?}",
            version_json_path
        )));
    }

    // Parse the produced profile.
    let raw = tokio::fs::read_to_string(&version_json_path)
        .await
        .map_err(|e| Error::Custom(format!("read neoforge version json: {}", e)))?;
    let vj: NeoVersionJson = serde_json::from_str(&raw)
        .map_err(|e| Error::Custom(format!("parse neoforge version json: {}", e)))?;

    // Resolve library paths (installer already placed them on disk).
    let mut lib_paths = Vec::new();
    for lib in &vj.libraries {
        let rel = lib
            .downloads
            .as_ref()
            .and_then(|d| d.artifact.as_ref())
            .map(|a| a.path.clone())
            .or_else(|| maven_to_path(&lib.name));
        if let Some(rel) = rel {
            let p = libraries.join(&rel);
            if p.exists() {
                lib_paths.push(p);
            } else {
                tracing::warn!(path = %rel, "neoforge library missing after install");
            }
        }
    }

    let (jvm_args, game_args) = match vj.arguments {
        Some(a) => (string_args(&a.jvm), string_args(&a.game)),
        None => (Vec::new(), Vec::new()),
    };

    Ok(NeoForgeProfile {
        version_id: nf_id,
        main_class: vj.main_class,
        libraries: lib_paths,
        jvm_args,
        game_args,
    })
}

async fn run_installer(
    state: &AppState,
    instance: &Path,
    version: &str,
    java_bin: &Path,
) -> Result<()> {
    // The Forge/NeoForge installer reads/writes launcher_profiles.json; create a
    // minimal one if the user has never run a vanilla launcher here.
    let profiles = instance.join("launcher_profiles.json");
    if !profiles.exists() {
        tokio::fs::write(&profiles, "{\n  \"profiles\": {}\n}\n")
            .await
            .map_err(|e| Error::Custom(format!("write launcher_profiles.json: {}", e)))?;
    }

    // Download the installer jar from the NeoForge Maven.
    let installer_url = format!(
        "https://maven.neoforged.net/releases/net/neoforged/neoforge/{v}/neoforge-{v}-installer.jar",
        v = version
    );
    let installer_path = instance.join(format!("neoforge-{}-installer.jar", version));
    if !installer_path.exists() {
        let d = downloader::Downloader::new(state.http.clone(), state.app_handle.clone());
        d.run(vec![DownloadJob {
            url: installer_url,
            dest: installer_path.clone(),
            sha256: None,
            size: None,
            label: format!("neoforge/installer-{}.jar", version),
        }])
        .await?;
    }

    // Run it headlessly: `java -jar installer.jar --installClient <instance>`.
    let mut cmd = tokio::process::Command::new(java_bin);
    cmd.arg("-jar")
        .arg(&installer_path)
        .arg("--installClient")
        .arg(instance)
        .current_dir(instance);

    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW — keep the installer headless (no console flash).
        cmd.creation_flags(0x0800_0000);
    }

    let out = cmd
        .output()
        .await
        .map_err(|e| Error::Custom(format!("NeoForge installer spawn failed: {}", e)))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        return Err(Error::Custom(format!(
            "NeoForge installer failed ({}). {} {}",
            out.status,
            stdout.lines().last().unwrap_or(""),
            stderr.lines().last().unwrap_or("")
        )));
    }
    Ok(())
}

/// Keep only the plain-string entries of an `arguments` array (rule-gated
/// objects are for demo/quickplay/resolution which the launcher handles itself).
fn string_args(vals: &[serde_json::Value]) -> Vec<String> {
    vals.iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect()
}

/// `group:artifact:version[:classifier]` → relative maven path.
fn maven_to_path(coords: &str) -> Option<String> {
    let parts: Vec<&str> = coords.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let filename = match parts.get(3) {
        Some(c) => format!("{}-{}-{}.jar", artifact, version, c),
        None => format!("{}-{}.jar", artifact, version),
    };
    Some(format!("{}/{}/{}/{}", group, artifact, version, filename))
}
