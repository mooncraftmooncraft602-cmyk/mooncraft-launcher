//! Locate a usable JVM binary on the host system.

use std::path::{Path, PathBuf};

fn binary_name() -> &'static str {
    if cfg!(windows) {
        "javaw.exe"
    } else {
        "java"
    }
}

pub fn from_java_home() -> Option<PathBuf> {
    std::env::var("JAVA_HOME").ok().and_then(|home| {
        let candidate = Path::new(&home).join("bin").join(binary_name());
        candidate.exists().then_some(candidate)
    })
}

pub fn from_path() -> Option<PathBuf> {
    which::which(binary_name()).ok()
}

/// Walk `<install>/runtime/<*>/bin/<binary>` looking for a bundled JRE we
/// previously extracted.
pub fn find_bundled(runtime_dir: &Path) -> Option<PathBuf> {
    if !runtime_dir.exists() {
        return None;
    }
    let bin = binary_name();
    let entries = std::fs::read_dir(runtime_dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        // Standard layout: <runtime>/<dist>/bin/<bin>
        let candidate = path.join("bin").join(bin);
        if candidate.exists() {
            return Some(candidate);
        }
        // macOS bundles nest a Contents/Home dir.
        let mac_candidate = path
            .join("Contents")
            .join("Home")
            .join("bin")
            .join(bin);
        if mac_candidate.exists() {
            return Some(mac_candidate);
        }
    }
    None
}
