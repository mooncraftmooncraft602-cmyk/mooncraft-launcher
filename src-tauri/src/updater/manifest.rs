//! Remote modpack manifest.
//!
//! Schema:
//! ```json
//! {
//!   "version": "1.0.0",
//!   "minecraft": "1.21.1",
//!   "fabric": "0.16.5",
//!   "java": 21,
//!   "changelog": "Welcome to MoonCraft 1.0!\n- foo\n- bar",
//!   "files": [
//!     {
//!       "path": "mods/mooncore.jar",
//!       "url": "https://example.com/mods/mooncore.jar",
//!       "sha256": "abc123…",
//!       "size": 123456
//!     }
//!   ]
//! }
//! ```

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::config;
use crate::error::{Error, Result};
use crate::utils::paths::normalize_safe;

const VERSION_FILE: &str = ".mooncraft-version";
const META_FILE: &str = ".mooncraft-meta.json";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Manifest {
    pub version: String,
    pub minecraft: String,
    /// Loader kind: `"fabric"` (default) or `"neoforge"`.
    #[serde(default)]
    pub loader: Option<String>,
    /// Fabric loader version (when `loader == "fabric"`).
    #[serde(default)]
    pub fabric: Option<String>,
    /// NeoForge version (when `loader == "neoforge"`).
    #[serde(default)]
    pub neoforge: Option<String>,
    #[serde(default = "default_java")]
    pub java: u8,
    #[serde(default)]
    pub changelog: Option<String>,
    pub files: Vec<ManifestFile>,
}

impl Manifest {
    /// Normalised loader kind, inferred from `loader`/`neoforge`/`fabric`.
    pub fn loader_kind(&self) -> String {
        if let Some(l) = &self.loader {
            return l.to_lowercase();
        }
        if self.neoforge.is_some() {
            return "neoforge".into();
        }
        "fabric".into()
    }

    /// Version string for the active loader.
    pub fn loader_version(&self) -> String {
        match self.loader_kind().as_str() {
            "neoforge" => self.neoforge.clone().unwrap_or_default(),
            _ => self.fabric.clone().unwrap_or_default(),
        }
    }
}

fn default_java() -> u8 {
    21
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ManifestFile {
    pub path: String,
    pub url: String,
    pub sha256: String,
    pub size: u64,

    /// Filled by `validate_and_normalize` — not in the wire format.
    #[serde(skip)]
    pub normalized_path: PathBuf,
}

/// Fetch + validate the manifest from `config::MANIFEST_URL`.
pub async fn fetch(http: &reqwest::Client) -> Result<Manifest> {
    if !config::MANIFEST_URL.starts_with("https://") {
        return Err(Error::InsecureManifest(config::MANIFEST_URL.into()));
    }

    // Append a millisecond-resolution cache-buster + send `no-cache` so we
    // never get a stale redirect from the GitHub Releases /latest/ edge.
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let url = if config::MANIFEST_URL.contains('?') {
        format!("{}&_={}", config::MANIFEST_URL, ts)
    } else {
        format!("{}?_={}", config::MANIFEST_URL, ts)
    };
    let res = http
        .get(&url)
        .header("Cache-Control", "no-cache")
        .header("Pragma", "no-cache")
        .send()
        .await
        .map_err(|e| Error::Custom(format!("Impossible de joindre le serveur de mise à jour. Vérifie ta connexion. ({})", e)))?
        .error_for_status()
        .map_err(|e| {
            let status = e.status().map(|s| s.as_u16()).unwrap_or(0);
            if status == 404 {
                Error::Custom("Aucun modpack publié pour l'instant. L'administrateur doit publier une release GitHub d'abord.".into())
            } else {
                Error::Custom(format!("Erreur serveur {}. Réessaie plus tard.", status))
            }
        })?;

    let body = res.text().await
        .map_err(|e| Error::Custom(format!("Erreur de lecture du manifest: {}", e)))?;
    let raw: serde_json::Value = serde_json::from_str(&body)
        .map_err(|_| Error::Custom("Le manifest n'est pas un fichier JSON valide. Vérifie le contenu de ta release GitHub.".into()))?;
    let mut manifest: Manifest = serde_json::from_value(raw)
        .map_err(|e| Error::Custom(format!("Structure du manifest invalide: {}. Utilise tools/publish.ps1 pour générer un manifest correct.", e)))?;

    // Validate every URL is HTTPS and every path is safe.
    for f in manifest.files.iter_mut() {
        if !f.url.starts_with("https://") {
            return Err(Error::InsecureManifest(f.url.clone()));
        }
        if f.sha256.len() != 64 {
            return Err(Error::Custom(format!(
                "Bad SHA-256 for {}: expected 64 hex chars",
                f.path
            )));
        }
        f.normalized_path = normalize_safe(&f.path)
            .ok_or_else(|| Error::Custom(format!("Unsafe path in manifest: {}", f.path)))?;
    }

    Ok(manifest)
}

pub fn read_local_version(instance_dir: &Path) -> std::io::Result<String> {
    std::fs::read_to_string(instance_dir.join(VERSION_FILE))
        .map(|s| s.trim().to_string())
}

pub fn write_local_version(instance_dir: &Path, version: &str) -> Result<()> {
    std::fs::write(instance_dir.join(VERSION_FILE), version)?;
    Ok(())
}

/// Persist the minecraft/fabric/java triple so the launch path doesn't need
/// to re-fetch the manifest if the user goes straight to Play after restart.
pub fn write_local_meta(instance_dir: &Path, manifest: &Manifest) -> Result<()> {
    #[derive(Serialize)]
    struct Meta<'a> {
        version: &'a str,
        minecraft: &'a str,
        loader: String,
        loader_version: String,
        /// Legacy field kept for backward compatibility with older launcher reads.
        fabric: String,
        java: u8,
    }
    let meta = Meta {
        version: &manifest.version,
        minecraft: &manifest.minecraft,
        loader: manifest.loader_kind(),
        loader_version: manifest.loader_version(),
        fabric: manifest.loader_version(),
        java: manifest.java,
    };
    let json = serde_json::to_string_pretty(&meta)?;
    std::fs::write(instance_dir.join(META_FILE), json)?;
    Ok(())
}

#[derive(Debug, Deserialize, Clone)]
pub struct LocalMeta {
    pub version: String,
    pub minecraft: String,
    #[serde(default)]
    pub loader: String,
    #[serde(default)]
    pub loader_version: String,
    /// Legacy meta files only had `fabric`.
    #[serde(default)]
    pub fabric: Option<String>,
    #[serde(default = "default_java")]
    pub java: u8,
}

impl LocalMeta {
    pub fn loader_kind(&self) -> String {
        if self.loader.is_empty() {
            "fabric".into()
        } else {
            self.loader.to_lowercase()
        }
    }
    pub fn loader_version(&self) -> String {
        if !self.loader_version.is_empty() {
            self.loader_version.clone()
        } else {
            self.fabric.clone().unwrap_or_default()
        }
    }
}

pub fn read_local_meta(instance_dir: &Path) -> Result<LocalMeta> {
    let s = std::fs::read_to_string(instance_dir.join(META_FILE))?;
    Ok(serde_json::from_str(&s)?)
}
