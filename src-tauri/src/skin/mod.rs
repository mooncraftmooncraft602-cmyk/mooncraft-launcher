//! Local skin import.
//!
//! Players who play on the offline-mode MoonCraft server can't have their
//! skin served by Mojang. As a workaround we let them import a 64×64 PNG;
//! we save it under the instance and generate a per-instance resource pack
//! (`mooncraft-skin`) that overrides `wide/steve.png` and `slim/alex.png`.
//! The pack is auto-enabled in `options.txt` so Minecraft picks it up on
//! the next launch.
//!
//! Caveat: this only affects the player's own view (and every other Steve /
//! Alex they see in-game). Real per-player skins for offline accounts
//! require a server-side plugin (SkinRestorer or similar).

pub mod catbox;

use std::path::{Path, PathBuf};

use crate::error::{Error, Result};

const PNG_SIG: &[u8; 8] = &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
const MAX_SKIN_BYTES: u64 = 64 * 1024; // 64 KB is plenty for a 64x64 PNG.

const PACK_DIR_NAME: &str = "mooncraft-skin";
/// Pack format for Minecraft 1.21.x — Minecraft will warn if the value is
/// off-by-one but still accept the pack.
const PACK_FORMAT: u32 = 48;

pub struct SkinImport {
    /// Path where the skin PNG now lives, inside the instance dir.
    pub stored_path: PathBuf,
    /// Public URL of the uploaded skin (catbox.moe). `None` if upload failed
    /// or the caller chose not to upload — the local resource pack still
    /// applies in that case.
    pub remote_url: Option<String>,
    /// The `/skin set <url>` command players need to paste in chat once for
    /// SkinRestorer to persist it server-side.
    pub skin_command: Option<String>,
}

const PENDING_FILE: &str = "mooncraft-pending-skin.txt";

/// Validate that the source file looks like a PNG within sane bounds,
/// then copy it into `<instance>/skins/<account_id>.png`, refresh the
/// local resource pack, AND upload to catbox.moe so the SkinRestorer
/// plugin on the server can persist it via `/skin set <url>`.
pub async fn import(
    http: &reqwest::Client,
    instance_dir: &Path,
    account_id: &str,
    source: &Path,
) -> Result<SkinImport> {
    if !source.exists() {
        return Err(Error::Custom("Fichier introuvable.".into()));
    }

    let meta = std::fs::metadata(source)
        .map_err(|e| Error::Custom(format!("Impossible de lire le fichier : {}", e)))?;
    if meta.len() == 0 {
        return Err(Error::Custom("Le fichier est vide.".into()));
    }
    if meta.len() > MAX_SKIN_BYTES {
        return Err(Error::Custom(format!(
            "Le fichier dépasse {} Ko — pas un skin Minecraft.",
            MAX_SKIN_BYTES / 1024
        )));
    }

    let bytes = std::fs::read(source)
        .map_err(|e| Error::Custom(format!("Lecture impossible : {}", e)))?;
    if !bytes.starts_with(PNG_SIG) {
        return Err(Error::Custom(
            "Format invalide — il faut un PNG (signature manquante).".into(),
        ));
    }

    // Save under the instance for traceability + later re-application.
    let skins_dir = instance_dir.join("skins");
    std::fs::create_dir_all(&skins_dir).map_err(|e| {
        Error::Custom(format!("Impossible de créer le dossier skins/ : {}", e))
    })?;
    let stored = skins_dir.join(format!("{}.png", account_id));
    std::fs::copy(source, &stored)
        .map_err(|e| Error::Custom(format!("Copie échouée : {}", e)))?;

    // Refresh / regenerate the resource pack from this skin.
    generate_resource_pack(instance_dir, &stored)?;
    // Enable it in options.txt so it's active on next launch.
    ensure_pack_enabled(instance_dir)?;

    // Upload to catbox.moe so the server's SkinRestorer plugin can persist
    // the skin for everyone (including cracked accounts). If upload fails
    // we still consider the import a success — the local resource pack is
    // already in place.
    let (remote_url, skin_command) = match catbox::upload(http, &stored).await {
        Ok(url) => {
            // Persist the URL so the client mod can later auto-run the
            // `/skin set` command on join.
            let _ = std::fs::write(instance_dir.join(PENDING_FILE), &url);
            let cmd = format!("/skin set {}", url);
            (Some(url), Some(cmd))
        }
        Err(_) => (None, None),
    };

    Ok(SkinImport {
        stored_path: stored,
        remote_url,
        skin_command,
    })
}

