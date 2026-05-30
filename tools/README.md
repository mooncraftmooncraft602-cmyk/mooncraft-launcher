# 🛰️ MoonCraft publishing tools

End-to-end recipe to push a modpack to your players.

## TL;DR

```powershell
# 1. Build manifest + mirror folder from your local modpack
.\tools\publish.ps1 `
  -Source   "C:\Users\PC\AppData\Roaming\.minecraft" `
  -BaseUrl  "https://github.com/mooncraftmooncraft602-cmyk/client/releases/latest/download" `
  -Version  "1.0.0" `
  -Minecraft "1.21.1" `
  -Fabric    "0.16.5" `
  -Java      21 `
  -Changelog "Season 01 launch"

# 2. Push to GitHub Releases (free CDN)
.\tools\push-release.ps1 -Repo "mooncraftmooncraft602-cmyk/client" -Version "1.0.0"

# 3. Configure the launcher (one-time)
$env:MOONCRAFT_MANIFEST_URL = "https://github.com/mooncraftmooncraft602-cmyk/client/releases/latest/download/manifest.json"
$env:MOONCRAFT_SERVER_HOST  = "82.41.119.16"
npm run tauri build
```

That's it. The launcher will:
- fetch your manifest on startup
- SHA-256 diff the player's local files
- download only what's missing or changed
- install Fabric + Java automatically
- **auto-connect to `82.41.119.16` when they click Play**

---

## Detailed flow

### Step 1 — Prepare your modpack locally

In a clean `.minecraft`-style folder, drop only the files you want managed:

```
my-modpack/
├── mods/                   ← every .jar mod
│   ├── fabric-api-X.jar
│   └── mooncore-1.0.jar
├── config/                 ← every mod config you want forced on players
│   └── mooncore.toml
├── resourcepacks/          ← packs auto-installed
├── shaderpacks/
└── kubejs/                 ← optional, if you ship KubeJS scripts
```

**Don't include** `saves/`, `logs/`, `crash-reports/`, `screenshots/`,
`libraries/`, `assets/`, `versions/` — these are either per-player
state or managed by the launcher's vanilla pipeline. `publish.ps1`
already excludes them.

### Step 2 — Generate the manifest

```powershell
.\tools\publish.ps1 `
  -Source   "C:\path\to\my-modpack" `
  -BaseUrl  "https://github.com/mooncraftmooncraft602-cmyk/client/releases/latest/download" `
  -Version  "1.0.0" `
  -Minecraft "1.21.1" `
  -Fabric    "0.16.5" `
  -Java      21 `
  -Changelog "Welcome to Season 01"
```

Output in `.\dist\`:
- `manifest.json` — the file the launcher reads
- a mirror of every modpack file (paths exactly match `manifest.path`)

The manifest looks like:
```json
{
  "version":   "1.0.0",
  "minecraft": "1.21.1",
  "fabric":    "0.16.5",
  "java":      21,
  "changelog": "Welcome to Season 01",
  "files": [
    {
      "path":   "mods/fabric-api-0.103.0.jar",
      "url":    "https://github.com/mooncraftmooncraft602-cmyk/client/releases/latest/download/mods/fabric-api-0.103.0.jar",
      "sha256": "abc…",
      "size":   2400000
    }
  ]
}
```

### Step 3 — Host the files

#### Option A — GitHub Releases (recommended)

```powershell
# Install GitHub CLI once
winget install GitHub.cli
gh auth login

# Publish dist as a release
.\tools\push-release.ps1 -Repo "mooncraftmooncraft602-cmyk/client" -Version "1.0.0"
```

`gh release create` uploads every file under `dist/` to the release.
The "latest" alias means:
- `https://github.com/mooncraftmooncraft602-cmyk/client/releases/latest/download/manifest.json`
- `https://github.com/mooncraftmooncraft602-cmyk/client/releases/latest/download/mods/foo.jar`

When you push v1.0.1, players auto-update without you redeploying the launcher.

#### Option B — Static HTTP (S3, R2, nginx, Vercel…)

Just upload the contents of `dist/` preserving directory structure to your bucket.
The `BaseUrl` you passed to `publish.ps1` must match the public URL of `manifest.json`'s parent.

### Step 4 — Wire the launcher to your URLs

Two ways to configure:

#### A. Build-time env vars (best for prod)

```powershell
$env:MOONCRAFT_MANIFEST_URL = "https://github.com/mooncraftmooncraft602-cmyk/client/releases/latest/download/manifest.json"
$env:MOONCRAFT_NEWS_URL     = "https://github.com/mooncraftmooncraft602-cmyk/client/releases/latest/download/news.json"
$env:MOONCRAFT_SERVER_HOST  = "82.41.119.16"
npm run tauri build
```

Hands you a single .exe / .msi to ship.

#### B. Edit `src-tauri/src/config.rs` directly

```rust
pub const MANIFEST_URL: &str = "https://github.com/mooncraftmooncraft602-cmyk/client/releases/latest/download/manifest.json";
pub const SERVER_HOST:  &str = "82.41.119.16";
pub const SERVER_PORT:  u16  = 25565;
```

Then `npm run tauri build`.

---

## Auto-join confirmation

The auto-join is **already wired** in [src-tauri/src/minecraft/launcher.rs](../src-tauri/src/minecraft/launcher.rs).
When the player clicks **Play**, the launch arguments include:

```
--server 82.41.119.16 --port 25565
```

Minecraft connects to the server straight from the main menu — no
"Multiplayer → Add Server" detour. The host/port are read from the
user's settings (defaulting to `config::SERVER_HOST` / `SERVER_PORT`),
so players can override per-machine in the Systems tab.

To disable auto-join globally, set `auto_join_host = null` in the
settings UI (or in `~/.config/MoonCraft/settings.json`).

---

## Updating a published modpack

```powershell
# Bump version in your tag
.\tools\publish.ps1 -Source ... -Version "1.0.1" -BaseUrl "...releases/latest/download" ...
.\tools\push-release.ps1 -Repo "mooncraftmooncraft602-cmyk/client" -Version "1.0.1"
```

Next time players launch:
- Launcher fetches the latest manifest (now v1.0.1)
- Diffs against their installed v1.0.0
- Downloads only the files whose SHA-256 changed
- Removes stale files (e.g. a mod you ripped out)
- Rolls back atomically if anything fails mid-update
