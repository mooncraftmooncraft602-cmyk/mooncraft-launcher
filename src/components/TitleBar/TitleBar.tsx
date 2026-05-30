import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import "./TitleBar.css";

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const win = getCurrentWindow();

  useEffect(() => {
    win.isMaximized().then(setMaximized).catch(() => {});
    const unsub = win.onResized(() => {
      win.isMaximized().then(setMaximized).catch(() => {});
    });
    return () => {
      unsub.then((f) => f()).catch(() => {});
    };
  }, [win]);

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar__brand" data-tauri-drag-region>
        <div className="titlebar__logo" aria-hidden>
          <svg viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="22" cy="13" r="3" fill="currentColor" opacity="0.85" />
            <circle cx="12" cy="20" r="1.5" fill="currentColor" opacity="0.6" />
          </svg>
        </div>
        <div className="titlebar__title">
          <span className="titlebar__title-main">MOON</span>
          <span className="titlebar__title-accent">CRAFT</span>
          <span className="titlebar__title-sub">LAUNCHER</span>
        </div>
      </div>

      <div className="titlebar__spacer" data-tauri-drag-region />

      <div className="titlebar__controls">
        <button
          className="titlebar__btn"
          aria-label="Minimize"
          onClick={() => win.minimize()}
        >
          <svg viewBox="0 0 12 12"><line x1="2" y1="6" x2="10" y2="6" /></svg>
        </button>
        <button
          className="titlebar__btn"
          aria-label="Maximize"
          onClick={() => win.toggleMaximize()}
        >
          {maximized ? (
            <svg viewBox="0 0 12 12">
              <rect x="3" y="3" width="6" height="6" fill="none" />
            </svg>
          ) : (
            <svg viewBox="0 0 12 12">
              <rect x="2" y="2" width="8" height="8" fill="none" />
            </svg>
          )}
        </button>
        <button
          className="titlebar__btn titlebar__btn--close"
          aria-label="Close"
          onClick={() => win.close()}
        >
          <svg viewBox="0 0 12 12">
            <line x1="2" y1="2" x2="10" y2="10" />
            <line x1="10" y1="2" x2="2" y2="10" />
          </svg>
        </button>
      </div>
    </header>
  );
}
