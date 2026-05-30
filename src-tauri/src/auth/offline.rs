//! Offline account helpers.

use sha2::{Digest, Sha256};

/// Mimic the vanilla "OfflinePlayer:<name>" UUID v3 hash so that a player's
/// in-game UUID is stable across launches (matches the convention used by
/// Mojang for offline clients).
pub fn deterministic_uuid(username: &str) -> String {
    let mut h = Sha256::new();
    h.update(format!("OfflinePlayer:{}", username).as_bytes());
    let digest = h.finalize();
    // Format as canonical 8-4-4-4-12 (UUID v3-ish).
    let b = &digest[..16];
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        b[0], b[1], b[2], b[3],
        b[4], b[5],
        b[6], b[7],
        b[8], b[9],
        b[10], b[11], b[12], b[13], b[14], b[15]
    )
}
