//! Mojang public API helpers — used to check whether a chosen Minecraft
//! username is already claimed by a premium account.
//!
//! We hit `https://api.mojang.com/users/profiles/minecraft/<name>`. Mojang
//! returns:
//!   * 200 + `{ "id": "...", "name": "..." }` if the name is owned by a
//!     premium account.
//!   * 204 / 404 if it's free.
//!   * 429 if we're rate-limited.
//!
//! The Mojang endpoint is unauthenticated and cheap; we use the existing
//! shared `reqwest::Client` so user-agent / TLS / timeouts are consistent.

use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsernameAvailability {
    /// `true` if no premium account owns this name (the user is free to use it).
    pub available: bool,
    /// Set when `available = false`: the premium UUID currently owning the name.
    /// Useful for the UI to suggest a variant.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owned_by_uuid: Option<String>,
    /// `true` if the name doesn't even pass Mojang's syntactic rules.
    pub invalid_format: bool,
}

#[derive(Deserialize)]
struct MojangProfile {
    id: String,
    #[allow(dead_code)]
    name: String,
}

/// Mojang's syntactic rule: 3-16 chars, alphanumeric + underscore.
fn syntactically_valid(name: &str) -> bool {
    let len = name.chars().count();
    if !(3..=16).contains(&len) {
        return false;
    }
    name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// Query Mojang for the given username. Returns availability info or an
/// `Error::Custom` if the network call fails entirely (rate-limit, DNS, etc.).
pub async fn check_username(
    http: &reqwest::Client,
    name: &str,
) -> Result<UsernameAvailability> {
    if !syntactically_valid(name) {
        return Ok(UsernameAvailability {
            available: false,
            owned_by_uuid: None,
            invalid_format: true,
        });
    }

    // Safe: `syntactically_valid` above restricts to `[A-Za-z0-9_]` which is
    // URL-safe so no encoding step is required.
    let url = format!("https://api.mojang.com/users/profiles/minecraft/{}", name);
    let resp = http
        .get(&url)
        .send()
        .await
        .map_err(|e| Error::Custom(format!("Mojang API unreachable: {}", e)))?;

    match resp.status() {
        // Owned by a premium account.
        StatusCode::OK => {
            let profile: MojangProfile = resp
                .json()
                .await
                .map_err(|e| Error::Custom(format!("Mojang parse: {}", e)))?;
            Ok(UsernameAvailability {
                available: false,
                owned_by_uuid: Some(profile.id),
                invalid_format: false,
            })
        }
        // Mojang returns 204 (no content) for "no such user", but some CDN
        // layers convert it to 404. Treat both as "free".
        StatusCode::NO_CONTENT | StatusCode::NOT_FOUND => Ok(UsernameAvailability {
            available: true,
            owned_by_uuid: None,
            invalid_format: false,
        }),
        StatusCode::TOO_MANY_REQUESTS => Err(Error::Custom(
            "Mojang nous limite (429). Réessaie dans une minute.".into(),
        )),
        other => Err(Error::Custom(format!(
            "Mojang a renvoyé un code inattendu : {}",
            other
        ))),
    }
}
