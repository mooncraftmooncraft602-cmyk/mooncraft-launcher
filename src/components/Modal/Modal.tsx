import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { play } from "@/utils/sounds";
import "./Modal.css";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** "default" | "wide" | "full". */
  size?: "default" | "wide" | "full";
  /** Disable Escape / click-outside dismiss (e.g. blocking confirmations). */
  blocking?: boolean;
}

export function Modal({ open, onClose, title, children, size = "default", blocking }: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  // ESC to close, focus trap on open
  useEffect(() => {
    if (!open) return;
    play("open");
    const prev = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (blocking) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab" && cardRef.current) {
        const focusables = cardRef.current.querySelectorAll<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          last.focus(); e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus(); e.preventDefault();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose, blocking]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => {
            if (blocking) return;
            if (e.target === e.currentTarget) {
              play("close");
              onClose();
            }
          }}
        >
          <motion.div
            ref={cardRef}
            tabIndex={-1}
            className={`modal modal--${size}`}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8, transition: { duration: 0.14 } }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === "string" ? title : undefined}
          >
            {title && (
              <header className="modal__head">
                <h2 className="modal__title">{title}</h2>
                <button
                  className="modal__close"
                  onClick={() => { play("close"); onClose(); }}
                  aria-label="Fermer"
                  type="button"
                >
                  ✕
                </button>
              </header>
            )}
            <div className="modal__body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
