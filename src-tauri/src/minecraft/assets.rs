//! Vanilla Minecraft assets pipeline.
//!
//! Resolves the version manifest from Mojang, downloads:
//!  - the version JSON
//!  - the client.jar
//!  - every library matching the current OS/arch rules
//!  - the asset index + every referenced object
//!  - native libraries extracted into `<instance>/natives/<version>`
//!
//! For Milestone 1 this is the minimum viable subset — fully Mojang-compliant
//! library/asset rule evaluation is verbose, kept readable here.

use std::path::PathBuf;
use std::sync::Arc;

use serde::Deserialize;

use crate::downloader;
use crate::downloader::DownloadJob;
use crate::error::{Error, Result};
use crate::state::AppState;

use super::instance::Layout;

const VERSION_MANIFEST_URL: &str =
    "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";

pub struct Vanilla {
    pub version_id: String,
    pub client_jar: PathBuf,
    pub main_class: String,
    pub asset_index: String,
    pub libraries: Vec<PathBuf>,
    pub jvm_args: Vec<String>,
    pub game_args: Vec<String>,
}

#[derive(Deserialize)]
struct VersionManifest {
    versions: Vec<VersionRef>,
}
#[derive(Deserialize)]
struct VersionRef {
    id: String,
    url: String,
}

#[derive(Deserialize)]
struct VersionJson {
    id: String,
    #[serde(rename = "mainClass")]
    main_class: String,
    #[serde(rename = "assetIndex")]
    asset_index: AssetIndexRef,
    downloads: Downloads,
    libraries: Vec<Library>,
    arguments: Option<Arguments>,
    #[serde(rename = "minecraftArguments")]
    minecraft_arguments: Option<String>,
}
#[derive(Deserialize)]
#[allow(dead_code)] // fields surface for future verification work
struct AssetIndexRef {
    id: String,
    url: String,
    sha1: Option<String>,
    #[serde(default)]
    size: u64,
}
#[derive(Deserialize)]
struct Downloads {
    client: Artifact,
}
#[derive(Deserialize, Clone)]
#[allow(dead_code)] // sha1 kept for the day we verify Mojang downloads
struct Artifact {
    url: String,
    sha1: Option<String>,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    path: Option<String>,
}
#[derive(Deserialize)]
struct Library {
    name: String,
    downloads: Option<LibraryDownloads>,
    #[serde(default)]
    rules: Vec<Rule>,
}
#[derive(Deserialize)]
struct LibraryDownloads {
    artifact: Option<Artifact>,
}
#[derive(Deserialize)]
struct Rule {
    action: String,
    #[serde(default)]
    os: Option<OsRule>,
}
#[derive(Deserialize)]
struct OsRule {
    name: Option<String>,
}
#[derive(Deserialize)]
struct Arguments {
    game: Vec<serde_json::Value>,
    jvm: Vec<serde_json::Value>,
}
#[derive(Deserialize)]
struct AssetIndex {
    objects: std::collections::BTreeMap<String, AssetObject>,
}
#[derive(Deserialize)]
struct AssetObject {
    hash: String,
    size: u64,
}

