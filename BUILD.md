# Build & Run

## Prerequisites

| Tool          | Version           | Why                        |
|---------------|-------------------|----------------------------|
| Node.js       | ≥ 20              | Vite + Tauri CLI           |
| Rust          | stable, ≥ 1.75    | Backend                    |
| Tauri 2 deps  | see below         | OS-specific webview build  |

**Windows**: install Microsoft Edge WebView2 runtime (preinstalled on Win11
and most Win10 builds) and the "Desktop development with C++" workload in
Visual Studio Build Tools.

**macOS**: `xcode-select --install`.

**Linux**: `sudo apt install libwebkit2gtk-4.1-dev libssl-dev pkg-config build-essential curl wget file libxdo-dev libsoup-3.0-dev`.

## Icons (required for `tauri build`)

Drop these files into `src-tauri/icons/` before bundling — Tauri's
icon-generator can produce all of them from a single 1024×1024 PNG:

```bash
npx @tauri-apps/cli icon path/to/moon-logo.png
```

The required outputs are: `32x32.png`, `128x128.png`, `128x128@2x.png`,
`icon.ico` (Windows), `icon.icns` (macOS).

## First-time setup

```bash
# 1. Install JS deps
npm install

# 2. Verify the rust toolchain can build the backend
cd src-tauri && cargo check && cd ..
```

## Dev loop

```bash
npm run tauri dev
```

- Vite serves the UI on `http://localhost:1420`.
- Tauri wraps it in the desktop window and reloads Rust on save.
- The first build of `src-tauri` takes a few minutes — subsequent builds are seconds.

## Production bundle

```bash
npm run tauri build
```

Artifacts:
- Windows: `src-tauri/target/release/bundle/msi/MoonCraft Launcher_*.msi`
- macOS:   `src-tauri/target/release/bundle/dmg/MoonCraft Launcher_*.dmg`
- Linux:   `src-tauri/target/release/bundle/appimage/mooncraft-launcher_*.AppImage`

## Overriding the manifest URL at build time

```bash
MOONCRAFT_MANIFEST_URL=https://cdn.example.com/manifest.json \
MOONCRAFT_NEWS_URL=https://cdn.example.com/news.json \
MOONCRAFT_SERVER_HOST=play.example.com \
  npm run tauri build
```

These are picked up by `src-tauri/src/config.rs` via `option_env!`.
