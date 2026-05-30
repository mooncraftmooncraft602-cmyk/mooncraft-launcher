import { create } from "zustand";

export type ToastKind = "info" | "success" | "warn" | "error" | "transmission";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  duration: number; // ms; 0 = sticky
}

interface ToastsState {
  items: Toast[];
  push: (t: Omit<Toast, "id" | "duration"> & { duration?: number }) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

let nextId = 1;

export const useToasts = create<ToastsState>((set) => ({
  items: [],
  push: (t) => {
    const id = nextId++;
    const toast: Toast = { duration: 4200, ...t, id };
    set((s) => ({ items: [...s.items, toast] }));
    if (toast.duration > 0) {
      setTimeout(() => {
        set((s) => ({ items: s.items.filter((x) => x.id !== id) }));
      }, toast.duration);
    }
    return id;
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
  clear: () => set({ items: [] }),
}));

/** Convenience helpers — same signature as the previous code expected. */
export const toast = {
  info:    (title: string, body?: string) => useToasts.getState().push({ kind: "info",    title, body }),
  success: (title: string, body?: string) => useToasts.getState().push({ kind: "success", title, body }),
  warn:    (title: string, body?: string) => useToasts.getState().push({ kind: "warn",    title, body }),
  error:   (title: string, body?: string) => useToasts.getState().push({ kind: "error",   title, body, duration: 7000 }),
  transmission: (title: string, body?: string) =>
    useToasts.getState().push({ kind: "transmission", title, body }),
};
