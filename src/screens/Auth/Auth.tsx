import { useEffect, useRef, useState } from "react";
import { api } from "@/api";
import { useLauncher } from "@/stores/launcher";
import { toast } from "@/stores/toasts";
import { play } from "@/utils/sounds";
import "./Auth.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PSEUDO_RE = /^[A-Za-z0-9_]{3,16}$/;

interface Props {
  onAuthed: () => void;
}

/**
 * First-launch authentication gate. Single-path: email + pseudo with a
 * Mojang availability check that prevents impersonating a real premium
 * player. The server runs in offline-mode so every pilote is "offline".
 */
export function Auth({ onAuthed }: Props) {
  const setAccounts = useLauncher((s) => s.setAccounts);
  const [email, setEmail] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [availability, setAvailability] = useState<null | "free" | "taken" | "invalid">(null);
  const [error, setError] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const debounce = useRef<number | null>(null);

  // Debounced live username check against Mojang.
  useEffect(() => {
    setAvailability(null);
    if (!pseudo) return;
    if (!PSEUDO_RE.test(pseudo)) {
      setAvailability("invalid");
      return;
    }
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      setChecking(true);
      try {
        const r = await api.checkMcUsername(pseudo);
        if (r.invalid_format) setAvailability("invalid");
        else setAvailability(r.available ? "free" : "taken");
      } catch {
        setAvailability(null);
      } finally {
        setChecking(false);
      }
    }, 450);
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [pseudo]);

  const submit = async () => {
    setError(null);
    if (!EMAIL_RE.test(email)) {
      setError("Email obligatoire et valide (ex: pilote@laposte.net).");
      play("error");
      return;
    }
    if (!PSEUDO_RE.test(pseudo)) {
      setError("Pseudo : 3-16 caractères [A-Za-z0-9_].");
      play("error");
      return;
    }
    if (!agree) {
      setError("Tu dois accepter la charte avant d'entrer en orbite.");
      play("error");
      return;
    }
    setBusy(true);
    try {
      await api.addOfflineAccount(pseudo, email, true);
      const accounts = await api.listAccounts();
      setAccounts(accounts);
      play("complete");
      toast.success("Bienvenue à bord, pilote.", `${pseudo} est enregistré.`);
      onAuthed();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      play("error");
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    !busy &&
    EMAIL_RE.test(email) &&
    PSEUDO_RE.test(pseudo) &&
    availability !== "taken" &&
    availability !== "invalid" &&
    agree;

  return (
    <div className="auth-gate">
      <div className="auth-card">
        <div className="auth-card__header">
          <div className="auth-card__tag">
            <span className="auth-card__dot" /> ACCÈS À LA STATION
          </div>
          <h1 className="auth-card__title">
            Identification <span>pilote</span>
          </h1>
          <p className="auth-card__lead">
            Pour décoller vers MoonCraft, identifie-toi avec ton email et choisis
            ton pseudo Minecraft. On vérifie qu'il n'est pas déjà utilisé par un
            joueur premium pour éviter toute confusion en jeu.
          </p>
        </div>

        <div className="auth-card__body">
          <div className="auth-form">
            <label className="auth-field">
              <span className="auth-field__label">EMAIL</span>
              <input
                type="email"
                autoComplete="email"
                placeholder="ex : pilote@laposte.net"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <span className="auth-field__hint">
                Tous les fournisseurs acceptés (Gmail, Outlook, Laposte,
                ProtonMail, Yahoo…). Stocké uniquement sur cette machine.
              </span>
            </label>

            <label className="auth-field">
              <span className="auth-field__label">PSEUDO MINECRAFT</span>
              <div className="auth-field__row">
                <input
                  type="text"
                  maxLength={16}
                  autoComplete="off"
                  placeholder="3-16 caractères, lettres/chiffres/_"
                  value={pseudo}
                  onChange={(e) => setPseudo(e.target.value)}
                  required
                />
                <span className={`auth-pill auth-pill--${availability ?? "idle"}`}>
                  {checking && "Vérif…"}
                  {!checking && availability === "free" && "✓ Libre"}
                  {!checking && availability === "taken" && "✕ Pris"}
                  {!checking && availability === "invalid" && "format"}
                  {!checking && availability === null && "—"}
                </span>
              </div>
              <span className="auth-field__hint">
                Vérification en direct via l'API publique Mojang. Si le pseudo
                est déjà claim par un joueur premium, choisis-en un autre.
              </span>
            </label>

            <label className="auth-check">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
              />
              <span>
                J'accepte la charte MoonCraft : pas de triche, pas de publicité,
                respect des autres pilotes.
              </span>
            </label>

            {error && <div className="auth-error">{error}</div>}

            <div className="auth-actions auth-actions--single">
              <button
                type="button"
                className="auth-btn auth-btn--primary"
                onClick={submit}
                disabled={!canSubmit}
              >
                {busy ? "Enregistrement…" : "Décoller →"}
              </button>
            </div>
          </div>

          <p className="auth-fineprint">
            Le launcher stocke tes infos localement dans un vault obfusqué.
            La seule donnée envoyée à l'extérieur est ton pseudo, à Mojang,
            pour vérifier la disponibilité — ton email reste sur ta machine.
          </p>
        </div>
      </div>
    </div>
  );
}
