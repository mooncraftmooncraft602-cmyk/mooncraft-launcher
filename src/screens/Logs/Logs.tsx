import { useEffect, useMemo, useRef, useState } from "react";
import { useLogs } from "@/stores/logs";
import { toast } from "@/stores/toasts";
import { play } from "@/utils/sounds";
import "./Logs.css";

const LEVELS = ["all", "info", "warn", "error"] as const;
type Level = (typeof LEVELS)[number];

export function Logs() {
  const lines = useLogs((s) => s.lines);
  const clear = useLogs((s) => s.clear);
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<Level>("all");
  const [follow, setFollow] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((l) => {
      if (level !== "all" && l.level !== level) return false;
      if (q && !l.line.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [lines, search, level]);

  useEffect(() => {
    if (!follow) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [filtered, follow]);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(filtered.map((l) => l.line).join("\n"));
      play("success");
      toast.success("Copié", `${filtered.length} ligne(s) dans le presse-papier.`);
    } catch {
      toast.error("Copie impossible");
    }
  };

  const download = () => {
    const blob = new Blob([filtered.map((l) => l.line).join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mooncraft-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.log`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    play("success");
    toast.success("Logs exportés");
  };

  return (
    <div className="logs-screen">
      <header className="logs-screen__head">
        <div>
          <h1>Journal de mission</h1>
          <p>Sortie stdout / stderr du processus Minecraft, en direct.</p>
        </div>
        <div className="logs-screen__actions">
          <button type="button" className="logs-btn" onClick={copyAll}>📋 Copier</button>
          <button type="button" className="logs-btn" onClick={download}>⤓ Exporter</button>
          <button
            type="button"
            className="logs-btn logs-btn--danger"
            onClick={() => { clear(); play("close"); }}
          >
            ✕ Effacer
          </button>
        </div>
      </header>

      <div className="logs-controls">
        <div className="logs-search">
          <span aria-hidden>⌕</span>
          <input
            type="search"
            placeholder="Filtrer une ligne…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="logs-levels">
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              className={`logs-chip logs-chip--${l} ${level === l ? "is-active" : ""}`}
              onClick={() => setLevel(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <label className="logs-follow">
          <input
            type="checkbox"
            checked={follow}
            onChange={(e) => setFollow(e.target.checked)}
          />
          Suivre en direct
        </label>
        <span className="logs-count num">{filtered.length} / {lines.length}</span>
      </div>

      <div className="logs-stream" ref={scrollRef}>
        {filtered.length === 0 && (
          <div className="logs-empty">
            {lines.length === 0
              ? "Aucune sortie pour l'instant. Lance le jeu pour démarrer la transmission."
              : "Aucune ligne ne correspond aux filtres."}
          </div>
        )}
        {filtered.map((l, i) => (
          <div key={i} className={`logs-line logs-line--${l.level}`}>
            <span className="logs-line__src">{l.source}</span>
            <span className="logs-line__txt">{l.line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
