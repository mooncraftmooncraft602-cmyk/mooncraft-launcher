//! Resolves the Fabric profile JSON and downloads its libraries.

use std::path::PathBuf;
use std::sync::Arc;

use serde::Deserialize;

use crate::downloader;
use crate::downloader::DownloadJob;
use crate::error::{Error, Result};
use crate::state::AppState;

#[derive(Debug, Clone)]
pub struct FabricProfile {
    pub loader_version: String,
    pub main_class: String,
    pub libraries: Vec<PathBuf>,
}

#[derive(Deserialize)]
struct ProfileJson {
    #[serde(rename = "mainClass")]
    main_class: serde_json::Value,
    libraries: Vec<ProfileLib>,
}
#[derive(Deserialize)]
struct ProfileLib {
    name: String,
    url: String,
}

pub async fn install(state: Arc<AppState>, mc: &str, loader: &str) -> Result<FabricProfile> {
    let url = format!(
        "https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json",
        mc, loader
    );

    let profile: ProfileJson = state.http.get(&url).send().await?.json().await?;
    let main_class = match profile.main_class {
        serde_json::Value::String(s) => s,
        serde_json::Value::Object(o) => o
            .get("client")
            .and_then(|v| v.as_str())
            .ok_or_else(|| Error::Fabric("no client mainClass".into()))?
            .to_string(),
        _ => return Err(Error::Fabric("unexpected mainClass shape".into())),
    };

    let libraries_root = state.paths.instance_dir.join("libraries");
    let mut jobs = Vec::new();
    let mut lib_paths = Vec::new();
    for lib in profile.libraries {
        let path = match maven_to_path(&lib.name) {
            Some(p) => p,
            None => {
                tracing::warn!(coords = %lib.name, "skipping fabric library with bad maven coords");
                continue;
            }
        };
        let dest = libraries_root.join(&path);
        let full_url = if lib.url.ends_with('/') {
            format!("{}{}", lib.url, path)
        } else {
            format!("{}/{}", lib.url, path)
        };
        if !dest.exists() {
            jobs.push(DownloadJob {
                url: full_url,
                dest: dest.clone(),
                sha256: None,
                size: None,
                label: format!("fabric/{}", path),
            });
        }
        lib_paths.push(dest);
    }

    if !jobs.is_empty() {
        let d = downloader::Downloader::new(state.http.clone(), state.app_handle.clone());
        d.run(jobs).await?;
    }

    Ok(FabricProfile {
        loader_version: loader.to_string(),
        main_class,
        libraries: lib_paths,
    })
}

fn maven_to_path(coords: &str) -> Option<String> {
    let parts: Vec<&str> = coords.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let filename = match parts.get(3) {
        Some(c) => format!("{}-{}-{}.jar", artifact, version, c),
        None => format!("{}-{}.jar", artifact, version),
    };
    Some(format!("{}/{}/{}/{}", group, artifact, version, filename))
}
