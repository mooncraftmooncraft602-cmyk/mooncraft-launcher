import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLauncher } from "@/stores/launcher";
import { moonGlyph } from "@/utils/time";
import "./ConnectingOverlay.css";

const MAX_ATTEMPTS = 3;

/**
 * Full-screen overlay shown between "Play clicked" and "connected to the
 * server". The mooncraftclient mod emits a magic line on JOIN which the
 * Rust pump turns into a `game:joined` event; the launcher then hides
 * itself and reveals Minecraft.
 *
 * While shown, the launcher window is forced fullscreen + always-on-top
 * so the user never sees MC's loading screens / vanilla menus.
 */
export function ConnectingOverlay() {
  const connecting = useLauncher((s) => s.connecting);
  const attempt = useLauncher((s) => s.connectAttempt);

  // Pin the window in front while the overlay is up. Restore on hide.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const w = getCurrentWindow();
        if (connecting) {
          await w.setAlwaysOnTop(true);
          await w.setFullscreen(true);
          await w.setFocus();
        } else {
          await w.setFullscreen(false);
          await w.setAlwaysOnTop(false);
        }
      } catch {
        // Tauri APIs not available (dev?) — silently degrade.
      }
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [connecting]);

  return (
    <AnimatePresence>
      {connecting && (
        <motion.div
          className="connecting"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
          transition={{ duration: 0.25 }}
        >
          <div className="connecting__bg" />
          <div className="connecting__moon">{moonGlyph()}</div>
          <div className="connecting__halo" />
          <div className="connecting__halo connecting__halo--inner" />

          <div className="connecting__content">
            <div className="connecting__pre">M O O N C R A F T</div>
            <div className="connecting__title">
              Connexion à la <span>station…</span>
            </div>
            <div className="connecting__sub">
              On vérifie ton pilote et on t'embarque dans le serveur.
              Ne ferme pas la fenêtre.
            </div>
            <div className="connecting__loader">
              <span />
            </div>
            <div className="connecting__attempt">
              {attempt <= 1
                ? "Première tentative en cours"
                : `Tentative ${attempt} / ${MAX_ATTEMPTS}`}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