pub async fn ensure(state: Arc<AppState>, mc_version: &str) -> Result<Vanilla> {
    let layout = Layout::for_state(&state);
    tokio::fs::create_dir_all(&layout.versions).await
        .map_err(|e| Error::Custom(format!("[mkdir:versions] {}", e)))?;
    tokio::fs::create_dir_all(&layout.libraries).await
        .map_err(|e| Error::Custom(format!("[mkdir:libraries] {}", e)))?;
    tokio::fs::create_dir_all(&layout.assets.join("indexes")).await
        .map_err(|e| Error::Custom(format!("[mkdir:assets/indexes] {}", e)))?;
    tokio::fs::create_dir_all(&layout.assets.join("objects")).await
        .map_err(|e| Error::Custom(format!("[mkdir:assets/objects] {}", e)))?;

    // 1. Resolve version → version.json URL.
    let manifest: VersionManifest = state
        .http
        .get(VERSION_MANIFEST_URL)
        .send()
        .await
        .map_err(|e| Error::Custom(format!("[fetch:mojang-manifest] {}", e)))?
        .json()
        .await
        .map_err(|e| Error::Custom(format!("[parse:mojang-manifest] {}", e)))?;
    let v_ref = manifest
        .versions
        .into_iter()
        .find(|v| v.id == mc_version)
        .ok_or_else(|| Error::Custom(format!("MC version {} not found in Mojang manifest", mc_version)))?;

    // 2. Fetch the version JSON.
    let version_dir = layout.versions.join(&v_ref.id);
    tokio::fs::create_dir_all(&version_dir).await
        .map_err(|e| Error::Custom(format!("[mkdir:versions/{}] {}", v_ref.id, e)))?;
    let version_json_path = version_dir.join(format!("{}.json", v_ref.id));
    let version: VersionJson = if version_json_path.exists() {
        let s = tokio::fs::read_to_string(&version_json_path).await
            .map_err(|e| Error::Custom(format!("[read:version.json] {}", e)))?;
        serde_json::from_str(&s)
            .map_err(|e| Error::Custom(format!("[parse:version.json] {}", e)))?
    } else {
        let raw = state.http.get(&v_ref.url).send().await
            .map_err(|e| Error::Custom(format!("[fetch:version.json] {}", e)))?
            .text().await
            .map_err(|e| Error::Custom(format!("[read:version.json-body] {}", e)))?;
        tokio::fs::write(&version_json_path, &raw).await
            .map_err(|e| Error::Custom(format!("[write:version.json @ {:?}] {}", version_json_path, e)))?;
        serde_json::from_str(&raw)
            .map_err(|e| Error::Custom(format!("[parse:version.json-raw] {}", e)))?
    };

    // 3. Download client jar (sha1 — Mojang doesn't publish sha256 here).
    let client_jar = version_dir.join(format!("{}.jar", v_ref.id));
    if !client_jar.exists() {
        downloader::download_single(&state.http, &version.downloads.client.url, client_jar.clone(), None)
            .await
            .map_err(|e| Error::Custom(format!("[download:client.jar] {}", e)))?;
    }

    // 4. Download libraries.
    let mut lib_paths = Vec::new();
    let mut native_jars = Vec::new(); // jars to extract into natives/
    let mut jobs = Vec::new();

    // Identify the platform-specific natives tag.
    let native_tag = if cfg!(target_os = "windows") {
        "natives-windows"
    } else if cfg!(target_os = "macos") {
        "natives-osx"
    } else {
        "natives-linux"
    };

    for lib in &version.libraries {
        if !rule_pass(&lib.rules) {
            continue;
        }
        let art = match lib.downloads.as_ref().and_then(|d| d.artifact.as_ref()) {
            Some(a) => a,
            None => continue,
        };
        let path = match art.path.clone() {
            Some(p) => p,
            None => match maven_to_path(&lib.name) {
                Some(p) => p,
                None => {
                    tracing::warn!(coords = %lib.name, "skipping library with bad maven coords");
                    continue;
                }
            },
        };
        let dest = layout.libraries.join(&path);
        if !dest.exists() {
            jobs.push(DownloadJob {
                url: art.url.clone(),
                dest: dest.clone(),
                sha256: None,
                size: Some(art.size),
                label: path.clone(),
            });
        }
        // Collect native JARs — they carry DLLs/.so/.dylib that must be
        // extracted into the natives dir so LWJGL can load them.
        // Mojang encodes the native classifier in the artifact path/URL, not
        // in the maven `name` field, so check the resolved path instead.
        let is_native_jar = path.contains(native_tag)
            || art.url.contains(native_tag);
        if is_native_jar {
            native_jars.push(dest);
        } else {
            lib_paths.push(dest);
        }
    }

    // 5. Asset index + objects.
    let index_path = layout
        .assets
        .join("indexes")
        .join(format!("{}.json", version.asset_index.id));
    if !index_path.exists() {
        let raw = state.http.get(&version.asset_index.url).send().await?.text().await?;
        tokio::fs::write(&index_path, &raw).await?;
    }
    let index_raw = tokio::fs::read_to_string(&index_path).await?;
    let index: AssetIndex = serde_json::from_str(&index_raw)?;
    for obj in index.objects.values() {
        let prefix = &obj.hash[..2];
        let dest = layout
            .assets
            .join("objects")
            .join(prefix)
            .join(&obj.hash);
        if !dest.exists() {
            jobs.push(DownloadJob {
                url: format!(
                    "https://resources.download.minecraft.net/{}/{}",
                    prefix, obj.hash
                ),
                dest,
                sha256: None,
                size: Some(obj.size),
                label: format!("assets/{}", &obj.hash[..8]),
            });
        }
    }

    // Run the queue in one shot.
    if !jobs.is_empty() {
        let d = downloader::Downloader::new(state.http.clone(), state.app_handle.clone());
        d.run(jobs).await?;
    }

    // 5b. Extract native JARs → natives/ so LWJGL can find the DLLs.
    tokio::fs::create_dir_all(&layout.natives).await?;
    for jar in &native_jars {
        if jar.exists() {
            if let Err(e) = extract_natives(jar, &layout.natives) {
                tracing::warn!(?jar, ?e, "failed to extract native jar (non-fatal)");
            }
        }
    }

    // 6. Build JVM/game arg templates.
    let (jvm_args, game_args) = if let Some(args) = version.arguments {
        (flatten_args(&args.jvm), flatten_args(&args.game))
    } else if let Some(s) = version.minecraft_arguments {
        (vec![], s.split_whitespace().map(String::from).collect())
    } else {
        (vec![], vec![])
    };

    Ok(Vanilla {
        version_id: version.id,
        client_jar,
        main_class: version.main_class,
        asset_index: version.asset_index.id,
        libraries: lib_paths,
        jvm_args,
        game_args,
    })
}

