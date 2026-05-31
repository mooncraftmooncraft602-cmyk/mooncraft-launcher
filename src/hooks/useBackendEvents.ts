import { useEffect, useRef } from "react";
import { api, events } from "@/api";
import { useLauncher } from "@/stores/launcher";
import { useLogs } from "@/stores/logs";
import { toast } from "@/stores/toasts";
import { play } from "@/utils/sounds";

const CONNECT_FAIL_RE =
  /Failed to connect to the server|SocketException|Connection (?:refused|reset|timed out|closed)|AnnotatedConnectException|Internal Exception:/i;

/** Échec d'AUTHENTIFICATION permanent (online-mode, whitelist, ban) — inutile de réessayer. */
const AUTH_FAIL_RE =
  /Invalid session|invalid_session|Failed to verify username|unverified_username|Failed to log in|multiplayer\.disconnect\.(?:unverified_username|not_whitelisted|banned_ip|banned)/i;

const DISCONNECT_RE =
  /\[(?:Network|Render|Server) thread\/(?:INFO|ERROR|WARN)\][^\n]*?(?:Disconnect|Lost connection|Failed to connect|Connection (?:refused|reset|timed out|closed)|AnnotatedConnectException|kicked from)/i;

const RETRY_DELAY_MS = 5000;
/** Up to N total launch attempts before we surrender to the patience modal. */
const MAX_ATTEMPTS = 3;

/**
 * Captive session lifecycle:
 *
 *   Play clicked   → connecting=true, attempt=1, overlay fullscreen+on-top
 *   game:started   → MC process up but invisible behind overlay
 *   game:joined    → mod marker scanned → connecting=false, overlay fades,
 *                    launcher hides itself, MC visible.
 *   conn failure   → silent kill + retry up to MAX_ATTEMPTS
 *   final failure  → patience modal ("ask an op on Discord")
 *   in-game stop   → close launcher (Paladium captive)
 */
