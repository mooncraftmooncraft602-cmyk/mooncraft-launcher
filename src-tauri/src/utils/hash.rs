//! SHA-256 helpers. Streaming variant keeps memory flat on large mod jars.

use std::path::Path;

use sha2::{Digest, Sha256};
use tokio::fs::File;
use tokio::io::{AsyncReadExt, BufReader};

use crate::error::Result;

const READ_CHUNK: usize = 64 * 1024;

/// Stream a file through SHA-256 without loading it in memory.
pub async fn sha256_file(path: &Path) -> Result<String> {
    let file = File::open(path).await?;
    let mut reader = BufReader::with_capacity(READ_CHUNK, file);
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; READ_CHUNK];
    loop {
        let n = reader.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// Hash an in-memory byte slice.
pub fn sha256_bytes(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

/// Compare two hashes case-insensitively (manifests sometimes uppercase).
pub fn eq_hash(a: &str, b: &str) -> bool {
    a.eq_ignore_ascii_case(b)
}
