//! Lightweight obfuscation for the account vault.
//!
//! This is **not** cryptography. The goal is to keep the file from being
//! readable in a text editor — an attacker with code access can easily
//! reverse it. Real secrets (premium tokens, refresh tokens) must use the
//! OS keyring instead.
//!
//! Format on disk:
//!   `MCV1` (4-byte magic) || 16-byte random salt || XOR-encrypted JSON
//! The keystream is derived from `salt || INSTALL_KEY` hashed with SHA-256
//! and expanded by repeated hashing — fast and deterministic.

use rand::RngCore;
use sha2::{Digest, Sha256};

const MAGIC: &[u8; 4] = b"MCV1";
const SALT_LEN: usize = 16;
// Compile-time secret rotated per release. Anyone reading the binary can
// extract it, so don't rely on it for security — purpose is obfuscation.
const INSTALL_KEY: &[u8] = b"mooncraft-vault-v1-static-pad-do-not-paste";

fn expand_keystream(salt: &[u8], len: usize) -> Vec<u8> {
    let mut out = Vec::with_capacity(len);
    let mut counter: u32 = 0;
    while out.len() < len {
        let mut h = Sha256::new();
        h.update(INSTALL_KEY);
        h.update(salt);
        h.update(counter.to_le_bytes());
        out.extend_from_slice(&h.finalize());
        counter += 1;
    }
    out.truncate(len);
    out
}

pub fn obfuscate(plain: &str) -> Vec<u8> {
    let mut salt = [0u8; SALT_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    let ks = expand_keystream(&salt, plain.len());
    let mut out = Vec::with_capacity(MAGIC.len() + SALT_LEN + plain.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&salt);
    for (b, k) in plain.as_bytes().iter().zip(ks.iter()) {
        out.push(b ^ k);
    }
    out
}

pub fn deobfuscate(blob: &[u8]) -> Result<String, &'static str> {
    if blob.len() < MAGIC.len() + SALT_LEN {
        return Err("vault: too short");
    }
    if &blob[..4] != MAGIC {
        return Err("vault: bad magic");
    }
    let salt = &blob[4..4 + SALT_LEN];
    let body = &blob[4 + SALT_LEN..];
    let ks = expand_keystream(salt, body.len());
    let plain: Vec<u8> = body.iter().zip(ks.iter()).map(|(b, k)| b ^ k).collect();
    String::from_utf8(plain).map_err(|_| "vault: invalid utf8")
}
