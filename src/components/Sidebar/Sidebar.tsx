import { useRef, useState } from "react";
import type { Route } from "@/App";
import { useLauncher } from "@/stores/launcher";
import { useLogs } from "@/stores/logs";
import { Avatar } from "@/components/Avatar/Avatar";
import { play } from "@/utils/sounds";
import "./Sidebar.css";

interface Props {
  current: Route;
  onNavigate: (r: Route) => void;
  onAdminOpen: () => void;
}

const NAV: Array<{ id: Route; label: string; icon: string; tip: string }> = [
  {
    id: "home",
    label: "Mission",
    tip: "Lancer le jeu",
    icon: "M3 12 12 4l9 8M5 10v9h14v-9",
  },
  {
    id: "news",
    label: "Comms",
    tip: "Actualités du serveur",
    icon: "M3 6h18M3 12h18M3 18h12",
  },
  {
    id: "account",
    label: "Pilote",
    tip: "Gérer les comptes",
    icon: "M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0",
  },
  {
    id: "logs",
    label: "Journal",
    tip: "Journal de mission",
    icon: "M4 4h12l4 4v12H4zM8 12h8M8 16h8M8 8h5",
  },
  {
    id: "settings",
    label: "Systèmes",
    tip: "Paramètres",
    icon: "M12 9.5A2.5 2.5 0 1112 14.5 2.5 2.5 0 0112 9.5zm6.3 2.5a6.4 6.4 0 00-.1-1.2l2-1.5-2-3.4-2.3.9a6.3 6.3 0 00-2.1-1.2L13.5 3h-3l-.3 2.6a6.3 6.3 0 00-2.1 1.2l-2.3-.9-2 3.4 2 1.5a6.4 6.4 0 000 2.4l-2 1.5 2 3.4 2.3-.9c.6.5 1.3.9 2.1 1.2l.3 2.6h3l.3-2.6a6.3 6.3 0 002.1-1.2l2.3.9 2-3.4-2-1.5c.07-.4.1-.8.1-1.2z",
  },
];

export function Sidebar({ current, onNavigate, onAdminOpen }: Props) {
  const appInfo = useLauncher((s) => s.appInfo);
  const account = useLauncher((s) => s.activeAccount());
  const logLines = useLogs((s) => s.lines.length);

  const clickCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [adminPulse, setAdminPulse] = useState(0);

  const handleVersionClick = () => {
    clickCountRef.current += 1;
    setAdminPulse((n) => n + 1);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      clickCountRef.current = 0;
      setAdminPulse(0);
    }, 2000);
    if (clickCountRef.current >= 5) {
      clickCountRef.current = 0;
      setAdminPulse(0);
      if (timerRef.current) clearTimeout(timerRef.current);
      onAdminOpen();
    }
  };

  const remainingClicks = Math.max(0, 5 - adminPulse);

  return (
    <aside className="sidebar">
      <div className="sidebar__top">
        {/* ── Identity card ── */}
        <button
          type="button"
          className="sidebar__id-card"
          onClick={() => onNavigate("account")}
          title="Ouvrir le profil pilote"
        >
          <Avatar
            accountId={account?.id}
            uuid={account?.uuid}
            username={account?.username ?? "?"}
            size={42}
            active={!!account}
            premium={account?.kind === "microsoft"}
          />
          <div className="sidebar__id-text">
            <div className="sidebar__id-name">
              {account?.username ?? "Aucun pilote"}
            </div>
            <div className="sidebar__id-tag">
              {account
                ? account.kind === "offline"
                  ? "MODE HORS-LIGNE"
                  : account.kind.toUpperCase()
                : "→ Onglet Pilote"}
            </div>
          </div>
          <span className={`sidebar__status-dot ${account ? "is-online" : ""}`} />
        </button>

        {/* ── Navigation ── */}
        <nav className="sidebar__nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`sidebar__nav-btn ${current === item.id ? "is-active" : ""}`}
              onClick={() => onNavigate(item.id)}
              onMouseEnter={() => play("hover")}
              title={item.tip}
            >
              <span className="sidebar__nav-icon" aria-hidden>
                <svg viewBox="0 0 24 24">
                  <path d={item.icon} />
                </svg>
              </span>
              <span className="sidebar__nav-label">{item.label}</span>
              {item.id === "logs" && logLines > 0 && (
                <span className="sidebar__nav-count num" title={`${logLines} ligne(s)`}>
                  {logLines > 999 ? "999+" : logLines}
                </span>
              )}
              <span className="sidebar__nav-active" />
            </button>
          ))}
        </nav>
      </div>

      {/* ── Footer ── */}
      <div className="sidebar__footer">
        <button
          className={`sidebar__build sidebar__build--clickable ${adminPulse > 0 ? "sidebar__build--pulsing" : ""}`}
          onClick={handleVersionClick}
          title={adminPulse > 0 ? `${remainingClicks} clic(s) restant(s)` : "Version"}
        >
          <span className="sidebar__build-label">BUILD</span>
          <span className="sidebar__build-val">v{appInfo?.version ?? "0.0.0"}</span>
        </button>
        <a
          className="sidebar__build sidebar__build--link"
          href="https://discord.gg/kZJRwJ2r"
          target="_blank"
          rel="noreferrer"
        >
          <span className="sidebar__build-label">DISCORD</span>
          <span className="sidebar__build-val">Rejoindre</span>
        </a>
      </div>
    </aside>
  );
}