export function useBackendEvents() {
  const setStatus = useLauncher((s) => s.setStatus);
  const setProgress = useLauncher((s) => s.setProgress);
  const setError = useLauncher((s) => s.setError);
  const setPhase = useLauncher((s) => s.setPhase);
  const setCheck = useLauncher((s) => s.setCheck);
  const setPatience = useLauncher((s) => s.setPatience);
  const setConnecting = useLauncher((s) => s.setConnecting);
  const setConnectAttempt = useLauncher((s) => s.setConnectAttempt);
  const pushLog = useLogs((s) => s.push);

  const killedRef = useRef(false);
  const connectFailedRef = useRef(false);
  const retryPendingRef = useRef(false);
  const joinedRef = useRef(false);

  useEffect(() => {
    const unsubs: Array<Promise<() => void>> = [
      events.onStatus(setStatus),
      events.onProgress(setProgress),
      events.onUpdateError((e) => {
        setError(e.message);
        setPhase("error");
        setConnecting(false);
        play("error");
        toast.error("Mise à jour échouée", e.message);
      }),
      events.onUpdateComplete((e) => {
        setProgress(null);
        setStatus(null);
        setPhase("ready");
        play("complete");
        const cur = useLauncher.getState().check;
        if (cur) {
          setCheck({
            ...cur,
            current_version: e.version,
            needs_update: false,
            bytes_to_download: 0,
            files_to_download: 0,
            files_to_remove: 0,
          });
        } else {
          setCheck({
            current_version: e.version,
            remote_version: e.version,
            changelog: null,
            needs_update: false,
            bytes_to_download: 0,
            files_to_download: 0,
            files_to_remove: 0,
          });
        }
        toast.success("Mise à jour terminée", "Tous les fichiers sont à jour.");
      }),
      events.onGameStarted(() => {
        killedRef.current = false;
        connectFailedRef.current = false;
        joinedRef.current = false;
        setPhase("running");
        play("complete");
        // Overlay is already up from handlePlay — don't touch it here.
      }),
      events.onGameJoined(async () => {
        joinedRef.current = true;
        setConnecting(false);
        play("complete");
        // We're in the server — drop the launcher window so MC is the only
        // visible thing.
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          await getCurrentWindow().hide();
        } catch {
          // dev mode etc.
        }
      }),
      events.onGameStopped((e) => {
        setPhase("ready");
        setConnecting(false);

        if (retryPendingRef.current) {
          // Mid-retry — don't auto-close.
          return;
        }
        if (useLauncher.getState().patience) {
          return;
        }

        // If the game stopped after a successful JOIN, that's a normal end
        // of session → close launcher per the Paladium captive rule.
        if (joinedRef.current) {
          if (killedRef.current) {
            // already explained
          } else if (e.exit_code === 0) {
            toast.info("Session terminée", "Fermeture du launcher dans 2s…");
          } else if (e.exit_code === -1) {
            toast.warn("Session interrompue", "Fermeture du launcher dans 2s…");
          } else {
            toast.error("Crash du jeu", `Code ${e.exit_code}. Vois les logs.`);
          }
          window.setTimeout(async () => {
            try {
              const { getCurrentWindow } = await import("@tauri-apps/api/window");
              await getCurrentWindow().close();
            } catch (err) {
              console.error("Failed to close launcher window:", err);
            }
          }, 2000);
        }
        // If the game stopped BEFORE joining (connect failure), the retry
        // logic in onGameLog handles it; don't auto-close here.
      }),
      events.onGameLog((l) => {
        pushLog(l);
        if (killedRef.current) return;

        if (CONNECT_FAIL_RE.test(l.line)) {
          connectFailedRef.current = true;
        }

        // Échec d'authentification PERMANENT (online-mode / whitelist / ban) :
        // inutile de réessayer — on coupe, on révèle le launcher et on explique.
        if (!joinedRef.current && AUTH_FAIL_RE.test(l.line)) {
          killedRef.current = true;
          api.stopGame().catch(() => {});
          setConnecting(false);
          setPhase("error");
          play("error");
          toast.error(
            "Connexion refusée par le serveur",
            "Compte offline rejeté : passe le serveur en online-mode=false puis redémarre-le.",
          );
          (async () => {
            try {
              const { getCurrentWindow } = await import("@tauri-apps/api/window");
              const w = getCurrentWindow();
              await w.setFullscreen(false);
              await w.setAlwaysOnTop(false);
              await w.show();
              await w.setFocus();
            } catch { /* noop */ }
          })();
          return;
        }

        if (!DISCONNECT_RE.test(l.line)) return;

        // We saw a disconnect signal. If we never joined, this is a
        // connection failure → retry until we hit the cap.
        if (!joinedRef.current) {
          const attempt = useLauncher.getState().connectAttempt;
          if (attempt < MAX_ATTEMPTS) {
            // Silent retry — bump the counter, kill MC, relaunch after delay.
            killedRef.current = true;
            useLauncher.getState().setConnectAttempt(attempt + 1);
            retryPendingRef.current = true;
            api.stopGame().catch(() => {});
            window.setTimeout(async () => {
              const account = useLauncher.getState().activeAccount();
              if (!account) {
                retryPendingRef.current = false;
                return;
              }
              try {
                killedRef.current = false;
                connectFailedRef.current = false;
                retryPendingRef.current = false;
                setPhase("launching");
                await api.launchGame(account.id);
              } catch {
                retryPendingRef.current = false;
                setConnecting(false);
                setPatience(true);
                setPhase("error");
                play("error");
              }
            }, RETRY_DELAY_MS);
            return;
          }
          // Cap reached → surrender.
          killedRef.current = true;
          api.stopGame().catch(() => {});
          setConnecting(false);
          setPatience(true);
          play("error");
          // Restore launcher window state (was fullscreen + on-top during
          // connecting) so the modal is readable.
          (async () => {
            try {
              const { getCurrentWindow } = await import("@tauri-apps/api/window");
              const w = getCurrentWindow();
              await w.setFullscreen(false);
              await w.setAlwaysOnTop(false);
              await w.show();
              await w.setFocus();
            } catch { /* noop */ }
          })();
          return;
        }

        // Joined then disconnected — captive kill + launcher close path.
        killedRef.current = true;
        api.stopGame().catch(() => {});
        play("error");
        toast.warn(
          "Déconnecté du serveur",
          "MoonCraft est un launcher captif — fermeture automatique.",
        );
      }),
    ];

    return () => {
      unsubs.forEach((p) => p.then((un) => un()).catch(() => {}));
    };
  }, [setError, setPhase, setProgress, setStatus, setCheck, setPatience, setConnecting, setConnectAttempt, pushLog]);
}
