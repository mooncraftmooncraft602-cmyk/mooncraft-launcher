//! Standalone integrity verification — useful for "Repair install" buttons.

use std::path::Path;

use crate::error::Result;
use crate::updater::manifest::Manifest;
use crate::utils::hash;

#[derive(Debug, Clone)]
pub struct VerifyReport {
    pub total: usize,
    pub valid: usize,
    pub corrupt: Vec<String>,
    pub missing: Vec<String>,
}

pub async fn verify_all(instance_dir: &Path, manifest: &Manifest) -> Result<VerifyReport> {
    let mut report = VerifyReport {
        total: manifest.files.len(),
        valid: 0,
        corrupt: Vec::new(),
        missing: Vec::new(),
    };
    for f in &manifest.files {
        let abs = instance_dir.join(&f.normalized_path);
        if !abs.exists() {
            report.missing.push(f.path.clone());
            continue;
        }
        let actual = hash::sha256_file(&abs).await?;
        if hash::eq_hash(&actual, &f.sha256) {
            report.valid += 1;
        } else {
            report.corrupt.push(f.path.clone());
        }
    }
    Ok(report)
}
