//! Server gate — fetched from a small JSON file on the same GitHub release
//! that hosts the manifest. The admin flips `open: false` to put the server
//! in maintenance / pause mode; the launcher refuses to spawn Minecraft as
//! long as the gate is closed.
//!
//! Fail-open: if `gate.json` is missing or unfetchable we assume the gate
//! is open. This avoids locking everyone out if GitHub is down.

use serde::{Deserialize, Serialize};

use crate::config;
use crate::error::{Error, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerGate {
    /// `false` = launcher refuses to spawn Minecraft.
    pub open: bool,
    /// Why the server is closed (shown to the player). Markdown-light: kept
    /// short by the admin.
    #[serde(default)]
    pub reason: Option<String>,
    /// Optional ISO 8601 timestamp at which the server should reopen.
    #[serde(default)]
    pub estimated_reopen: Option<String>,
    /// Soft banner shown on Home even when the gate is open (e.g. "wipe
    /// programmé ce soir 22h"). Doesn't block launching.
    #[serde(default)]
    pub banner: Option<String>,
}

impl Default for ServerGate {
    fn default() -> Self {
        Self {
            open: true,
            reason: None,
            estimated_reopen: None,
            banner: None,
        }
    }
}

pub async fn fetch(http: &reqwest::Client) -> Result<ServerGate> {
    // Same cache-busting trick as the manifest fetch so admins can flip the
    // gate and see the effect immediately on every client.
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let url = format!("{}?_={}", config::GATE_URL, ts);

    let resp = http
        .get(&url)
        .header("Cache-Control", "no-cache")
        .header("Pragma", "no-cache")
        .send()
        .await
        .map_err(|e| Error::Custom(format!("Gate unreachable: {}", e)))?;

    // 404 → no gate file uploaded; treat as open.
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(ServerGate::default());
    }

    let g: ServerGate = resp
        .error_for_status()
        .map_err(|e| Error::Custom(format!("Gate HTTP error: {}", e)))?
        .json()
        .await
        .map_err(|e| Error::Custom(format!("Gate JSON parse: {}", e)))?;

    Ok(g)
}
