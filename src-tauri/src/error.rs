//! Unified error type. Implements `serde::Serialize` so it can cross the
//! Tauri IPC boundary and surface in the UI.

use serde::{Serialize, Serializer};
use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Error)]
pub enum Error {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("Invalid URL: {0}")]
    Url(#[from] url::ParseError),

    #[error("Hash mismatch for {path}: expected {expected}, got {actual}")]
    HashMismatch {
        path: String,
        expected: String,
        actual: String,
    },

    #[error("Manifest must use HTTPS, got: {0}")]
    InsecureManifest(String),

    #[error("Java runtime not found. Install JDK 17+ or set the path in settings.")]
    JavaNotFound,

    #[error("Fabric installer failed: {0}")]
    Fabric(String),

    #[error("Minecraft launch failed: {0}")]
    Launch(String),

    #[error("Update rolled back: {0}")]
    RollbackTriggered(String),

    #[error("Operation cancelled by user")]
    Cancelled,

    #[error("{0}")]
    Custom(String),

    #[error("Tauri error: {0}")]
    Tauri(#[from] tauri::Error),
}

impl From<anyhow::Error> for Error {
    fn from(e: anyhow::Error) -> Self {
        Error::Custom(e.to_string())
    }
}

impl From<String> for Error {
    fn from(s: String) -> Self {
        Error::Custom(s)
    }
}

impl From<&str> for Error {
    fn from(s: &str) -> Self {
        Error::Custom(s.to_string())
    }
}

// IPC serialization: the UI receives `{ "message": "...", "kind": "..." }`.
impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("Error", 2)?;
        s.serialize_field("message", &self.to_string())?;
        s.serialize_field("kind", self.kind_str())?;
        s.end()
    }
}

impl Error {
    fn kind_str(&self) -> &'static str {
        match self {
            Error::Io(_) => "io",
            Error::Http(_) => "http",
            Error::Serde(_) => "serde",
            Error::Url(_) => "url",
            Error::HashMismatch { .. } => "hash_mismatch",
            Error::InsecureManifest(_) => "insecure_manifest",
            Error::JavaNotFound => "java_not_found",
            Error::Fabric(_) => "fabric",
            Error::Launch(_) => "launch",
            Error::RollbackTriggered(_) => "rollback",
            Error::Cancelled => "cancelled",
            Error::Custom(_) => "custom",
            Error::Tauri(_) => "tauri",
        }
    }
}
