import { create } from "zustand";
import type { GameLog } from "@/types";

const MAX_LINES = 2000;

interface LogsState {
  lines: GameLog[];
  push: (l: GameLog) => void;
  clear: () => void;
}

export const useLogs = create<LogsState>((set) => ({
  lines: [],
  push: (l) =>
    set((s) => {
      const next = s.lines.length >= MAX_LINES
        ? [...s.lines.slice(s.lines.length - MAX_LINES + 1), l]
        : [...s.lines, l];
      return { lines: next };
    }),
  clear: () => set({ lines: [] }),
}));
