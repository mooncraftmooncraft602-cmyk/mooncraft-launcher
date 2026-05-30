import "./ProgressBar.css";

interface Props {
  percent: number;
  label?: string;
  meta?: string;
}

export function ProgressBar({ percent, label, meta }: Props) {
  const clamped = Math.max(0, Math.min(100, percent));
  // CSS variable drives a smooth hue shift from violet → cyan → green.
  // 0%:  violet, 50%: cyan, 100%: green.
  return (
    <div className="progress" style={{ "--p": clamped } as React.CSSProperties}>
      {(label || meta) && (
        <div className="progress__head">
          <span className="progress__label">{label}</span>
          <span className="progress__meta num">{meta}</span>
        </div>
      )}
      <div className="progress__track">
        <div
          className="progress__fill"
          style={{ width: `${clamped}%` }}
        >
          <span className="progress__shine" />
        </div>
        <span className="progress__percent num" aria-hidden>{clamped.toFixed(0)}%</span>
      </div>
    </div>
  );
}
