# 🏛️ MoonCraft Launcher — Architecture

## Overview

The launcher is split in two halves wired together by Tauri's IPC bridge:

```
┌─────────────────────────────────────────────────────────────┐
│                  React 18 + TypeScript UI                   │
│      (screens · components · stores · framer-motion)        │
└──────────────────────────┬──────────────────────────────────┘
                           │  invoke()  · listen()
┌──────────────────────────▼──────────────────────────────────┐
│                    Rust async backend                       │
│  ┌────────┐ ┌─────────┐ ┌──────────┐ ┌────────┐ ┌────────┐  │
│  │updater │ │download │ │minecraft │ │ fabric │ │  java  │  │
│  └────────┘ └─────────┘ └──────────┘ └────────┘ └────────┘  │
│  ┌────────┐ ┌─────────┐ ┌──────────┐ ┌────────┐             │
│  │  auth  │ │settings │ │   api    │ │ utils  │             │
│  └────────┘ └─────────┘ └──────────┘ └────────┘             │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
              Local install · HTTPS manifests · GitHub
```

## Repo layout

```
mooncraft-launcher/
├── package.json                # Frontend deps + tauri scripts
├── vite.config.ts              # Vite + tauri integration
├── tsconfig.json
├── index.html
├── examples/
│   └── manifest.json           # Reference modpack manifest
│
├── src/                        # ── React frontend ──
│   ├── main.tsx
│   ├── App.tsx
│   ├── api/                    # Thin tauri invoke wrappers
│   ├── components/             # UI primitives
│   │   ├── StarField/          # Animated background
│   │   ├── TitleBar/
│   │   ├── Sidebar/
│   │   ├── PlayButton/
│   │   ├── ProgressBar/
│   │   ├── NewsCard/
│   │   └── ServerStatus/
│   ├── screens/                # Routed views
│   │   ├── Home/
│   │   ├── News/
│   │   ├── Settings/
│   │   └── Account/
│   ├── hooks/                  # useUpdateProgress, useSettings…
│   ├── stores/                 # Zustand stores
│   ├── styles/                 # Global CSS, theme tokens
│   └── types/                  # Shared TS types (mirror Rust)
│
└── src-tauri/                  # ── Rust backend ──
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── build.rs
    └── src/
        ├── main.rs             # Tauri bootstrap
        ├── lib.rs              # App entry, command registration
        ├── error.rs            # Unified Result/Error
        ├── state.rs            # AppState (paths, settings, channels)
        ├── commands.rs         # #[tauri::command] surface
        ├── config.rs           # Constants (manifest URL, version)
        │
        ├── updater/            # ── Smart patch system ──
        │   ├── mod.rs
        │   ├── manifest.rs     # Fetch + parse manifest.json
        │   ├── diff.rs         # SHA-256 compare local vs remote
        │   └── rollback.rs     # Snapshot & restore on failure
        │
        ├── downloader/         # ── Download engine ──
        │   ├── mod.rs
        │   ├── queue.rs        # Tokio semaphore parallel queue
        │   └── integrity.rs    # Streaming SHA-256 + resume
        │
        ├── minecraft/          # ── Vanilla MC pipeline ──
        │   ├── mod.rs
        │   ├── instance.rs     # Per-server isolated .minecraft
        │   ├── launcher.rs     # JVM args + Process::spawn
        │   └── assets.rs       # Vanilla version manifest, libs, assets
        │
        ├── fabric/             # ── Fabric loader installer ──
        │   ├── mod.rs
        │   └── installer.rs
        │
        ├── java/               # ── JVM management ──
        │   ├── mod.rs
        │   └── detector.rs
        │
        ├── auth/               # ── Account management ──
        │   ├── mod.rs
        │   └── offline.rs      # Microsoft auth = TODO milestone 2
        │
        ├── settings/           # ── Persisted config ──
        │   ├── mod.rs
        │   └── store.rs
        │
        ├── api/                # ── Remote content ──
        │   ├── mod.rs
        │   ├── news.rs
        │   └── status.rs       # Minecraft server ping
        │
        └── utils/
            ├── mod.rs
            ├── hash.rs         # SHA-256 helpers (file + buffer)
            └── paths.rs        # OS-aware install dirs
```

## Mapping to the requested architecture

The user spec listed `launcher-ui`, `launcher-core`, `updater`, `downloader`,
`minecraft`, `auth`, `cache`, `assets`, `settings`, `api`. We keep that
conceptual split but flatten it into Tauri's native two-folder layout:

| Conceptual    | Actual                                |
|---------------|---------------------------------------|
| launcher-ui   | `src/`                                |
| launcher-core | `src-tauri/src/{lib.rs, commands.rs, state.rs}` |
| updater       | `src-tauri/src/updater/`              |
| downloader    | `src-tauri/src/downloader/`           |
| minecraft     | `src-tauri/src/minecraft/`            |
| auth          | `src-tauri/src/auth/`                 |
| cache         | OS cache dir, helpers in `utils/paths.rs` |
| assets        | `src/assets/` (UI) + runtime MC assets handled by `minecraft/assets.rs` |
| settings      | `src-tauri/src/settings/`             |
| api           | `src-tauri/src/api/`                  |

This keeps `tauri dev` / `tauri build` working out of the box — splitting
across separate crates would require a workspace and break the default tauri
CLI scaffolding for marginal gain.

## Data flow: a launch click

```
[user clicks Play]
       │
       ▼
invoke("launch")
       │
       ▼
updater::run()
   ├── manifest::fetch()          ← HTTPS GET manifest.json
   ├── diff::compute()            ← SHA-256 each local file
   ├── rollback::snapshot()       ← create transactional checkpoint
   ├── downloader::queue.run()    ← parallel HTTPS GET, emit progress events
   ├── diff::cleanup_stale()      ← rm files no longer in manifest
   └── rollback::commit()         ← drop snapshot
       │
       ▼
java::ensure()                    ← detect or download JRE
fabric::ensure()                  ← install loader for declared MC version
minecraft::assets::ensure()       ← vanilla libs + asset index + objects
minecraft::launcher::spawn()      ← build JVM args, child process
       │
       ▼
emit("game-started")              ← UI hides, monitors stdout
```

## Events emitted to UI

All backend → UI events use Tauri's event bus.

| Event              | Payload                                              |
|--------------------|------------------------------------------------------|
| `update:status`    | `{ phase: "check" | "download" | "verify", message }`|
| `update:progress`  | `{ current, total, file, speed_bps }`                |
| `update:complete`  | `{ version, files_changed }`                         |
| `update:error`     | `{ message, recoverable }`                           |
| `game:started`     | `{ pid }`                                            |
| `game:stopped`     | `{ exit_code }`                                      |
| `game:log`         | `{ line, level }`                                    |

## Security notes

- All manifest fetches require HTTPS (compile-time check, not runtime).
- Every downloaded file is hashed with SHA-256 against the manifest entry
  before being moved into place (write-temp → fsync → rename).
- The launcher never executes content from the manifest other than the JVM
  it spawns with explicit, locally-built argv.
- Microsoft auth (milestone 2) uses MSAL device-code flow, tokens stored in
  the OS keychain via `keyring` crate.
