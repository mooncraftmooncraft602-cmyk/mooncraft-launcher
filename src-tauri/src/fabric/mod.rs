//! Fabric loader installer.
//!
//! Fabric publishes a JSON profile per (MC version × loader version) that
//! lists the libraries we need on the classpath and the main class to run.
//! Endpoint:
//! `https://meta.fabricmc.net/v2/versions/loader/<mc>/<loader>/profile/json`

pub mod installer;

use std::path::PathBuf;
use std::sync::Arc;

use crate::error::Result;
use crate::state::AppState;

pub use installer::{install, FabricProfile};

#[allow(dead_code)]
pub async fn ensure(state: Arc<AppState>, mc: &str, loader: &str) -> Result<FabricProfile> {
    installer::install(state, mc, loader).await
}

#[allow(dead_code)]
pub fn default_loader_jar(state: &AppState) -> PathBuf {
    state.paths.instance_dir.join("versions").join("fabric")
}
