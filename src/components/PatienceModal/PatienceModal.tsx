import { useLauncher } from "@/stores/launcher";
import { Modal } from "@/components/Modal/Modal";
import { play } from "@/utils/sounds";
import "./PatienceModal.css";

const DISCORD_URL = "https://discord.gg/kZJRwJ2r";

/**
 * Shown after two failed connection attempts. The launcher is intentionally
 * NOT auto-closed here so the player has time to read the message and act
 * (rejoin the Discord, wait a few minutes, etc.).
 */
export function PatienceModal() {
  const open = useLauncher((s) => s.patience);
  const setPatience = useLauncher((s) => s.setPatience);

  const closeAndQuit = async () => {
    play("close");
    setPatience(false);
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch {
      // noop
    }
  };

  const openDiscord = () => {
    play("click");
    window.open(DISCORD_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <Modal
      open={open}
      onClose={() => setPatience(false)}
      title="Connexion impossible"
      size="default"
      blocking
    >
      <div className="patience">
        <div className="patience__icon" aria-hidden>📡</div>
        <p className="patience__lead">
          Trois tentatives consécutives ont échoué.
        </p>
        <p className="patience__body">
          Il y a probablement un <strong>bug côté serveur ou côté réseau</strong>.
          Patiente quelques minutes et réessaie — c'est souvent temporaire.
        </p>
        <p className="patience__body">
          Si le problème persiste,{" "}
          <strong>demande à un OP sur le Discord</strong> en précisant ton
          pseudo et l'heure approximative.
        </p>

        <div className="patience__actions">
          <button
            type="button"
            className="patience__btn patience__btn--ghost"
            onClick={closeAndQuit}
          >
            Fermer MoonCraft
          </button>
          <button
            type="button"
            className="patience__btn patience__btn--primary"
            onClick={openDiscord}
          >
            Rejoindre le Discord →
          </button>
        </div>
      </div>
    </Modal>
  );
}