fn rule_pass(rules: &[Rule]) -> bool {
    if rules.is_empty() {
        return true;
    }
    let os = std::env::consts::OS;
    // Translate Rust OS strings to Mojang ones.
    let mojang_os = match os {
        "macos" => "osx",
        other => other,
    };
    let mut allowed = false;
    for rule in rules {
        let matches_os = match &rule.os {
            Some(o) => o.name.as_deref().map(|n| n == mojang_os).unwrap_or(true),
            None => true,
        };
        if !matches_os {
            continue;
        }
        allowed = rule.action == "allow";
    }
    allowed
}

fn maven_to_path(coords: &str) -> Option<String> {
    // group:artifact:version[:classifier]
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

/// Extract .dll / .so / .dylib entries from a native JAR into `dest_dir`.
fn extract_natives(jar: &std::path::Path, dest_dir: &std::path::Path) -> crate::error::Result<()> {
    let file = std::fs::File::open(jar)?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| crate::error::Error::Custom(format!("zip open {:?}: {}", jar, e)))?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)
            .map_err(|e| crate::error::Error::Custom(format!("zip entry {}: {}", i, e)))?;
        let name = entry.name().to_string();
        let is_native = name.ends_with(".dll")
            || name.ends_with(".so")
            || name.ends_with(".dylib");
        if !is_native {
            continue;
        }
        // LWJGL 3.x stores DLLs inside e.g. "windows/x64/org/lwjgl/lwjgl.dll".
        // Strip the directory component so everything lands flat in natives/.
        let filename = name.split('/').next_back().unwrap_or(&name);
        let dest = dest_dir.join(filename);
        if dest.exists() {
            continue; // already extracted
        }
        let mut out = std::fs::File::create(&dest)?;
        std::io::copy(&mut entry, &mut out)?;
    }
    Ok(())
}

/// Mojang's new-format args list is a mix of strings and `{ value, rules }`
/// objects. For Milestone 1 we keep only plain strings — that's enough to
/// boot 1.20+ via Fabric, which sets its own JVM args. A full rule resolver
/// is on the roadmap.
fn flatten_args(values: &[serde_json::Value]) -> Vec<String> {
    let mut out = Vec::new();
    for v in values {
        match v {
            serde_json::Value::String(s) => out.push(s.clone()),
            _ => continue,
        }
    }
    out
}
