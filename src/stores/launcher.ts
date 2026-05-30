import { create } from "zustand";
import type {
  Account,
  AppInfo,
  ProgressEvent,
  ServerGate,
  ServerStatus,
  Settings,
  StatusEvent,
  UpdateCheck,
} from "@/types";

export type LauncherPhase =
  | "idle"
  | "checking"
  | "ready"
  | "updating"
  | "launching"
  | "running"
  | "error";

interface LauncherState {
  // Static info
  appInfo: AppInfo | null;
  setAppInfo: (info: AppInfo) => void;

  // Phase machine
  phase: LauncherPhase;
  setPhase: (p: LauncherPhase) => void;

  // Update info
  check: UpdateCheck | null;
  setCheck: (c: UpdateCheck | null) => void;

  status: StatusEvent | null;
  setStatus: (s: StatusEvent | null) => void;

  progress: ProgressEvent | null;
  setProgress: (p: ProgressEvent | null) => void;

  error: string | null;
  setError: (e: string | null) => void;

  // Server
  serverStatus: ServerStatus | null;
  setServerStatus: (s: ServerStatus | null) => void;

  gate: ServerGate | null;
  setGate: (g: ServerGate | null) => void;

  /** Connection-failure modal shown after retries are exhausted. */
  patience: boolean;
  setPatience: (v: boolean) => void;

  /** Retry counter for connection-failure auto-retry. Reset on each Play. */
  retries: number;
  setRetries: (n: number) => void;

  /** True while the launcher's "Connexion à la station" overlay covers MC. */
  connecting: boolean;
  setConnecting: (v: boolean) => void;
  /** 0-based attempt counter — shows "Tentative N/3" in the overlay. */
  connectAttempt: number;
  setConnectAttempt: (n: number) => void;

  // Accounts
  accounts: Account[];
  setAccounts: (a: Account[]) => void;
  activeAccount: () => Account | null;

  // Settings
  settings: Settings | null;
  setSettings: (s: Settings) => void;
}

export const useLauncher = create<LauncherState>((set, get) => ({
  appInfo: null,
  setAppInfo: (info) => set({ appInfo: info }),

  phase: "idle",
  setPhase: (phase) => set({ phase }),

  check: null,
  setCheck: (check) => set({ check }),

  status: null,
  setStatus: (status) => set({ status }),

  progress: null,
  setProgress: (progress) => set({ progress }),

  error: null,
  setError: (error) => set({ error }),

  serverStatus: null,
  setServerStatus: (serverStatus) => set({ serverStatus }),

  gate: null,
  setGate: (gate) => set({ gate }),

  patience: false,
  setPatience: (patience) => set({ patience }),

  retries: 0,
  setRetries: (retries) => set({ retries }),

  connecting: false,
  setConnecting: (connecting) => set({ connecting }),
  connectAttempt: 0,
  setConnectAttempt: (connectAttempt) => set({ connectAttempt }),

  accounts: [],
  setAccounts: (accounts) => set({ accounts }),
  activeAccount: () => get().accounts.find((a) => a.active) ?? null,

  settings: null,
  setSettings: (settings) => set({ settings }),
}));
