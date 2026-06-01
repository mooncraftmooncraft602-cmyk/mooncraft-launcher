//! Anti-flou : si le bureau Windows tourne SOUS la résolution native du moniteur,
//! le moniteur agrandit le signal (bilinéaire) → tout le jeu paraît flou.
//!
//! On force alors Minecraft en plein écran exclusif À LA RÉSOLUTION NATIVE : le GPU
//! émet le signal natif, le moniteur n'agrandit plus → rendu net, sans toucher au
//! réglage du bureau du joueur. Les joueurs déjà en natif ne sont pas modifiés.

use std::path::Path;

/// Écrit `fullscreen:true` + `fullscreenResolution:<native>` dans options.txt UNIQUEMENT
/// si le bureau est sous la résolution native du moniteur principal.
pub fn ensure_sharp(instance_dir: &Path) {
    #[cfg(windows)]
    {
        if let Some(((cw, ch), (nw, nh, nf))) = detect_resolutions() {
            if cw < nw || ch < nh {
                let mode = format!("{}x{}@{}:24", nw, nh, if nf == 0 { 60 } else { nf });
                if let Err(e) = force_fullscreen(instance_dir, &mode) {
                    tracing::warn!(?e, "anti-flou: échec écriture options.txt");
                } else {
                    tracing::info!(
                        "anti-flou: bureau {}x{} < natif {}x{} -> plein écran natif {}",
                        cw, ch, nw, nh, mode
                    );
                }
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = instance_dir;
    }
}

#[cfg(windows)]
#[repr(C)]
#[derive(Clone, Copy)]
struct DevModeW {
    dm_device_name: [u16; 32],
    dm_spec_version: u16,
    dm_driver_version: u16,
    dm_size: u16,
    dm_driver_extra: u16,
    dm_fields: u32,
    dm_position: [i32; 2],
    dm_display_orientation: u32,
    dm_display_fixed_output: u32,
    dm_color: i16,
    dm_duplex: i16,
    dm_y_resolution: i16,
    dm_tt_option: i16,
    dm_collate: i16,
    dm_form_name: [u16; 32],
    dm_log_pixels: u16,
    dm_bits_per_pel: u32,
    dm_pels_width: u32,
    dm_pels_height: u32,
    dm_display_flags: u32,
    dm_display_frequency: u32,
    dm_icm_method: u32,
    dm_icm_intent: u32,
    dm_media_type: u32,
    dm_dither_type: u32,
    dm_reserved1: u32,
    dm_reserved2: u32,
    dm_panning_width: u32,
    dm_panning_height: u32,
}

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn EnumDisplaySettingsW(
        lpsz_device_name: *const u16,
        i_mode_num: u32,
        lp_dev_mode: *mut DevModeW,
    ) -> i32;
}

/// Retourne ((bureau_w, bureau_h), (natif_w, natif_h, natif_hz)) du moniteur principal.
#[cfg(windows)]
fn detect_resolutions() -> Option<((u32, u32), (u32, u32, u32))> {
    const ENUM_CURRENT_SETTINGS: u32 = 0xFFFF_FFFF;
    unsafe {
        let mut cur: DevModeW = std::mem::zeroed();
        cur.dm_size = std::mem::size_of::<DevModeW>() as u16;
        if EnumDisplaySettingsW(std::ptr::null(), ENUM_CURRENT_SETTINGS, &mut cur) == 0 {
            return None;
        }
        let current = (cur.dm_pels_width, cur.dm_pels_height);

        let mut best = (0u32, 0u32, 0u32);
        let mut i = 0u32;
        loop {
            let mut dm: DevModeW = std::mem::zeroed();
            dm.dm_size = std::mem::size_of::<DevModeW>() as u16;
            if EnumDisplaySettingsW(std::ptr::null(), i, &mut dm) == 0 {
                break;
            }
            let area = dm.dm_pels_width as u64 * dm.dm_pels_height as u64;
            let best_area = best.0 as u64 * best.1 as u64;
            if area > best_area
                || (dm.dm_pels_width == best.0
                    && dm.dm_pels_height == best.1
                    && dm.dm_display_frequency > best.2)
            {
                best = (dm.dm_pels_width, dm.dm_pels_height, dm.dm_display_frequency);
            }
            i += 1;
            if i > 4096 {
                break;
            }
        }
        if best.0 == 0 {
            return None;
        }
        Some((current, best))
    }
}

/// Met `fullscreen:true` et `fullscreenResolution:<mode>` dans options.txt (créé si absent).
#[cfg(windows)]
fn force_fullscreen(instance_dir: &Path, mode: &str) -> std::io::Result<()> {
    let options = instance_dir.join("options.txt");

    if !options.exists() {
        let body = format!(
            "fullscreen:true\nfullscreenResolution:{}\n",
            mode
        );
        std::fs::write(&options, body)?;
        return Ok(());
    }

    let raw = std::fs::read_to_string(&options)?;
    let mut out: Vec<String> = Vec::with_capacity(raw.lines().count() + 2);
    let mut saw_fs = false;
    let mut saw_res = false;

    for line in raw.lines() {
        if line.starts_with("fullscreen:") {
            saw_fs = true;
            out.push("fullscreen:true".to_string());
        } else if line.starts_with("fullscreenResolution:") {
            saw_res = true;
            out.push(format!("fullscreenResolution:{}", mode));
        } else {
            out.push(line.to_string());
        }
    }
    if !saw_fs {
        out.push("fullscreen:true".to_string());
    }
    if !saw_res {
        out.push(format!("fullscreenResolution:{}", mode));
    }

    std::fs::write(&options, out.join("\n") + "\n")?;
    Ok(())
}
