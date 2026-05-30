import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/api";
import { useLauncher } from "@/stores/launcher";
import { Avatar } from "@/components/Avatar/Avatar";
import { toast } from "@/stores/toasts";
import { play } from "@/utils/sounds";
import "./Account.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PSEUDO_RE = /^[A-Za-z0-9_]{3,16}$/;

export function Account() {
  const accounts = useLauncher((s) => s.accounts);
  const setAccounts = useLauncher((s) => s.setAccounts);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [availability, setAvailability] = useState<null | "free" | "taken" | "invalid">(null);
  const [checking, setChecking] = useState(false);
  const [skinBust, setSkinBust] = useState(0);
  const debounce = useRef<number | null>(null);

  // Live username availability check (Mojang).
  useEffect(() => {
    setAvailability(null);
    if (!username) return;
    if (!PSEUDO_RE.test(username)) { setAvailability("invalid"); return; }
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      setChecking(true);
      try {
        const r = await api.checkMcUsername(username);
        if (r.invalid_format) setAvailability("invalid");
        else setAvailability(r.available ? "free" : "taken");
      } catch {
        setAvailability(null);
      } finally {
        setChecking(false);
      }
    }, 450);
    return () => { if (debounce.current) window.clearTimeout(debounce.current); };
  }, [username]);

  const reload = async () => {
    try {
      setAccounts(await api.listAccounts());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const add = async () => {
    const u = username.trim();
    if (!PSEUDO_RE.test(u)) {
      setError("Pseudo : 3-16 caractères [A-Za-z0-9_].");
      setShakeKey((k) => k + 1);
      play("error");
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setError("Email obligatoire et valide (ex: pilote@laposte.net).");
      setShakeKey((k) => k + 1);
      play("error");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.addOfflineAccount(u, email || null, true);
      setUsername("");
      setEmail("");
      await reload();
      play("success");
      toast.success("Pilote enregistré", `${u} est prêt à décoller.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setShakeKey((k) => k + 1);
      play("error");
    } finally {
      setBusy(false);
    }
  };

  const importSkin = async (accountId: string) => {
    try {
      const src = await api.pickSkinFile();
      if (!src) return;
      const res = await api.importSkin(accountId, src);
      play("success");
      setSkinBust((n) => n + 1);

      if (res.skin_command) {
        // Auto-copy the SkinRestorer command so the player just has to
        // paste it once in chat to make the skin persistent server-side.
        try {
          await navigator.clipboard.writeText(res.skin_command);
          toast.success(
            "Skin uploadé + commande copiée",
            "Colle dans le chat MC : la commande /skin set <url> est dans ton presse-papier. SkinRestorer s'occupera de la persister.",
          );
        } catch {
          toast.success(
            "Skin uploadé",
            `Colle dans le chat : ${res.skin_command}`,
          );
        }
      } else {
        // Upload failed but local resource pack is in place
        toast.warn(
          "Skin importé (local uniquement)",
          "L'upload sur catbox a échoué — seul ton resource pack local est appliqué. Réessaie plus tard pour que les autres joueurs te voient.",
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      play("error");
      toast.error("Import impossible", msg);
    }
  };

  const setActive = async (id: string, name: string) => {
    await api.setActiveAccount(id);
    await reload();
    play("click");
    toast.success("Pilote actif", `${name} est aux commandes.`);
  };
  const remove = async (id: string, name: string) => {
    await api.removeAccount(id);
    await reload();
    play("close");
    toast.info("Pilote retiré", name);
  };

  const sorted = useMemo(
    () => [...accounts].sort((a, b) => Number(b.active) - Number(a.active) || a.username.localeCompare(b.username)),
    [accounts],
  );

  return (
    <div className="account-screen">
      <header className="account-screen__head">
        <h1>Pilote</h1>
        <p>Tes comptes locaux. Le pseudo est vérifié contre Mojang pour éviter toute collision avec un joueur premium.</p>
      </header>

      <section className="account-screen__add">
        <h2>Ajouter un pilote</h2>
        <motion.div
          className="account-screen__form"
          key={shakeKey}
          animate={shakeKey > 0 ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="account-form-grid">
            <label className="account-field">
              <span className="account-field__label">EMAIL</span>
              <input
                type="email"
                placeholder="pilote@laposte.net"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="account-field">
              <span className="account-field__label">PSEUDO MINECRAFT</span>
              <div className="account-field__row">
                <input
                  type="text"
                  placeholder="3-16 car., lettres/chiffres/_"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && add()}
                  maxLength={16}
                />
                <span className={`auth-pill auth-pill--${availability ?? "idle"}`}>
                  {checking && "Vérif…"}
                  {!checking && availability === "free" && "✓ Libre"}
                  {!checking && availability === "taken" && "✕ Pris"}
                  {!checking && availability === "invalid" && "format"}
                  {!checking && availability === null && "—"}
                </span>
              </div>
            </label>
          </div>
          <button
            onClick={add}
            onMouseEnter={() => play("hover")}
            disabled={
              busy || !username.trim() || !EMAIL_RE.test(email) ||
              availability === "taken" || availability === "invalid"
            }
            className="account-screen__btn"
            type="button"
          >
            {busy ? "Enregistrement…" : "Créer le pilote"}
          </button>
        </motion.div>
        {error && <div className="account-screen__error">{error}</div>}
      </section>

      <section className="account-screen__list">
        <h2>Mes pilotes <span className="account-screen__count num">({accounts.length})</span></h2>
        {accounts.length === 0 && (
          <div className="account-screen__empty">
            Aucun pilote. Entre un pseudo ci-dessus pour commencer.
          </div>
        )}
        {sorted.map((a) => (
          <motion.div
            key={a.id}
            className={`account-card ${a.active ? "is-active" : ""}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <Avatar
              key={`av-${a.id}-${skinBust}`}
              accountId={a.id}
              uuid={a.uuid}
              username={a.username}
              size={56}
              active={a.active}
              premium={a.kind === "microsoft"}
            />
            <div className="account-card__main">
              <div className="account-card__name-row">
                <span className="account-card__name">{a.username}</span>
                {a.active && (
                  <span className="account-card__star" title="Pilote actif" aria-hidden>★</span>
                )}
              </div>
              <div className="account-card__sub">
                <span className={`account-card__kind account-card__kind--${a.kind}`}>
                  {a.kind === "offline" ? "OFFLINE" : "PREMIUM"}
                </span>
                {a.email && <span className="account-card__email">{a.email}</span>}
                <span className="account-card__uuid num">{a.uuid.slice(0, 8)}…</span>
              </div>
            </div>
            <button
              className="account-screen__btn account-screen__btn--ghost"
              onClick={() => importSkin(a.id)}
              onMouseEnter={() => play("hover")}
              type="button"
              title="Importer un skin PNG (64×64)"
            >
              🎨 Skin
            </button>
            {a.active ? (
              <span className="account-card__badge">ACTIF</span>
            ) : (
              <button
                className="account-screen__btn account-screen__btn--ghost"
                onClick={() => setActive(a.id, a.username)}
                onMouseEnter={() => play("hover")}
                type="button"
              >
                Utiliser
              </button>
            )}
            <button
              className="account-screen__btn account-screen__btn--danger"
              onClick={() => remove(a.id, a.username)}
              aria-label={`Supprimer ${a.username}`}
              type="button"
            >
              ✕
            </button>
          </motion.div>
        ))}
      </section>
    </div>
  );
}
