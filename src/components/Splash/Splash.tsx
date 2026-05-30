import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import "./Splash.css";

interface Props {
  /** Total time the splash should be visible, in ms. */
  duration?: number;
  onComplete?: () => void;
}

/**
 * Boot-time splash. Displays a rocket-rise above a stylised moon disc,
 * fades out after `duration` ms. Used once per app session. The host
 * controls its own mount/unmount.
 */
export function Splash({ duration = 1800, onComplete }: Props) {
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setShown(false), duration);
    return () => window.clearTimeout(t);
  }, [duration]);

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {shown && (
        <motion.div
          className="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4 } }}
          aria-hidden
        >
          <div className="splash__bg" />
          <div className="splash__moon" />
          <div className="splash__halo" />
          <div className="splash__halo splash__halo--inner" />

          <div className="splash__title">
            <span className="splash__title-pre">M O O N</span>
            <span className="splash__title-main">CRAFT</span>
          </div>

          <div className="splash__loader">
            <span className="splash__loader-bar" />
          </div>

          <div className="splash__caption">Initializing flight systems…</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
