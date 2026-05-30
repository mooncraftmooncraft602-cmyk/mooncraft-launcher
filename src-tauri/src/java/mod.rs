//! JVM resolution.
//!
//! Order of preference:
//! 1. Explicit `settings.java_path` override
//! 2. Bundled `<install>/runtime/java-<N>/bin/javaw[.exe]`  (downloaded once)
//! 3. `JAVA_HOME` env var
//! 4. `java` on PATH (via `which`)
//!
//! Auto-download (Adoptium) is Milestone 2 — for now we fail with a clear
//! message and let the UI walk the user to a downloads page.

pub mod detector;

use std::path::PathBuf;
use std::sync::Arc;

use crate::error::{Error, Result};
use crate::state::AppState;

pub async fn ensure(state: Arc<AppState>, _required_major: u8) -> Result<PathBuf> {
    let settings = state.settings.lock().unwrap().clone();
    if let Some(path) = settings.java_path.as_ref() {
        let pb = PathBuf::from(path);
        if pb.exists() {
            return Ok(pb);
        }
    }

    if let Some(bundled) = detector::find_bundled(&state.paths.runtime_dir) {
        return Ok(bundled);
    }

    if let Some(env) = detector::from_java_home() {
        return Ok(env);
    }

    if let Some(path) = detector::from_path() {
        return Ok(path);
    }

    Err(Error::JavaNotFound)
}
