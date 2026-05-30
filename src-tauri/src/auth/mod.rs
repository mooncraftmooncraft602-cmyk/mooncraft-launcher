//! Account management.
//!
//! Milestone 1: offline accounts only (server runs in `online-mode=false`
//! for early playtesting). Microsoft auth is Milestone 2 — the `kind` enum
//! is forward-compatible.
//!
//! Storage format is a JSON `Vault` written to `accounts_path()`. The blob
//! is XOR-obfuscated (see `crypt.rs`) so that a casual peek at the file
//! doesn't expose emails. **This is NOT real encryption** — sensitive
//! material (premium tokens, real passwords) belongs in the OS keyring,
//! not in this vault.

pub mod crypt;
pub mod mojang;
pub mod offline;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use uuid::Uuid;

use crate::error::Result;
use crate::utils::paths::accounts_path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AccountKind {
    Offline,
    Microsoft,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub username: String,
    pub uuid: String,
    pub kind: AccountKind,
    /// Mojang access token. `None` for offline accounts (the JVM expects "0").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access_token: Option<String>,
    /// Email address the pilote registered with. Used as a contact label
    /// only — never transmitted, never sent to Mojang.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(default)]
    pub active: bool,
}

impl Account {
    pub fn new_offline(username: String, email: Option<String>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            uuid: offline::deterministic_uuid(&username),
            username,
            kind: AccountKind::Offline,
            access_token: None,
            email,
            active: false,
        }
    }

    pub fn user_type(&self) -> &'static str {
        match self.kind {
            AccountKind::Offline => "legacy",
            AccountKind::Microsoft => "msa",
        }
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Vault {
    accounts: Vec<Account>,
}

fn load(app: &AppHandle) -> Result<Vault> {
    let path = accounts_path(app);
    if !path.exists() {
        return Ok(Vault::default());
    }
    let raw = std::fs::read(&path)?;
    // Try obfuscated first, fall back to plain JSON for backward compat
    // with older installs (Milestone 1 wrote plain JSON).
    let decoded = match crypt::deobfuscate(&raw) {
        Ok(s) => s,
        Err(_) => String::from_utf8(raw).unwrap_or_default(),
    };
    Ok(serde_json::from_str(&decoded).unwrap_or_default())
}

fn save(app: &AppHandle, vault: &Vault) -> Result<()> {
    let path = accounts_path(app);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string(vault)?;
    let blob = crypt::obfuscate(&json);
    std::fs::write(&path, blob)?;
    Ok(())
}

pub fn list(app: &AppHandle) -> Result<Vec<Account>> {
    Ok(load(app)?.accounts)
}

pub fn get(app: &AppHandle, id: &str) -> Result<Option<Account>> {
    Ok(load(app)?.accounts.into_iter().find(|a| a.id == id))
}

pub fn add(app: &AppHandle, mut account: Account) -> Result<Account> {
    let mut vault = load(app)?;
    if vault.accounts.is_empty() {
        account.active = true;
    }
    vault.accounts.push(account.clone());
    save(app, &vault)?;
    Ok(account)
}

pub fn remove(app: &AppHandle, id: &str) -> Result<()> {
    let mut vault = load(app)?;
    let was_active = vault.accounts.iter().any(|a| a.id == id && a.active);
    vault.accounts.retain(|a| a.id != id);
    if was_active {
        if let Some(first) = vault.accounts.first_mut() {
            first.active = true;
        }
    }
    save(app, &vault)?;
    Ok(())
}

pub fn set_active(app: &AppHandle, id: &str) -> Result<()> {
    let mut vault = load(app)?;
    for a in vault.accounts.iter_mut() {
        a.active = a.id == id;
    }
    save(app, &vault)?;
    Ok(())
}
