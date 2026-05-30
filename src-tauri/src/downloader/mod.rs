//! Parallel HTTPS downloader with:
//! - Tokio semaphore for concurrency (`config::DOWNLOAD_PARALLELISM`)
//! - HTTP Range resume for partial files (.part files)
//! - Streaming SHA-256 verification
//! - Retry with exponential backoff
//! - Atomic rename into final position
//! - Aggregated progress events to the UI

pub mod integrity;
pub mod queue;

use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Emitter};

use crate::config;
use crate::error::Result;

pub use queue::DownloadJob;

pub struct Downloader {
    http: reqwest::Client,
    app: AppHandle,
}

impl Downloader {
    pub fn new(http: reqwest::Client, app: AppHandle) -> Self {
        Self { http, app }
    }

    /// Drive the full queue. Returns total bytes downloaded.
    pub async fn run(&self, jobs: Vec<DownloadJob>) -> Result<u64> {
        let total_files = jobs.len();
        let total_bytes: u64 = jobs
            .iter()
            .map(|j| j.size.unwrap_or(0))
            .sum();

        let progress = Arc::new(Progress::new(self.app.clone(), total_files, total_bytes));
        queue::run(self.http.clone(), jobs, config::DOWNLOAD_PARALLELISM, progress.clone()).await?;
        Ok(progress.bytes_done())
    }
}

/// Cross-task progress aggregator. Emits `update:progress` events
/// throttled to ~20 Hz to keep the UI from drowning in IPC traffic.
pub struct Progress {
    app: AppHandle,
    total_files: usize,
    total_bytes: u64,
    bytes_done: std::sync::atomic::AtomicU64,
    files_done: std::sync::atomic::AtomicUsize,
    last_emit_ms: std::sync::atomic::AtomicU64,
    started_at: std::time::Instant,
}

impl Progress {
    pub fn new(app: AppHandle, total_files: usize, total_bytes: u64) -> Self {
        Self {
            app,
            total_files,
            total_bytes,
            bytes_done: 0.into(),
            files_done: 0.into(),
            last_emit_ms: 0.into(),
            started_at: std::time::Instant::now(),
        }
    }

    pub fn add_bytes(&self, n: u64, current_file: &str) {
        use std::sync::atomic::Ordering;
        let new_total = self.bytes_done.fetch_add(n, Ordering::Relaxed) + n;
        self.maybe_emit(new_total, current_file, false);
    }

    pub fn finish_file(&self, current_file: &str) {
        use std::sync::atomic::Ordering;
        self.files_done.fetch_add(1, Ordering::Relaxed);
        self.maybe_emit(self.bytes_done.load(Ordering::Relaxed), current_file, true);
    }

    pub fn bytes_done(&self) -> u64 {
        self.bytes_done.load(std::sync::atomic::Ordering::Relaxed)
    }

    fn maybe_emit(&self, bytes_done: u64, current_file: &str, force: bool) {
        use std::sync::atomic::Ordering;
        let now = self.started_at.elapsed().as_millis() as u64;
        let last = self.last_emit_ms.load(Ordering::Relaxed);
        if !force && now.saturating_sub(last) < 50 {
            return;
        }
        self.last_emit_ms.store(now, Ordering::Relaxed);

        let elapsed = self.started_at.elapsed().as_secs_f64().max(0.001);
        let speed_bps = (bytes_done as f64 / elapsed) as u64;

        #[derive(serde::Serialize, Clone)]
        struct P<'a> {
            current_file: &'a str,
            bytes_done: u64,
            bytes_total: u64,
            files_done: usize,
            files_total: usize,
            speed_bps: u64,
        }

        let _ = self.app.emit(
            "update:progress",
            P {
                current_file,
                bytes_done,
                bytes_total: self.total_bytes,
                files_done: self.files_done.load(Ordering::Relaxed),
                files_total: self.total_files,
                speed_bps,
            },
        );
    }
}

/// Convenience for ad-hoc one-off downloads (e.g. fabric installer jar).
pub async fn download_single(
    http: &reqwest::Client,
    url: &str,
    dest: PathBuf,
    sha256: Option<String>,
) -> Result<()> {
    let job = DownloadJob {
        url: url.into(),
        dest,
        sha256,
        size: None,
        label: url.into(),
    };
    queue::download_one(http, &job, None).await
}
