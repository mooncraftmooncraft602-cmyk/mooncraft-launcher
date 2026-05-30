import { AnimatePresence, motion } from "framer-motion";
import { useToasts, type Toast as T } from "@/stores/toasts";
import "./Toast.css";

const ICON: Record<T["kind"], string> = {
  info: "ℹ︎",
  success: "✓",
  warn: "!",
  error: "✕",
  transmission: "📡",
};

export function ToastContainer() {
  const items = useToasts((s) => s.items);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <div className="toast-container" aria-live="polite" aria-atomic="false">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div
            key={t.id}
            className={`toast toast--${t.kind}`}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40, transition: { duration: 0.16 } }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => dismiss(t.id)}
            role="status"
          >
            <span className="toast__icon" aria-hidden>{ICON[t.kind]}</span>
            <div className="toast__body">
              <div className="toast__title">{t.title}</div>
              {t.body && <div className="toast__desc">{t.body}</div>}
            </div>
            <button
              className="toast__close"
              onClick={(e) => { e.stopPropagation(); dismiss(t.id); }}
              aria-label="Fermer"
            >
              ✕
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
