import { useEffect, useState } from "react";

/** Re-renders every `ms` milliseconds. Returns an incrementing counter. */
export function useTicker(ms: number): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setT((n) => n + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return t;
}

/** Local clock string updated every minute. */
export function useClock(format: "HH:mm" | "HH:mm:ss" = "HH:mm"): string {
  const tick = useTicker(format === "HH:mm:ss" ? 1000 : 30_000);
  const d = new Date();
  void tick;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (format === "HH:mm:ss") {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
