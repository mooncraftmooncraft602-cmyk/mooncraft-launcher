//! Per-instance directory layout helpers.
//!
//! Layout under `<install>/instances/main/`:
//! ```text
//! .minecraft/        ← MC game dir (saves, options.txt, screenshots)
//! mods/              ← Managed by manifest
//! config/            ← Managed by manifest
//! resourcepacks/     ← Managed by manifest
//! shaderpacks/       ← Managed by manifest
//! libraries/         ← Vanilla + Fabric libs
//! assets/            ← Vanilla asset cache
//! versions/          ← MC client jar + Fabric profile json
//! ```
//!
//! The "managed" dirs above are also the targets the updater diffs against.

use std::path::PathBuf;

use crate::state::AppState;

pub struct Layout {
    pub root: PathBuf,
    pub game_dir: PathBuf,
    pub libraries: PathBuf,
    pub assets: PathBuf,
    pub versions: PathBuf,
    pub natives: PathBuf,
}

impl Layout {
    pub fn for_state(state: &AppState) -> Self {
        let root = state.paths.instance_dir.clone();
        Self {
            game_dir: root.clone(),
            libraries: root.join("libraries"),
            assets: root.join("assets"),
            versions: root.join("versions"),
            natives: root.join("natives"),
            root,
        }
    }
}
