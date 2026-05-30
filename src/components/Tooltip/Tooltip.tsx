import { useId, useState, type ReactNode } from "react";
import "./Tooltip.css";

interface Props {
  label: ReactNode;
  children: ReactNode;
  /** Side relative to the trigger. */
  side?: "top" | "bottom" | "left" | "right";
  /** Delay before showing, in ms. */
  delay?: number;
}

/**
 * Lightweight CSS-driven tooltip. Hover or keyboard focus on the trigger
 * reveals the floating label. No portal — sits relatively inside the
 * trigger's wrapper. Good enough for short hints.
 */
export function Tooltip({ label, children, side = "top", delay = 220 }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  let timer: number | undefined;

  const show = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    window.clearTimeout(timer);
    setOpen(false);
  };

  return (
    <span
      className="tt-anchor"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && (
        <span id={id} role="tooltip" className={`tt tt--${side}`}>
          {label}
        </span>
      )}
    </span>
  );
}
