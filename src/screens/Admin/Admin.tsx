import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/api";
import { useLauncher } from "@/stores/launcher";
import "./Admin.css";

// Admin code — keep this confidential; share only with server staff via private channel.
const ADMIN_CODE = "Mc9xK4!R3pZ7wBq-N8v2JhTl-cMYk@2025";

type AdminSection = "server" | "manifest" | "cache" | "debug";

interface AdminConfig {
  manifest_url: string;
  server_host: string;
  server_port: number;
  version: string;
  install_dir: string;
  instance_dir: string;
  cache_dir: string;
}

interface Props {
  onClose: () => void;
}

/** Mask the server host so even an admin doesn't see the raw IP from the UI.
 *  Keeps the first octet only — enough to confirm "yes, the right server"
 *  without exposing the address. */
function maskHost(host: string | undefined): string {
  if (!host) return "—";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a] = host.split(".");
    return `${a}.•••.•••.•••`;
  }
  // Hostname: keep TLD-ish suffix, mask the rest.
  const parts = host.split(".");
  if (parts.length < 2) return "•••";
  return `•••.${parts.slice(-1)[0]}`;
}

export function Admin({ onClose }: Props) {
  const [unlocked, setUnlocked] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [section, setSection] = useState<AdminSection>("server");
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [clearResult, setClearResult] = useState<string[] | null>(null);
  const [clearing, setClearing] = useState(false);
  const [settings] = [useLauncher((s) => s.settings)];
  const serverStatus = useLauncher((s) => s.serverStatus);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!unlocked) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [unlocked]);

  useEffect(() => {
    if (unlocked) {
      api.adminGetConfig().then((c) => setConfig(c as unknown as AdminConfig)).catch(console.error);
    }
  }, [unlocked]);

  const tryUnlock = () => {
    if (code === ADMIN_CODE) {
      setUnlocked(true);
      setCodeError(false);
    } else {
      setCodeError(true);
      setCode("");
      setTimeout(() => setCodeError(false), 1200);
    }
  };

  const handleClearCache = async () => {
    if (!confirm("Wipe all modpack files? Players will re-download everything next launch.")) return;
    setClearing(true);
    setClearResult(null);
    try {
      const result = await api.adminClearCache();
      setClearResult(result);
    } catch (e: any) {
      setClearResult([`Error: ${e?.message ?? String(e)}`]);
    } finally {
      setClearing(false);
    }
  };

  const SECTIONS: Array<{ id: AdminSection; label: string; icon: string }> = [
    { id: "server", label: "Serveur", icon: "M5 12h14M12 5l7 7-7 7" },
    { id: "manifest", label: "Manifest", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
    { id: "cache", label: "Cache", icon: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" },
    { id: "debug", label: "Debug", icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" },
  ];

  return (
    <div className="admin-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        className="admin-phone"
        initial={{ scale: 0.92, opacity: 0, y: 40 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 40 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Phone status bar */}
        <div className="admin-phone__bar">
          <span className="admin-phone__bar-dot" />
          <span className="admin-phone__bar-title">ADMIN CONSOLE</span>
          <button className="admin-phone__bar-close" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        <AnimatePresence mode="wait">
          {!unlocked ? (
            <motion.div
              key="lock"
              className="admin-lock"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="admin-lock__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <p className="admin-lock__label">Code administrateur</p>
              <p className="admin-lock__hint">Réservé au staff du serveur</p>
              <input
                ref={inputRef}
                className={`admin-lock__input ${codeError ? "is-error" : ""}`}
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
                placeholder="Entrer le code d'accès"
                autoComplete="off"
                spellCheck={false}
              />
              {codeError && (
                <div className="admin-lock__error">Code incorrect</div>
              )}
              <button
                className="admin-lock__btn"
                onClick={tryUnlock}
                disabled={!code}
              >
                Déverrouiller
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="panel"
              className="admin-panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Section tabs — scrollable horizontal pill bar */}
              <div className="admin-tabs">
                {SECTIONS.map((s) => (
                  <button
                    key={s.id}
                    className={`admin-tab ${section === s.id ? "is-active" : ""}`}
                    onClick={() => setSection(s.id)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d={s.icon} />
                    </svg>
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="admin-content">
                {section === "server" && (
                  <div className="admin-cards">
                    <div className="admin-card">
                      <div className="admin-card__head">SERVEUR DE JEU</div>
                      <div className="admin-card__row">
                        <span>Adresse</span>
                        <span className="admin-card__val admin-card__val--mono">
                          {maskHost(config?.server_host)}
                        </span>
                      </div>
                      <div className="admin-card__row">
                        <span>Port</span>
                        <span className="admin-card__val admin-card__val--mono">
                          {config?.server_port ? "•••••" : "—"}
                        </span>
                      </div>
                      <div className="admin-card__row">
                        <span>Statut</span>
                        <span className={`admin-card__val ${serverStatus?.online ? "admin-card__val--ok" : "admin-card__val--err"}`}>
                          {serverStatus?.online
                            ? `En ligne · ${serverStatus.players_online}/${serverStatus.players_max} joueurs`
                            : "Hors ligne"}
                        </span>
                      </div>
                      <div className="admin-card__row">
                        <span>Latence</span>
                        <span className="admin-card__val">
                          {serverStatus?.online ? `${serverStatus.latency_ms} ms` : "—"}
                        </span>
                      </div>
                      <div className="admin-card__note">
                        L'IP est verrouillée dans le binaire du launcher. Les joueurs ne peuvent pas la modifier.
                      </div>
                    </div>

                    <div className="admin-card">
                      <div className="admin-card__head">LAUNCHER</div>
                      <div className="admin-card__row">
                        <span>Version</span>
                        <span className="admin-card__val">v{config?.version ?? "—"}</span>
                      </div>
                      <div className="admin-card__row">
                        <span>RAM allouée</span>
                        <span className="admin-card__val">
                          {settings ? `${settings.ram_min_mb} – ${settings.ram_max_mb} Mo` : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {section === "manifest" && (
                  <div className="admin-cards">
                    <div className="admin-card">
                      <div className="admin-card__head">URL DU MANIFEST</div>
                      <div className="admin-card__url">{config?.manifest_url ?? "—"}</div>
                      <div className="admin-card__note">
                        URL compilée dans le binaire. Pour la changer, modifier <code>config.rs</code> puis rebuilder.
                      </div>
                    </div>

                    <div className="admin-card">
                      <div className="admin-card__head">WORKFLOW DE MISE À JOUR</div>
                      <ol className="admin-card__steps">
                        <li>Éditer ton modpack local</li>
                        <li>Lancer <code>.\tools\publish.ps1</code></li>
                        <li>Lancer <code>.\tools\push-release.ps1</code></li>
                        <li>Les joueurs reçoivent le patch au prochain lancement</li>
                      </ol>
                    </div>
                  </div>
                )}

                {section === "cache" && (
                  <div className="admin-cards">
                    <div className="admin-card">
                      <div className="admin-card__head">RÉPERTOIRES</div>
                      <div className="admin-card__row">
                        <span>Installation</span>
                        <span className="admin-card__val admin-card__val--mono admin-card__val--sm">
                          {config?.install_dir ?? "—"}
                        </span>
                      </div>
                      <div className="admin-card__row">
                        <span>Instance</span>
                        <span className="admin-card__val admin-card__val--mono admin-card__val--sm">
                          {config?.instance_dir ?? "—"}
                        </span>
                      </div>
                      <div className="admin-card__row">
                        <span>Cache</span>
                        <span className="admin-card__val admin-card__val--mono admin-card__val--sm">
                          {config?.cache_dir ?? "—"}
                        </span>
                      </div>
                    </div>

                    <div className="admin-card admin-card--danger">
                      <div className="admin-card__head">ZONE DANGEREUSE</div>
                      <p className="admin-card__note">
                        Vider le modpack supprime <strong>mods/, config/, resourcepacks/, shaderpacks/</strong> ainsi que les snapshots de rollback.
                        Le prochain lancement retélécharge tout.
                      </p>
                      <button
                        className="admin-btn admin-btn--danger"
                        onClick={handleClearCache}
                        disabled={clearing}
                      >
                        {clearing ? "Suppression…" : "Vider le modpack local"}
                      </button>
                      {clearResult && (
                        <div className="admin-card__result">
                          {clearResult.length > 0
                            ? `Effacé : ${clearResult.join(", ")}`
                            : "Rien à effacer."}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {section === "debug" && (
                  <div className="admin-cards">
                    <div className="admin-card">
                      <div className="admin-card__head">CONFIG RUNTIME</div>
                      <pre className="admin-card__json">
                        {JSON.stringify(config, null, 2)}
                      </pre>
                    </div>
                    <div className="admin-card">
                      <div className="admin-card__head">PRÉFÉRENCES JOUEUR</div>
                      <pre className="admin-card__json">
                        {JSON.stringify(settings, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
