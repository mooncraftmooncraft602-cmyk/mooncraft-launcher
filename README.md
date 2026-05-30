# 🌙 MoonCraft Launcher

> A premium space-themed launcher for the **MoonCraft** modded Minecraft server.
> Built with **Tauri 2**, **Rust**, **React 18** and **TypeScript**.

![status](https://img.shields.io/badge/status-alpha-7c3aed)
![tauri](https://img.shields.io/badge/tauri-2.x-24c8db)
![rust](https://img.shields.io/badge/rust-stable-orange)
![license](https://img.shields.io/badge/license-MIT-cyan)

---

## ✨ Features

- 🛰️ **Smart Patch System** — SHA-256 diff, only downloads changed files
- ⚡ **Parallel Downloader** — multi-thread, resume on disconnect, retry, integrity check
- 🪐 **Fabric Auto-Install** — pulls Fabric loader + Minecraft client + libraries + assets
- ☕ **Java Runtime Manager** — auto-detects JVM, falls back to Adoptium download
- 🔄 **Rollback System** — atomic updates with snapshot/restore on failure
- 📰 **News + Server Status** — remote JSON-driven content
- ⚙️ **Settings** — RAM, resolution, Java path, fullscreen, install dir
- 🎨 **Holographic UI** — cyan/violet neons, animated starfield, glassmorphism panels
- 🔐 **Security** — SHA-256 mandatory, HTTPS-only manifests, atomic writes

## 🧰 Stack

| Layer       | Tech                                         |
|-------------|----------------------------------------------|
| Frontend    | React 18 · TypeScript · Vite · Framer Motion |
| Backend     | Rust · Tokio · Reqwest · Serde · SHA2        |
| Shell       | Tauri 2.x (WebView2 on Windows, WKWebView on macOS) |
| Distribution| GitHub Releases · HTTP static manifest       |

## 📦 Quick Start

```bash
# install dependencies
npm install

# install rust toolchain (once)
# https://www.rust-lang.org/tools/install

# install tauri CLI
npm install -D @tauri-apps/cli

# dev mode (hot-reload UI + rebuild rust on change)
npm run tauri dev

# production build
npm run tauri build
```

The bundled installer lands in `src-tauri/target/release/bundle/`.

## 🌐 Hosting your manifest

The launcher fetches a `manifest.json` over HTTPS at startup. Two recommended
delivery modes:

### Mode A — GitHub Releases (recommended)

```
https://github.com/<org>/mooncraft-client/releases/latest/download/manifest.json
```

Upload `manifest.json` + every modpack file as release assets. Public repo =
free CDN.

### Mode B — Static HTTP

Any S3 / R2 / nginx / Vercel works. Configure the URL in
`src-tauri/src/config.rs` (`MANIFEST_URL` constant) or override at runtime
via the in-app settings.

See [`examples/manifest.json`](examples/manifest.json) for a complete sample.

## 📁 Project layout

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full module map.

## 🗺️ Roadmap

See [`ROADMAP.md`](ROADMAP.md).

## 📜 License

MIT — go nuts, just don't break the moon.
