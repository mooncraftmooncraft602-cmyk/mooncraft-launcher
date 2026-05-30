# 🗺️ MoonCraft Launcher — Roadmap

## ✅ Milestone 1 — Core launcher (this repo)

- [x] Tauri 2 + React 18 + TypeScript scaffold
- [x] Cyan/violet holographic theme + animated starfield
- [x] Manifest fetch + SHA-256 diff
- [x] Parallel downloader with resume + retry
- [x] Rollback / atomic apply
- [x] Fabric installer
- [x] Java auto-detection
- [x] Offline auth (username only)
- [x] Settings persistence (RAM, resolution, install dir, java path)
- [x] News + server status feeds
- [x] Home / News / Settings screens

## 🚧 Milestone 2 — Production hardening

- [ ] Microsoft auth (MSAL device-code flow)
- [ ] Keyring-backed token storage
- [ ] Java auto-download (Adoptium / Azul Zulu)
- [ ] Detailed per-file progress UI
- [ ] Speed limiter (kb/s) in settings
- [ ] Background pre-download of next pending update
- [ ] Discord Rich Presence integration
- [ ] Crash log uploader → opt-in
- [ ] Auto-update of the launcher itself (Tauri updater plugin)

## 🌌 Milestone 3 — Premium experience

- [ ] Mod browser (Modrinth API) for optional mods
- [ ] Shader picker (Iris) with screenshots
- [ ] Resource pack store
- [ ] In-launcher screenshot gallery
- [ ] Achievement / playtime tracker
- [ ] Friends list + party invites (Discord bridge)
- [ ] Multi-instance support (test/prod profiles)
- [ ] Streaming overlay for OBS

## 🛰️ Milestone 4 — Server-side tools

- [ ] CLI to build & sign manifests from a directory
- [ ] GitHub Action: `mooncraft-manifest@v1` to publish on release
- [ ] Diff preview tool for staff (what will players download next update?)
- [ ] CDN warm-up + cache-bust strategy
- [ ] Telemetry dashboard (success rate, average download time, failures)

## ⏳ Wishlist

- [ ] Linux AppImage + macOS DMG bundles
- [ ] ARM64 native builds
- [ ] Plugin SDK for community widgets in the launcher home
- [ ] Localization (FR / EN / ES / DE)
