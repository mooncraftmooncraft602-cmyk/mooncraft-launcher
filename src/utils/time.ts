/**
 * Time / date helpers — kept lightweight, no external deps.
 * All output is French-leaning since the UI copy is FR.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "il y a 3h", "il y a 2 jours", "à l'instant". */
export function relativeTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  const delta = Date.now() - d.getTime();
  if (delta < 30_000) return "à l'instant";
  if (delta < HOUR) return `il y a ${Math.floor(delta / MIN)} min`;
  if (delta < DAY) return `il y a ${Math.floor(delta / HOUR)} h`;
  if (delta < 7 * DAY) return `il y a ${Math.floor(delta / DAY)} j`;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

/** Full absolute date in FR. */
export function absoluteDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/** "1h 23m 4s" — used for game session length, server uptime. */
export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/** "Bonsoir", "Bonjour", "Bonne nuit" based on the local hour. */
export function timeOfDayGreeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Bonne nuit";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  if (h < 22) return "Bonsoir";
  return "Bonne nuit";
}

/** Returns "Nouvelle Lune", "Premier Quartier", etc. — approximate. */
export function moonPhase(now: Date = new Date()): string {
  // Algo simplifié, suffisant pour de l'affichage.
  // Référence : nouvelle lune au 2000-01-06 18:14 UTC, période synodique 29.530588.
  const REF = Date.UTC(2000, 0, 6, 18, 14) / 1000;
  const SYNODIC = 29.530588 * 86400;
  const age = (((now.getTime() / 1000 - REF) % SYNODIC) + SYNODIC) % SYNODIC;
  const phase = age / SYNODIC;
  if (phase < 0.03 || phase > 0.97) return "Nouvelle Lune";
  if (phase < 0.22) return "Premier Croissant";
  if (phase < 0.28) return "Premier Quartier";
  if (phase < 0.47) return "Lune Gibbeuse Croissante";
  if (phase < 0.53) return "Pleine Lune";
  if (phase < 0.72) return "Lune Gibbeuse Décroissante";
  if (phase < 0.78) return "Dernier Quartier";
  return "Dernier Croissant";
}

/** Single-character glyph for the current moon phase. */
export function moonGlyph(now: Date = new Date()): string {
  const REF = Date.UTC(2000, 0, 6, 18, 14) / 1000;
  const SYNODIC = 29.530588 * 86400;
  const age = (((now.getTime() / 1000 - REF) % SYNODIC) + SYNODIC) % SYNODIC;
  const phase = age / SYNODIC;
  const glyphs = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
  const idx = Math.round(phase * 8) % 8;
  return glyphs[idx];
}

/** Days since a fixed season start (used for "Saison 01 · J+12"). */
export function daysSince(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / DAY));
}
