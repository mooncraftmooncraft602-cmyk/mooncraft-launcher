//! Smart patch / update pipeline.
//!
//! Flow:
//! 1. `manifest::fetch` — HTTPS GET, validate JSON, validate every URL is HTTPS.
//! 2. `diff::compute` — SHA-256 each local file, compute set of:
//!    a) `to_download`  : missing or mismatched files
//!    b) `to_remove`    : files present locally but absent in manifest
//! 3. `rollback::snapshot` — record state of affected files so we can revert.
//! 4. `downloader::queue.run` — parallel HTTPS GETs with resume + integrity.
//! 5. Apply removals.
//! 6. `rollback::commit` — drop snapshot on success, `restore` on failure.

pub mod diff;
pub mod manifest;
pub mod rollback;

use std::sync::Arc;

use serde::Serialize;
use tauri::Emitter;

use crate::downloader::{DownloadJob, Downloader};
use crate::error::{Error, Result};
use crate::state::AppState;

pub use manifest::{Manifest, ManifestFile};

#[derive(Debug, Serialize, Clone)]
pub struct UpdateCheck {
    pub current_version: Option<String>,
    pub remote_version: String,
    pub changelog: Option<String>,
    pub needs_update: bool,
    pub bytes_to_download: u64,
    pub files_to_download: usize,
    pub files_to_remove: usize,
}

#[derive(Debug, Serialize, Clone)]
pub struct UpdateReport {
    pub version: String,
    pub files_downloaded: usize,
    pub files_removed: usize,
    pub bytes_downloaded: u64,
    pub duration_ms: u128,
}

/// Read-only check — no filesystem writes.
pub async fn check(state: Arc<AppState>) -> Result<UpdateCheck> {
    emit_status(&state, "check", "Fetching remote manifest…");
    let manifest = manifest::fetch(&state.http).await?;

    emit_status(&state, "check", "Computing diff…");
    let diff = diff::compute(&state.paths.instance_dir, &manifest).await?;

    let current_version = manifest::read_local_version(&state.paths.instance_dir).ok();
    let bytes: u64 = diff.to_download.iter().map(|f| f.size).sum();

    Ok(UpdateCheck {
        needs_update: current_version.as_deref() != Some(&manifest.version)
            || !diff.to_download.is_empty()
            || !diff.to_remove.is_empty(),
        current_version,
        remote_version: manifest.version.clone(),
        changelog: manifest.changelog.clone(),
        bytes_to_download: bytes,
        files_to_download: diff.to_download.len(),
        files_to_remove: diff.to_remove.len(),
    })
}

/// Full apply with rollback. Emits `update:*` events during the run.
pub async fn run(state: Arc<AppState>) -> Result<UpdateReport> {
    let start = std::time::Instant::now();

    emit_status(&state, "check", "Fetching remote manifest…");
    let manifest = manifest::fetch(&state.http).await?;

    emit_status(&state, "verify", "Verifying local files…");
    let diff = diff::compute(&state.paths.instance_dir, &manifest).await?;

    // Nothing to do — fast path.
    if diff.to_download.is_empty() && diff.to_remove.is_empty() {
        manifest::write_local_version(&state.paths.instance_dir, &manifest.version)?;
        emit_complete(&state, &manifest.version, 0);
        return Ok(UpdateReport {
            version: manifest.version,
            files_downloaded: 0,
            files_removed: 0,
            bytes_downloaded: 0,
            duration_ms: start.elapsed().as_millis(),
        });
    }

    let snapshot = rollback::snapshot(&state.paths.instance_dir, &diff).await?;

    let result = apply(state.clone(), &manifest, &diff).await;

    match result {
        Ok(bytes) => {
            rollback::commit(snapshot)?;
            manifest::write_local_version(&state.paths.instance_dir, &manifest.version)?;
            emit_complete(
                &state,
                &manifest.version,
                diff.to_download.len() + diff.to_remove.len(),
            );
            Ok(UpdateReport {
                version: manifest.version,
                files_downloaded: diff.to_download.len(),
                files_removed: diff.to_remove.len(),
                bytes_downloaded: bytes,
                duration_ms: start.elapsed().as_millis(),
            })
        }
        Err(e) => {
            tracing::error!(error = ?e, "update failed, rolling back");
            rollback::restore(snapshot)?;
            emit_error(&state, &e);
            Err(Error::RollbackTriggered(e.to_string()))
        }
    }
}

async fn apply(
    state: Arc<AppState>,
    manifest: &Manifest,
    diff: &diff::Diff,
) -> Result<u64> {
    // 1. Download all changed/missing files.
    let jobs: Vec<DownloadJob> = diff
        .to_download
        .iter()
        .map(|f| DownloadJob {
            url: f.url.clone(),
            dest: state.paths.instance_dir.join(&f.normalized_path),
            sha256: Some(f.sha256.clone()),
            size: Some(f.size),
            label: f.path.clone(),
        })
        .collect();

    let downloader = Downloader::new(state.http.clone(), state.app_handle.clone());
    let bytes = downloader.run(jobs).await?;

    // 2. Remove stale files.
    for path in &diff.to_remove {
        let abs = state.paths.instance_dir.join(path);
        if abs.exists() {
            if let Err(e) = tokio::fs::remove_file(&abs).await {
                tracing::warn!(?abs, ?e, "failed to remove stale file");
            }
        }
    }

    // 3. Touch manifest sentinel (mc / fabric versions).
    manifest::write_local_meta(&state.paths.instance_dir, manifest)?;

    Ok(bytes)
}

fn emit_status(state: &AppState, phase: &str, message: &str) {
    #[derive(Serialize, Clone)]
    struct P<'a> {
        phase: &'a str,
        message: &'a str,
    }
    let _ = state
        .app_handle
        .emit("update:status", P { phase, message });
}

fn emit_complete(state: &AppState, version: &str, files_changed: usize) {
    #[derive(Serialize, Clone)]
    struct P<'a> {
        version: &'a str,
        files_changed: usize,
    }
    let _ = state.app_handle.emit(
        "update:complete",
        P {
            version,
            files_changed,
        },
    );
}

fn emit_error(state: &AppState, err: &Error) {
    #[derive(Serialize, Clone)]
    struct P {
        message: String,
        recoverable: bool,
    }
    let _ = state.app_handle.emit(
        "update:error",
        P {
            message: err.to_string(),
            recoverable: matches!(err, Error::Http(_) | Error::Io(_)),
        },
    );
}
