//! Transactional rollback.
//!
//! Strategy:
//! - Before applying changes, copy every file we're going to **modify or
//!   remove** into a unique snapshot dir under `<install>/cache/snapshots/`.
//! - On commit, drop the snapshot.
//! - On failure, walk the snapshot back into place and remove anything
//!   the apply phase created that wasn't in the snapshot.

use std::path::{Path, PathBuf};

use uuid::Uuid;

use crate::error::Result;

use super::diff::Diff;

pub struct Snapshot {
    pub id: Uuid,
    pub root: PathBuf,
    pub instance_dir: PathBuf,
    /// Files we expect to create that didn't exist before — cleaned on rollback.
    pub created_paths: Vec<PathBuf>,
}

pub async fn snapshot(instance_dir: &Path, diff: &Diff) -> Result<Snapshot> {
    let id = Uuid::new_v4();
    let root = instance_dir
        .parent()
        .unwrap_or(instance_dir)
        .join("cache")
        .join("snapshots")
        .join(id.to_string());
    tokio::fs::create_dir_all(&root).await?;

    let mut created_paths = Vec::new();

    // 1. Files we'll overwrite (download set).
    for f in &diff.to_download {
        let abs = instance_dir.join(&f.normalized_path);
        if abs.exists() {
            stash(&root, instance_dir, &f.normalized_path).await?;
        } else {
            created_paths.push(f.normalized_path.clone());
        }
    }

    // 2. Files we'll delete (stale set).
    for rel in &diff.to_remove {
        stash(&root, instance_dir, rel).await?;
    }

    Ok(Snapshot {
        id,
        root,
        instance_dir: instance_dir.to_path_buf(),
        created_paths,
    })
}

/// Drop the snapshot on success.
pub fn commit(snap: Snapshot) -> Result<()> {
    let _ = std::fs::remove_dir_all(&snap.root);
    Ok(())
}

/// Restore files from the snapshot, then remove freshly-created files.
pub fn restore(snap: Snapshot) -> Result<()> {
    // Walk the snapshot root, copying back to instance_dir/<rel>.
    for entry in walkdir::WalkDir::new(&snap.root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let rel = match entry.path().strip_prefix(&snap.root) {
            Ok(r) => r,
            Err(_) => {
                tracing::warn!(path = ?entry.path(), "snapshot entry outside snap root, skipping");
                continue;
            }
        };
        let dest = snap.instance_dir.join(rel);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(entry.path(), &dest)?;
    }

    // Remove anything we created fresh.
    for rel in &snap.created_paths {
        let abs = snap.instance_dir.join(rel);
        if abs.exists() {
            let _ = std::fs::remove_file(&abs);
        }
    }

    // Drop the snapshot dir.
    let _ = std::fs::remove_dir_all(&snap.root);
    Ok(())
}

async fn stash(snap_root: &Path, instance_dir: &Path, rel: &Path) -> Result<()> {
    let src = instance_dir.join(rel);
    if !src.exists() {
        return Ok(());
    }
    let dest = snap_root.join(rel);
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::copy(&src, &dest).await?;
    Ok(())
}
