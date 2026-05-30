import { useLauncher } from "@/stores/launcher";
import { moonGlyph, daysSince } from "@/utils/time";
import "./Footer.css";

const DISCORD_URL = "https://discord.gg/kZJRwJ2r";
const SEASON_START = "2026-05-01"; // Saison 01
const SEASON_NAME = "Saison 01 · Luna Rising";

interface Props {
  onOpenLogs?: () => void;
}

/**
 * Application footer — visible above the bottom edge on every screen.
 * Holds the season counter, moon phase glyph, and quick links to Discord,
 * the website, and the in-app logs viewer.
 */
export function Footer({ onOpenLogs }: Props) {
  const status = useLauncher((s) => s.serverStatus);
  const days = daysSince(SEASON_START);
  const glyph = moonGlyph();

  return (
    <footer className="app-footer">
      <div className="app-footer__left">
        <span className="app-footer__glyph" aria-hidden>{glyph}</span>
        <span className="app-footer__season">{SEASON_NAME}</span>
        <span className="app-footer__sep">·</span>
        <span className="app-footer__day num">J+{days}</span>
      </div>
      <div className="app-footer__right">
        {status?.online && (
          <span className="app-footer__chip app-footer__chip--online" title="Serveur en ligne">
            <span className="app-footer__dot" /> {status.players_online} pilotes en orbite
          </span>
        )}
        {status && !status.online && (
          <span className="app-footer__chip app-footer__chip--offline" title="Serveur injoignable">
            <span className="app-footer__dot" /> Hors d'orbite
          </span>
        )}
        <button
          className="app-footer__link"
          onClick={onOpenLogs}
          type="button"
          title="Journal de mission"
        >
          Logs
        </button>
        <a className="app-footer__link" href={DISCORD_URL} target="_blank" rel="noreferrer">
          Discord
        </a>
      </div>
    </footer>
  );
}