/// Build the `<instance>/resourcepacks/mooncraft-skin/` tree.
fn generate_resource_pack(instance_dir: &Path, skin_png: &Path) -> Result<()> {
    let pack_root = instance_dir.join("resourcepacks").join(PACK_DIR_NAME);
    // Clear any previous version so stale assets don't linger.
    if pack_root.exists() {
        std::fs::remove_dir_all(&pack_root).ok();
    }
    let textures = pack_root
        .join("assets")
        .join("minecraft")
        .join("textures")
        .join("entity")
        .join("player");
    let wide = textures.join("wide");
    let slim = textures.join("slim");
    std::fs::create_dir_all(&wide)?;
    std::fs::create_dir_all(&slim)?;

    // pack.mcmeta
    let mcmeta = format!(
        r#"{{
  "pack": {{
    "pack_format": {},
    "description": "MoonCraft — skin local du pilote"
  }}
}}
"#,
        PACK_FORMAT
    );
    std::fs::write(pack_root.join("pack.mcmeta"), mcmeta)?;

    // Copy the same image for both wide (Steve) and slim (Alex) — the
    // launcher doesn't know which mode the user wants; the skin file
    // itself encodes the arm width.
    std::fs::copy(skin_png, wide.join("steve.png"))?;
    std::fs::copy(skin_png, slim.join("alex.png"))?;

    Ok(())
}

/// Ensure `file/mooncraft-skin` is present in `options.txt`'s resourcePacks
/// array so MC actually loads it. Creates a minimal options.txt if absent.
fn ensure_pack_enabled(instance_dir: &Path) -> Result<()> {
    let options = instance_dir.join("options.txt");
    let token = format!("\"file/{}\"", PACK_DIR_NAME);

    if !options.exists() {
        // Skeleton — MC fills in the rest on first run.
        let body = format!(
            "resourcePacks:[\"vanilla\",{}]\nincompatibleResourcePacks:[]\n",
            token
        );
        std::fs::write(&options, body)?;
        return Ok(());
    }

    let raw = std::fs::read_to_string(&options)?;
    let mut out: Vec<String> = Vec::with_capacity(raw.lines().count() + 1);
    let mut saw_packs = false;

    for line in raw.lines() {
        if let Some(rest) = line.strip_prefix("resourcePacks:") {
            saw_packs = true;
            if rest.contains(&token) {
                // Already enabled — keep the line as-is.
                out.push(line.to_string());
            } else if rest.trim() == "[]" {
                out.push(format!("resourcePacks:[\"vanilla\",{}]", token));
            } else if let Some(stripped) = rest.trim_end().strip_suffix(']') {
                out.push(format!("resourcePacks:{},{}]", stripped, token));
            } else {
                // Unexpected shape — leave it but append our token assignment.
                out.push(line.to_string());
            }
        } else {
            out.push(line.to_string());
        }
    }

    if !saw_packs {
        out.push(format!("resourcePacks:[\"vanilla\",{}]", token));
    }

    std::fs::write(&options, out.join("\n") + "\n")?;
    Ok(())
}

/// Path of the imported skin for a given account, if one exists.
pub fn skin_path_for(instance_dir: &Path, account_id: &str) -> Option<PathBuf> {
    let p = instance_dir.join("skins").join(format!("{}.png", account_id));
    if p.exists() { Some(p) } else { None }
}
