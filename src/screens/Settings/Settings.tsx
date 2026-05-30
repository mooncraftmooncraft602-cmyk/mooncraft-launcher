import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/api";
import type { Settings as SettingsT } from "@/types";
import { useLauncher } from "@/stores/launcher";
import { toast } from "@/stores/toasts";
import { play, setSfxVolume, getSfxVolume } from "@/utils/sounds";
import "./Settings.css";

type SectionId = "performance" | "display" | "runtime" | "join" | "audio" | "a11y";

const SECTIONS: Array<{ id: SectionId; label: string; hint: string }> = [
  { id: "performance", label: "Performance", hint: "Mémoire et JVM" },
  { id: "display",     label: "Affichage",   hint: "Fenêtre et résolution" },
  { id: "runtime",     label: "Runtime",     hint: "Java et installation" },
  { id: "join",        label: "Connexion",   hint: "Serveur (verrouillé)" },
  { id: "audio",       label: "Audio",       hint: "Sons et musique" },
  { id: "a11y",        label: "Confort",     hint: "Accessibilité, animations" },
];


const RAM_PRESETS = [
  { label: "Léger", value: 2048,  desc: "2 Go — vanilla, peu de mods" },
  { label: "Moyen", value: 4096,  desc: "4 Go — recommandé" },
  { label: "Haut",  value: 8192,  desc: "8 Go — shaders, gros modpacks" },
  { label: "Pro",   value: 12288, desc: "12 Go — sandbox extrême" },
];

