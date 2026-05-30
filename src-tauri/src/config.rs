//! Compile-time configuration.
//!
//! Override at build time with environment variables:
//! ```text
//! MOONCRAFT_MANIFEST_URL=https://cdn.example/manifest.json cargo build
//! ```

/// Display name used for the install directory.
pub const APP_DISPLAY_NAME: &str = "MoonCraft";

/// Bundle identifier — mirrors `tauri.conf.json`.
pub const APP_IDENTIFIER: &str = "gg.mooncraft.launcher";

/// Remote modpack manifest. **MUST** be HTTPS.
pub const MANIFEST_URL: &str = match option_env!("MOONCRAFT_MANIFEST_URL") {
    Some(v) => v,
    None => "https://github.com/mooncraftmooncraft602-cmyk/mooncraft-neoforge/releases/latest/download/manifest.json",
};

/// Remote news feed.
pub const NEWS_URL: &str = match option_env!("MOONCRAFT_NEWS_URL") {
    Some(v) => v,
    None => "https://github.com/mooncraftmooncraft602-cmyk/mooncraft-neoforge/releases/latest/download/news.json"
};

/// Remote server gate — JSON blob telling the launcher whether the server
/// is open or under maintenance. Admin updates this file on GitHub releases
/// to pause / resume the server for all clients in real time.
pub const GATE_URL: &str = match option_env!("MOONCRAFT_GATE_URL") {
    Some(v) => v,
    None => "https://github.com/mooncraftmooncraft602-cmyk/mooncraft-neoforge/releases/latest/download/gate.json",
};

/// Default Minecraft server host (locked — players cannot override the IP).
pub const SERVER_HOST: &str = "82.41.119.16";
pub const SERVER_PORT: u16 = 26075;

/// Parallel download concurrency.
pub const DOWNLOAD_PARALLELISM: usize = 8;

/// HTTP timeout for a single request, seconds.
pub const HTTP_TIMEOUT_SECS: u64 = 60;

/// User-Agent string sent with every HTTP request.
pub const USER_AGENT: &str = concat!(
    "MoonCraftLauncher/",
    env!("CARGO_PKG_VERSION"),
    " (+https://discord.gg/kZJRwJ2r)"
);
