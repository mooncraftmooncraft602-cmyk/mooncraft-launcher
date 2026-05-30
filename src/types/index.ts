// Mirrors the Serialize-derived structs in src-tauri/src.
// Keep in sync manually until we wire up tauri-specta or ts-rs.

export type Phase = "check" | "download" | "verify" | "launch";

export interface AppInfo {
  name: string;
  version: string;
  install_dir: string;
  instance_dir: string;
  os: string;
}

export interface Settings {
  ram_min_mb: number;
  ram_max_mb: number;
  window_width: number;
  window_height: number;
  fullscreen: boolean;
  java_path: string | null;
  install_dir: string | null;
  auto_join_host: string | null;
  auto_join_port: number;
  close_launcher_on_play: boolean;
}

export interface UpdateCheck {
  current_version: string | null;
  remote_version: string;
  changelog: string | null;
  needs_update: boolean;
  bytes_to_download: number;
  files_to_download: number;
  files_to_remove: number;
}

export interface UpdateReport {
  version: string;
  files_downloaded: number;
  files_removed: number;
  bytes_downloaded: number;
  duration_ms: number;
}

export interface ProgressEvent {
  current_file: string;
  bytes_done: number;
  bytes_total: number;
  files_done: number;
  files_total: number;
  speed_bps: number;
}

export interface StatusEvent {
  phase: Phase;
  message: string;
}

export interface UpdateError {
  message: string;
  recoverable: boolean;
}

export type AccountKind = "offline" | "microsoft";

export interface Account {
  id: string;
  username: string;
  uuid: string;
  kind: AccountKind;
  access_token?: string;
  /** Contact email saved with the account (local only). */
  email?: string | null;
  active: boolean;
}

export interface UsernameAvailability {
  available: boolean;
  owned_by_uuid?: string | null;
  invalid_format: boolean;
}

export interface NewsEntry {
  id: string;
  title: string;
  subtitle: string | null;
  body: string;
  image: string | null;
  tag: string | null;
  published_at: string;
}

export interface ServerStatus {
  online: boolean;
  players_online: number;
  players_max: number;
  version: string;
  motd: string;
  latency_ms: number;
}

export interface ServerGate {
  /** false = launcher refuses to launch Minecraft */
  open: boolean;
  reason?: string | null;
  estimated_reopen?: string | null;
  banner?: string | null;
}

export interface GameLog {
  line: string;
  level: "info" | "warn" | "error";
  source: "stdout" | "stderr";
}

export interface BackendError {
  message: string;
  kind: string;
}
