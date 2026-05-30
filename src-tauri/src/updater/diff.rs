//! Compare local instance against remote manifest.
//!
//! Three buckets:
//!  - `to_download` : missing or hash-mismatch
//!  - `to_remove`   : present locally inside managed dirs but absent in manifest
//!  - `untouched`   : matches manifest already (skipped)
//!
//! "Managed dirs" means we ONLY touch files whose top-level directory is
//! enumerated in MANAGED_DIRS. We don't blow away `saves/`, `logs/`, etc.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use crate::error::Result;
use crate::utils::hash;

use super::manifest::{Manifest, ManifestFile};

/// Top-level dirs whose contents the launcher fully owns.
const MANAGED_DIRS: &[&str] = &["mods", "config", "resourcepacks", "shaderpacks", "kubejs"];

pub struct Diff {
    pub to_download: Vec<ManifestFile>,
    pub to_remove: Vec<PathBuf>,
    pub untouched_count: usize,
}

pub async fn compute(instance_dir: &Path, manifest: &Manifest) -> Result<Diff> {
    let mut to_download = Vec::new();
    let mut untouched_count = 0;

    // Build a set of relative paths the manifest expects.
    let mut expected: HashSet<PathBuf> = HashSet::new();
    let mut by_path: HashMap<PathBuf, &ManifestFile> = HashMap::new();
    for f in &manifest.files {
        expected.insert(f.normalized_path.clone());
        by_path.insert(f.normalized_path.clone(), f);
    }

    // Compare expected vs local for each manifest entry.
    for (rel, file) in &by_path {
        let abs = instance_dir.join(rel);
        if !abs.exists() {
            to_download.push((*file).clone());
            continue;
        }
        // Quick size check before hashing — saves CPU on big jars.
        match tokio::fs::metadata(&abs).await {
            Ok(m) if m.len() == file.size => {}
            Ok(_) => {
                to_download.push((*file).clone());
                continue;
            }
            Err(_) => {
                to_download.push((*file).clone());
                continue;
            }
        }
        let actual = hash::sha256_file(&abs).await?;
        if hash::eq_hash(&actual, &file.sha256) {
            untouched_count += 1;
        } else {
            to_download.push((*file).clone());
        }
    }

    // Scan managed dirs for stale files.
    let mut to_remove = Vec::new();
    for dir in MANAGED_DIRS {
        let root = instance_dir.join(dir);
        if !root.exists() {
            continue;
        }
        for entry in WalkDir::new(&root)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            let rel = match entry.path().strip_prefix(instance_dir) {
                Ok(r) => r.to_path_buf(),
                Err(_) => continue,
            };
            if !expected.contains(&rel) {
                to_remove.push(rel);
            }
        }
    }

    Ok(Diff {
        to_download,
        to_remove,
        untouched_count,
    })
}
