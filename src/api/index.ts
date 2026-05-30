// Thin typed wrappers around Tauri's invoke().
// Every backend command appears here exactly once — UI components never
// touch `invoke` directly.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Account,
  AppInfo,
  GameLog,
  NewsEntry,
  ProgressEvent,
  ServerGate,
  ServerStatus,
  Settings,
  StatusEvent,
  UpdateCheck,
  UpdateError,
  UpdateReport,
  UsernameAvailability,
} from "@/types";

// ─── Commands ────────────────────────────────────────────────────────────

export const api = {
  appInfo: () => invoke<AppInfo>("get_app_info"),

  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (s: Settings) => invoke<Settings>("save_settings", { newSettings: s }),
  pickInstallDir: () => invoke<string | null>("pick_install_dir"),

  checkUpdate: () => invoke<UpdateCheck>("check_update"),
  runUpdate: () => invoke<UpdateReport>("run_update"),

  launchGame: (accountId: string) =>
    invoke<number>("launch_game", { args: { account_id: accountId } }),
  stopGame: () => invoke<void>("stop_game"),

  getNews: () => invoke<NewsEntry[]>("get_news"),
  getServerStatus: () => invoke<ServerStatus>("get_server_status"),
  getServerGate: () => invoke<ServerGate>("get_server_gate"),

  listAccounts: () => invoke<Account[]>("list_accounts"),
  addOfflineAccount: (
    username: string,
    email?: string | null,
    enforceUnique = true,
  ) =>
    invoke<Account>("add_offline_account", {
      args: { username, email: email ?? null, enforce_unique: enforceUnique },
    }),
  checkMcUsername: (username: string) =>
    invoke<UsernameAvailability>("check_mc_username", { args: { username } }),
  removeAccount: (id: string) => invoke<void>("remove_account", { id }),
  setActiveAccount: (id: string) => invoke<void>("set_active_account", { id }),

  openInstallDir: () => invoke<void>("open_install_dir"),

  pickSkinFile: () => invoke<string | null>("pick_skin_file"),
  importSkin: (accountId: string, sourcePath: string) =>
    invoke<{
      stored_path: string;
      remote_url: string | null;
      skin_command: string | null;
    }>("import_skin", {
      args: { account_id: accountId, source_path: sourcePath },
    }),
  getSkinPath: (accountId: string) =>
    invoke<string | null>("get_skin_path", { args: { account_id: accountId } }),
  getSkinDataUrl: (accountId: string) =>
    invoke<string | null>("get_skin_data_url", { args: { account_id: accountId } }),

  adminGetConfig: () => invoke<Record<string, unknown>>("admin_get_config"),
  adminClearCache: () => invoke<string[]>("admin_clear_cache"),
};

// ─── Events ──────────────────────────────────────────────────────────────

export const events = {
  onStatus: (cb: (e: StatusEvent) => void): Promise<UnlistenFn> =>
    listen<StatusEvent>("update:status", (e) => cb(e.payload)),
  onProgress: (cb: (e: ProgressEvent) => void): Promise<UnlistenFn> =>
    listen<ProgressEvent>("update:progress", (e) => cb(e.payload)),
  onUpdateComplete: (cb: (e: { version: string; files_changed: number }) => void) =>
    listen<{ version: string; files_changed: number }>("update:complete", (e) => cb(e.payload)),
  onUpdateError: (cb: (e: UpdateError) => void) =>
    listen<UpdateError>("update:error", (e) => cb(e.payload)),

  onGameStarted: (cb: (e: { pid: number }) => void) =>
    listen<{ pid: number }>("game:started", (e) => cb(e.payload)),
  onGameJoined: (cb: () => void) =>
    listen<unknown>("game:joined", () => cb()),
  onGameStopped: (cb: (e: { exit_code: number }) => void) =>
    listen<{ exit_code: number }>("game:stopped", (e) => cb(e.payload)),
  onGameLog: (cb: (e: GameLog) => void) =>
    listen<GameLog>("game:log", (e) => cb(e.payload)),
};

// ─── Utility ─────────────────────────────────────────────────────────────

export function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log10(n) / 3));
  const v = n / Math.pow(1000, i);
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`;
}