export function Settings() {
  const stored = useLauncher((s) => s.settings);
  const setStored = useLauncher((s) => s.setSettings);
  const [draft, setDraft] = useState<SettingsT | null>(stored);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<SectionId>("performance");
  const [filter, setFilter] = useState("");
  const [reduceMotion, setReduceMotion] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("a11y-no-motion"),
  );
  const [sfx, setSfx] = useState(() => getSfxVolume());
  const lastSaved = useRef<SettingsT | null>(stored);

  useEffect(() => {
    setDraft(stored);
    lastSaved.current = stored;
  }, [stored]);

  if (!draft) {
    return <div className="settings-screen">Loading…</div>;
  }

  const dirty = lastSaved.current && !shallowEqual(lastSaved.current, draft);

  const update = <K extends keyof SettingsT>(k: K, v: SettingsT[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const save = async () => {
    if (!draft || !dirty) return;
    setSaving(true);
    try {
      const saved = await api.saveSettings(draft);
      setStored(saved);
      lastSaved.current = saved;
      play("success");
      toast.success("Paramètres sauvegardés", "Les changements s'appliquent au prochain lancement.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      play("error");
      toast.error("Sauvegarde impossible", msg);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!lastSaved.current) return;
    setDraft(lastSaved.current);
    play("close");
    toast.info("Modifications annulées");
  };

  const pickDir = async () => {
    const dir = await api.pickInstallDir();
    if (dir) update("install_dir", dir);
  };

  const applyRamPreset = (mb: number) => {
    update("ram_max_mb", mb);
    update("ram_min_mb", Math.min(draft.ram_min_mb, mb));
    play("click");
  };

  const toggleReduceMotion = (v: boolean) => {
    setReduceMotion(v);
    document.documentElement.classList.toggle("a11y-no-motion", v);
    play("click");
  };

  const setVol = (v: number) => {
    setSfx(v);
    setSfxVolume(v);
  };

  // Detected total RAM — best-effort via Chrome's deviceMemory (GB)
  const detectedRamGb = useMemo(() => {
    const dm = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    return typeof dm === "number" ? dm : null;
  }, []);
  const ramHighWarn = detectedRamGb !== null && draft.ram_max_mb / 1024 > detectedRamGb * 0.6;

  // ── Search filter (matches section labels and field labels) ───
  const sectionMatches = (sid: SectionId): boolean => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    const s = SECTIONS.find((x) => x.id === sid);
    if (s && (s.label.toLowerCase().includes(q) || s.hint.toLowerCase().includes(q))) return true;
    return false;
  };

  return (
    <div className="settings-screen">
      <header className="settings-screen__head">
        <div>
          <h1>Systems</h1>
          <p>Tune the engine. Changes apply on the next launch.</p>
        </div>
        <div className="settings-screen__search">
          <span aria-hidden>⌕</span>
          <input
            type="search"
            placeholder="Filtrer une section…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Sections">
          {SECTIONS.filter((s) => sectionMatches(s.id)).map((s) => (
            <button
              key={s.id}
              className={`settings-nav__btn ${section === s.id ? "is-active" : ""}`}
              onClick={() => { setSection(s.id); play("click"); }}
            >
              <span className="settings-nav__label">{s.label}</span>
              <span className="settings-nav__hint">{s.hint}</span>
            </button>
          ))}
        </nav>

        <div className="settings-screen__body">
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {section === "performance" && (
                <Section title="Performance">
                  <div className="ram-presets">
                    {RAM_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        className={`ram-preset ${draft.ram_max_mb === p.value ? "is-active" : ""}`}
                        onClick={() => applyRamPreset(p.value)}
                      >
                        <span className="ram-preset__label">{p.label}</span>
                        <span className="ram-preset__value num">{(p.value / 1024).toFixed(0)} Go</span>
                        <span className="ram-preset__desc">{p.desc}</span>
                      </button>
                    ))}
                  </div>

                  <Field label="RAM initiale (Mo)">
                    <input
                      type="number" min={1024} max={32768} step={512}
                      value={draft.ram_min_mb}
                      onChange={(e) => update("ram_min_mb", +e.target.value)}
                    />
                  </Field>
                  <Field label="RAM maximale (Mo)">
                    <input
                      type="number" min={1024} max={32768} step={512}
                      value={draft.ram_max_mb}
                      onChange={(e) => update("ram_max_mb", +e.target.value)}
                    />
                    <SliderHint value={draft.ram_max_mb} min={1024} max={16384} />
                    {ramHighWarn && (
                      <div className="settings-warn">
                        ⚠︎ Tu alloues plus de 60% de ta RAM système détectée ({detectedRamGb} Go).
                        Garde de la marge pour Windows.
                      </div>
                    )}
                  </Field>
                </Section>
              )}

              {section === "display" && (
                <Section title="Affichage">
                  <Field label="Largeur fenêtre">
                    <input
                      type="number" min={640} max={3840}
                      value={draft.window_width}
                      onChange={(e) => update("window_width", +e.target.value)}
                    />
                  </Field>
                  <Field label="Hauteur fenêtre">
                    <input
                      type="number" min={480} max={2160}
                      value={draft.window_height}
                      onChange={(e) => update("window_height", +e.target.value)}
                    />
                  </Field>
                  <Field label="Plein écran">
                    <Toggle
                      checked={draft.fullscreen}
                      onChange={(v) => update("fullscreen", v)}
                    />
                  </Field>
                </Section>
              )}

              {section === "runtime" && (
                <Section title="Runtime">
                  <Field label="Chemin Java (auto-détection si vide)">
                    <input
                      type="text"
                      placeholder="C:\\Program Files\\Java\\jdk-21\\bin\\javaw.exe"
                      value={draft.java_path ?? ""}
                      onChange={(e) => update("java_path", e.target.value || null)}
                    />
                  </Field>
                  <Field label="Dossier d'installation">
                    <div className="settings-screen__row">
                      <input
                        type="text"
                        value={draft.install_dir ?? ""}
                        placeholder="Défaut OS"
                        onChange={(e) => update("install_dir", e.target.value || null)}
                      />
                      <button className="settings-screen__btn" onClick={pickDir} type="button">
                        Parcourir…
                      </button>
                    </div>
                  </Field>
                </Section>
              )}

              {section === "join" && (
                <Section title="Connexion">
                  <div className="settings-lock">
                    <div className="settings-lock__head">
                      <span className="settings-lock__icon" aria-hidden>🔒</span>
                      <div>
                        <div className="settings-lock__title">Station verrouillée</div>
                        <p className="settings-lock__desc">
                          Le launcher se connecte automatiquement à la station
                          officielle MoonCraft. L'adresse n'est pas affichée pour
                          des raisons de sécurité ; pour les invitations et les
                          retours, passe par Discord.
                        </p>
                      </div>
                    </div>
                    <div className="settings-lock__row">
                      <span className="settings-lock__key">CIBLE</span>
                      <span className="settings-lock__val">
                        MoonCraft · Serveur officiel
                      </span>
                    </div>
                    <div className="settings-lock__row">
                      <span className="settings-lock__key">AUTO-JOIN</span>
                      <span className="settings-lock__val">
                        <span className="settings-lock__chip">ACTIVÉ</span>
                      </span>
                    </div>
                  </div>
                  <Field label="Fermer le launcher au lancement">
                    <Toggle
                      checked={draft.close_launcher_on_play}
                      onChange={(v) => update("close_launcher_on_play", v)}
                    />
                  </Field>
                </Section>
              )}

              {section === "audio" && (
                <Section title="Audio">
                  <Field label="Volume des effets">
                    <input
                      type="range" min={0} max={100} step={1}
                      value={Math.round(sfx * 100)}
                      onChange={(e) => setVol(+e.target.value / 100)}
                    />
                    <span className="settings-field__suffix num">{Math.round(sfx * 100)} %</span>
                  </Field>
                  <Field label="Tester un son">
                    <button
                      type="button"
                      className="settings-screen__btn"
                      onClick={() => play("achievement")}
                    >
                      ▶ Test
                    </button>
                  </Field>
                </Section>
              )}

              {section === "a11y" && (
                <Section title="Confort visuel">
                  <Field label="Réduire les animations">
                    <Toggle checked={reduceMotion} onChange={toggleReduceMotion} />
                  </Field>
                  <p className="settings-hint">
                    Désactive les transitions douces, les effets de halo et la respiration du
                    bouton Play. Utile si tu es sensible au mouvement ou sur batterie.
                  </p>
                </Section>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <footer className="settings-screen__footer">
        {dirty ? (
          <span className="settings-screen__dirty">
            <span className="settings-screen__dirty-dot" />
            Modifications non sauvegardées
          </span>
        ) : (
          <span className="settings-screen__saved">Tous les changements sont sauvegardés.</span>
        )}
        <div className="settings-screen__footer-actions">
          {dirty && (
            <button
              className="settings-screen__btn"
              onClick={reset}
              disabled={saving}
              type="button"
            >
              Annuler
            </button>
          )}
          <button
            className="settings-screen__btn settings-screen__btn--primary"
            onClick={save}
            disabled={saving || !dirty}
            type="button"
          >
            {saving ? "Sauvegarde…" : "Sauvegarder"}
          </button>
        </div>
      </footer>
    </div>
  );
}

function shallowEqual(a: SettingsT, b: SettingsT): boolean {
  const keys = Object.keys(a) as Array<keyof SettingsT>;
  return keys.every((k) => a[k] === b[k]);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="settings-section">
      <h2 className="settings-section__title">{title}</h2>
      <div className="settings-section__body">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="settings-field">
      <span className="settings-field__label">{label}</span>
      <div className="settings-field__control">{children}</div>
    </label>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`toggle ${checked ? "is-on" : ""}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      type="button"
    >
      <span className="toggle__knob" />
    </button>
  );
}

function SliderHint({ value, min, max }: { value: number; min: number; max: number }) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <div className="slider-hint">
      <div className="slider-hint__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
