/**
 * Minecraft §-code MOTD parser → React spans.
 * Supports colours §0–§f and a few formatting flags (§l bold, §o italic,
 * §n underline, §m strike, §r reset, §k obfuscated rendered as a static
 * gradient — we don't animate it to keep things calm).
 */
import { Fragment } from "react";

const COLORS: Record<string, string> = {
  "0": "#000000", "1": "#0000aa", "2": "#00aa00", "3": "#00aaaa",
  "4": "#aa0000", "5": "#aa00aa", "6": "#ffaa00", "7": "#aaaaaa",
  "8": "#555555", "9": "#5555ff", a: "#55ff55", b: "#55ffff",
  c: "#ff5555", d: "#ff55ff", e: "#ffff55", f: "#ffffff",
};

interface RunStyle {
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  obf: boolean;
}

function fresh(): RunStyle {
  return { color: "#ffffff", bold: false, italic: false, underline: false, strike: false, obf: false };
}

function toCss(s: RunStyle): React.CSSProperties {
  const decoration: string[] = [];
  if (s.underline) decoration.push("underline");
  if (s.strike) decoration.push("line-through");
  return {
    color: s.color,
    fontWeight: s.bold ? 700 : 400,
    fontStyle: s.italic ? "italic" : "normal",
    textDecoration: decoration.join(" ") || undefined,
    filter: s.obf ? "blur(0.4px)" : undefined,
    textShadow: s.bold ? `0 0 6px ${s.color}55` : undefined,
  };
}

export function parseMotd(motd: string): React.ReactNode {
  if (!motd) return null;
  const out: React.ReactNode[] = [];
  let style = fresh();
  let buffer = "";
  const flush = (key: number) => {
    if (!buffer) return;
    out.push(<span key={key} style={toCss(style)}>{buffer}</span>);
    buffer = "";
  };
  let key = 0;
  for (let i = 0; i < motd.length; i++) {
    const ch = motd[i];
    if (ch === "§" && i + 1 < motd.length) {
      flush(key++);
      const code = motd[i + 1].toLowerCase();
      if (COLORS[code]) { style = { ...style, color: COLORS[code] }; }
      else if (code === "l") style = { ...style, bold: true };
      else if (code === "o") style = { ...style, italic: true };
      else if (code === "n") style = { ...style, underline: true };
      else if (code === "m") style = { ...style, strike: true };
      else if (code === "k") style = { ...style, obf: true };
      else if (code === "r") style = fresh();
      i++;
    } else if (ch === "\n") {
      flush(key++);
      out.push(<br key={key++} />);
    } else {
      buffer += ch;
    }
  }
  flush(key++);
  return <Fragment>{out}</Fragment>;
}
