import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { play } from "@/utils/sounds";
import "./PlayButton.css";

export type PlayButtonState =
  | { kind: "checking" }
  | { kind: "ready"; label?: string }
  | { kind: "updating"; percent: number; speed: string; eta?: string }
  | { kind: "launching" }
  | { kind: "running" }
  | { kind: "error"; message: string };

interface Props {
  state: PlayButtonState;
  onClick: () => void;
  disabled?: boolean;
}

interface Ripple { id: number; x: number; y: number; }
let rippleId = 0;

export function PlayButton({ state, onClick, disabled }: Props) {
  const label = labelFor(state);
  const sub = subFor(state);
  const showRing = state.kind === "updating";
  const percent = state.kind === "updating" ? Math.min(100, Math.max(0, state.percent)) : 0;
  const isBlocked =
    disabled ||
    state.kind === "checking" ||
    state.kind === "updating" ||
    state.kind === "launching" ||
    state.kind === "running";

  const [ripples, setRipples] = useState<Ripple[]>([]);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isBlocked) return;
    play(state.kind === "error" ? "error" : "play");
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const r: Ripple = { id: ++rippleId, x: e.clientX - rect.left, y: e.clientY - rect.top };
      setRipples((rs) => [...rs, r]);
      window.setTimeout(() => setRipples((rs) => rs.filter((x) => x.id !== r.id)), 700);
    }
    onClick();
  };

  return (
    <div className={`play-stack play-stack--${state.kind}`}>
      {/* Orbital rings — visible behind the button */}
      <span className="play-orbit play-orbit--outer" aria-hidden />
      <span className="play-orbit play-orbit--inner" aria-hidden />
      <span className="play-moon" aria-hidden />

      <motion.button
        ref={btnRef}
        className={`play-btn play-btn--${state.kind} ${isBlocked ? "is-blocked" : "is-ready"}`}
        onClick={handleClick}
        onMouseEnter={() => !isBlocked && play("hover")}
        disabled={isBlocked}
        whileHover={!isBlocked ? { scale: 1.02 } : undefined}
        whileTap={!isBlocked ? { scale: 0.97 } : undefined}
      >
        <span className="play-btn__glow" aria-hidden />
        <span className="play-btn__edge" aria-hidden />

        <span className="play-btn__content">
          {state.kind === "ready" && (
            <svg className="play-btn__icon" viewBox="0 0 24 24" aria-hidden>
              <path d="M8 5v14l11-7z" fill="currentColor" />
            </svg>
          )}
          {state.kind === "error" && (
            <svg className="play-btn__icon" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 14h-2v-2h2zm0-4h-2V6h2z" fill="currentColor" />
            </svg>
          )}
          <span className="play-btn__text">
            <span className="play-btn__label">{label}</span>
            {sub && <span className="play-btn__sub">{sub}</span>}
          </span>
        </span>

        {showRing && (
          <span
            className="play-btn__progress"
            style={{ "--p": percent } as React.CSSProperties}
            aria-hidden
          />
        )}

        {/* Click ripples */}
        {ripples.map((r) => (
          <span
            key={r.id}
            className="play-btn__ripple"
            style={{ left: r.x, top: r.y }}
            aria-hidden
          />
        ))}
      </motion.button>
    </div>
  );
}

function labelFor(s: PlayButtonState): string {
  switch (s.kind) {
    case "checking": return "Scanning…";
    case "ready":    return s.label ?? "Play";
    case "updating": return `Patching ${Math.min(100, Math.max(0, s.percent)).toFixed(0)}%`;
    case "launching":return "Launching…";
    case "running":  return "In Orbit";
    case "error":    return "Retry";
  }
}
function subFor(s: PlayButtonState): string | null {
  switch (s.kind) {
    case "updating": return `${s.speed}${s.eta ? " · " + s.eta : ""}`;
    case "running":  return "Game session active";
    case "error":    return s.message;
    default:         return null;
  }
}
