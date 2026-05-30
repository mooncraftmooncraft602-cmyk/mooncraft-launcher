//! Parallel download queue.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use futures::StreamExt;
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;

use crate::error::{Error, Result};
use crate::utils::hash;

use super::Progress;

#[derive(Debug, Clone)]
pub struct DownloadJob {
    pub url: String,
    pub dest: PathBuf,
    pub sha256: Option<String>,
    pub size: Option<u64>,
    /// Display label for the UI ("mods/mooncore.jar").
    pub label: String,
}

const MAX_RETRIES: u32 = 3;
const BASE_BACKOFF_MS: u64 = 500;

pub async fn run(
    http: reqwest::Client,
    jobs: Vec<DownloadJob>,
    parallelism: usize,
    progress: Arc<Progress>,
) -> Result<()> {
    let sem = Arc::new(Semaphore::new(parallelism));
    let http = Arc::new(http);

    let futures = jobs.into_iter().map(|job| {
        let sem = sem.clone();
        let http = http.clone();
        let progress = progress.clone();
        async move {
            let _permit = sem.acquire().await.expect("semaphore closed");
            let mut attempt = 0u32;
            loop {
                match download_one(&http, &job, Some(&progress)).await {
                    Ok(()) => {
                        progress.finish_file(&job.label);
                        return Ok::<_, Error>(());
                    }
                    Err(e) => {
                        attempt += 1;
                        if attempt >= MAX_RETRIES {
                            tracing::error!(?job, ?e, "download failed after retries");
                            return Err(e);
                        }
                        let backoff = BASE_BACKOFF_MS * 2u64.pow(attempt - 1);
                        tracing::warn!(?job.label, attempt, backoff, "retrying");
                        tokio::time::sleep(Duration::from_millis(backoff)).await;
                    }
                }
            }
        }
    });

    let results: Vec<Result<()>> = futures::stream::iter(futures)
        .buffer_unordered(parallelism)
        .collect()
        .await;

    for r in results {
        r?;
    }
    Ok(())
}

/// Download a single file. Resumes via HTTP Range if `.part` exists.
/// Verifies SHA-256 (if provided) then atomically renames into place.
pub async fn download_one(
    http: &reqwest::Client,
    job: &DownloadJob,
    progress: Option<&Arc<Progress>>,
) -> Result<()> {
    // Ensure parent exists.
    if let Some(parent) = job.dest.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    // Append ".part" to the filename verbatim. Works for files with or
    // without an extension (Mojang asset objects are hash-named, no ext).
    let part = {
        let mut name = job
            .dest
            .file_name()
            .map(|s| s.to_os_string())
            .unwrap_or_default();
        name.push(".part");
        job.dest.with_file_name(name)
    };

    let mut start_offset: u64 = match tokio::fs::metadata(&part).await {
        Ok(m) => m.len(),
        Err(_) => 0,
    };

    let mut req = http.get(&job.url);
    if start_offset > 0 {
        req = req.header("Range", format!("bytes={}-", start_offset));
    }
    let resp = req.send().await?;
    let status = resp.status();

    // 200 means server ignored our range — restart from scratch.
    if status.as_u16() == 200 && start_offset > 0 {
        let _ = tokio::fs::remove_file(&part).await;
        start_offset = 0;
    } else if !status.is_success() && status.as_u16() != 206 {
        return Err(Error::Custom(format!(
            "HTTP {} for {}",
            status.as_u16(),
            job.url
        )));
    }

    // On Windows, append-only mode lacks FILE_WRITE_DATA so set_len(0) fails
    // with "access denied". Use write mode + manual seek instead.
    let mut file = if start_offset == 0 {
        tokio::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&part)
            .await?
    } else {
        use tokio::io::AsyncSeekExt;
        let mut f = tokio::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .open(&part)
            .await?;
        f.seek(std::io::SeekFrom::End(0)).await?;
        f
    };

    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk).await?;
        if let Some(p) = progress {
            p.add_bytes(chunk.len() as u64, &job.label);
        }
    }
    file.flush().await?;
    drop(file);

    // Verify hash before promoting .part → final.
    if let Some(expected) = &job.sha256 {
        let actual = hash::sha256_file(&part).await?;
        if !hash::eq_hash(&actual, expected) {
            // Keep the bad file out of the cache.
            let _ = tokio::fs::remove_file(&part).await;
            return Err(Error::HashMismatch {
                path: job.label.clone(),
                expected: expected.clone(),
                actual,
            });
        }
    }

    // Atomic rename. On Windows, remove the destination first if it exists.
    if job.dest.exists() {
        tokio::fs::remove_file(&job.dest).await.ok();
    }
    tokio::fs::rename(&part, &job.dest).await?;
    Ok(())
}
