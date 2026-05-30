import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, formatBytes, formatSpeed } from "@/api";
import { useLauncher } from "@/stores/launcher";
import { PlayButton, type PlayButtonState } from "@/components/PlayButton/PlayButton";
import { ProgressBar } from "@/components/ProgressBar/ProgressBar";
import { ServerStatus } from "@/components/ServerStatus/ServerStatus";
import { Tooltip } from "@/components/Tooltip/Tooltip";
import { toast } from "@/stores/toasts";
import { play } from "@/utils/sounds";
import { parseMotd } from "@/utils/motd";
import { pickTip } from "@/utils/tips";
import { timeOfDayGreeting, moonGlyph, moonPhase } from "@/utils/time";
import { useTicker } from "@/hooks/useTicker";
import "./Home.css";

export function Home() {
  const phase = useLauncher((s) => s.phase);
  const setPhase = useLauncher((s) => s.setPhase);
  const check = useLauncher((s) => s.check);
  const status = useLauncher((s) => s.status);
  const progress = useLauncher((s) => s.progress);
  const error = useLauncher((s) => s.error);
  const setError = useLauncher((s) => s.setError);
  const serverStatus = useLauncher((s) => s.serverStatus);
  const setServerStatus = useLauncher((s) => s.setServerStatus);
  const gate = useLauncher((s) => s.gate);
  const setGate = useLauncher((s) => s.setGate);
  const setRetries = useLauncher((s) => s.setRetries);
  const setConnecting = useLauncher((s) => s.setConnecting);
  const setConnectAttempt = useLauncher((s) => s.setConnectAttempt);
  const account = useLauncher((s) => s.activeAccount());
  const settings = useLauncher((s) => s.settings);

  const buttonState = useMemo<PlayButtonState>(() => {
    if (phase === "error" && error) return { kind: "error", message: error };
    if (phase === "running") return { kind: "running" };
    if (phase === "launching") return { kind: "launching" };
    if (phase === "checking") return { kind: "checking" };
    if (phase === "updating") {
      const percent =
        progress && progress.bytes_total > 0
          ? (progress.bytes_done / progress.bytes_total) * 100
          : 0;
      return {
        kind: "updating",
        percent,
        speed: progress ? formatSpeed(progress.speed_bps) : "—",
      };
    }
    return {
      kind: "ready",
      label: check?.needs_update ? "Patch & Play" : "Play",
    };
  }, [phase, error, progress, check]);

  const handlePlay = async () => {
    setError(null);
    setRetries(0); // fresh Play click — reset auto-retry counter
    try {
      if (!account) {
        setError("Crée d'abord un pilote dans l'onglet « Pilote ».");
        setPhase("error");
        play("error");
        return;
      }

      // Paladium-style server gates — two layers:
      //
      //  1. Admin gate (gate.json on GitHub). The admin flips `open: false`
      //     when pausing the server. Refreshed on every Play click so the
      //     decision is always live.
      //  2. SLP ping — only as a fallback. We don't fail-close on SLP because
      //     a "paused" server often still answers SLP (TCP listener up,
      //     world ticking stopped). The gate.json is the source of truth.
      setPhase("checking");

      let liveGate = gate;
      try {
        liveGate = await api.getServerGate();
        setGate(liveGate);
      } catch {
        // Fail-open if gate.json is unreachable.
        liveGate = liveGate ?? { open: true };
      }
      if (liveGate && liveGate.open === false) {
        const reason = liveGate.reason ?? "Le serveur est en pause.";
        const eta = liveGate.estimated_reopen
          ? ` · Réouverture estimée : ${liveGate.estimated_reopen}`
          : "";
        setError(`${reason}${eta}`);
        setPhase("error");
        play("error");
        toast.error("Décollage refusé", reason);
        return;
      }

      // SLP ping (informational + fallback).
      try {
        const live = await api.getServerStatus();
        setServerStatus(live);
      } catch {
        // ping itself failed — non-fatal; the admin gate is the real
        // authority here, so we still let the launch proceed.
      }

      if (check?.needs_update) {
        setPhase("updating");
        await api.runUpdate();
        play("complete");
      }
      // Show the captive "Connexion à la station…" overlay BEFORE spawning
      // MC so the user never sees vanilla loading screens.
      setConnectAttempt(1);
      setConnecting(true);
      setPhase("launching");
      await api.launchGame(account.id);
    } catch (e: unknown) {
      const msg: string = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPhase("error");
      play("error");
      toast.error("Lancement impossible", msg);
    }
  };

  // Tip rotation during updates.
  const tipTick = useTicker(7000);
  const tipText = useMemo(() => pickTip(tipTick + 1), [tipTick]);

  const greeting = account ? `${timeOfDayGreeting()}, ${account.username}.` : "Bienvenue.";

  return (
    <div className="home">
      <section className="home__hero">
        <motion.div
          className="home__hero-bg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        />
        <div className="home__hero-content">
          <div className="home__top-row">
            <div className="home__tag">
              <span className="home__tag-dot" />
              SEASON 01 · LUNA RISING
            </div>
            <Tooltip label={moonPhase()} side="bottom">
              <span className="home__moon-glyph" aria-hidden>{moonGlyph()}</span>
            </Tooltip>
          </div>

          {gate && gate.open === false && (
            <div className="home__gate home__gate--closed">
              <span className="home__gate-icon" aria-hidden>⏸</span>
              <div className="home__gate-text">
                <div className="home__gate-title">STATION EN PAUSE</div>
                <div className="home__gate-reason">
                  {gate.reason ?? "Le serveur est en maintenance, retente plus tard."}
                </div>
                {gate.estimated_reopen && (
                  <div className="home__gate-eta">
                    Réouverture estimée : {gate.estimated_reopen}
                  </div>
                )}
              </div>
            </div>
          )}
          {gate && gate.open === true && gate.banner && (
            <div className="home__gate home__gate--banner">
              <span className="home__gate-icon" aria-hidden>📢</span>
              <div className="home__gate-text">{gate.banner}</div>
            </div>
          )}

          <div className="home__greeting">{greeting}</div>

          <h1 className="home__title">
            <span>Welcome to the</span>
            <span className="home__title-accent">Moon.</span>
          </h1>
          <p className="home__desc">
            A premium Fabric server with custom content. Smelt moonstone,
            terraform craters, and build your colony among the stars.
          </p>

          <div className="home__cta-row">
            <PlayButton state={buttonState} onClick={handlePlay} />
            <div className="home__cta-meta">
              <div className="home__meta-row">
                <span className="home__meta-label">VERSION CLIENT</span>
                <span className="home__meta-value num">
                  {check?.remote_version ?? "—"}
                  {check?.current_version &&
                   check.current_version !== check.remote_version && (
                    <span className="home__meta-old"> ← {check.current_version}</span>
                  )}
                </span>
              </div>
              <div className="home__meta-row">
                <span className="home__meta-label">PATCH</span>
                <span className="home__meta-value num">
                  {check
                    ? check.files_to_download === 0
                      ? "À jour ✓"
                      : `${formatBytes(check.bytes_to_download)} · ${check.files_to_download} fich.`
                    : "—"}
                </span>
              </div>
              <div className="home__meta-row">
                <span className="home__meta-label">RAM ALLOUÉE</span>
                <span className="home__meta-value num">
                  {settings ? `${(settings.ram_max_mb / 1024).toFixed(1)} Go` : "—"}
                </span>
              </div>
              <div className="home__meta-row">
                <span className="home__meta-label">PILOTE</span>
                <span className="home__meta-value">
                  {account ? account.username : <em className="home__meta-empty">—</em>}
                </span>
              </div>
            </div>
          </div>

          {/* Station banner — IP intentionally hidden */}
          <div className="home__ip-row">
            <span className="home__ip-label">STATION</span>
            <span className="home__ip-pill home__ip-pill--locked">
              <span className="home__ip-locked-icon" aria-hidden>🔒</span>
              MoonCraft · Serveur officiel
            </span>
            {serverStatus?.online && (
              <span className="home__ip-ping num">{serverStatus.latency_ms} ms</span>
            )}
          </div>

          <AnimatePresence>
            {phase === "updating" && progress && (
              <motion.div
                className="home__progress"
                key="progress"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <ProgressBar
                  percent={(progress.bytes_done / Math.max(1, progress.bytes_total)) * 100}
                  label={status?.message ?? "Patching"}
                  meta={`${formatBytes(progress.bytes_done)} / ${formatBytes(progress.bytes_total)}  ·  ${formatSpeed(progress.speed_bps)}`}
                />
                <div className="home__progress-file">{progress.current_file}</div>
                <div className="home__tip">
                  <span className="home__tip-prefix">DID YOU KNOW</span>
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={tipText}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.25 }}
                      className="home__tip-text"
                    >
                      {tipText}
                    </motion.span>
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {phase === "checking" && (
            <div className="home__status-line">Vérification des fichiers locaux…</div>
          )}
          {phase === "launching" && (
            <div className="home__status-line">Lancement du jeu…</div>
          )}
          {error && phase === "error" && (
            <div className="home__status-line home__status-line--error">{error}</div>
          )}
          {!account && phase !== "error" && (
            <div className="home__status-line home__status-line--hint">
              → Crée un pilote dans l'onglet <strong>Pilote</strong> puis clique sur Play.
            </div>
          )}
        </div>
      </section>

      <aside className="home__sidebar">
        <ServerStatus status={serverStatus} />

        {/* MOTD card — only when server is online and we got a MOTD */}
        {serverStatus?.online && serverStatus.motd && (
          <div className="home__panel home__motd">
            <div className="home__panel-head">
              <span>MOTD</span>
              <span className="home__panel-dot" />
            </div>
            <div className="home__motd-text">{parseMotd(serverStatus.motd)}</div>
            {serverStatus.version && (
              <div className="home__motd-version num">v{serverStatus.version}</div>
            )}
          </div>
        )}

        <div className="home__panel">
          <div className="home__panel-head">
            <span>LATEST</span>
            <span className="home__panel-dot" />
          </div>
          {check?.changelog ? (
            <div className="home__changelog">
              <pre>{check.changelog}</pre>
            </div>
          ) : (
            <div className="home__panel-empty">No changelog posted.</div>
          )}
        </div>

        <button
          className="home__ghost-btn"
          onClick={() => api.openInstallDir().catch(console.error)}
          onMouseEnter={() => play("hover")}
        >
          Open install folder
        </button>
      </aside>
    </div>
  );
}
