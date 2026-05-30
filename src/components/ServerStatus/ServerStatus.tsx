import type { ServerStatus as Status } from "@/types";
import "./ServerStatus.css";

interface Props {
  status: Status | null;
  /** Display label — never the raw IP. */
  label?: string;
}

export function ServerStatus({ status, label = "Station MoonCraft" }: Props) {
  const online = !!status?.online;
  return (
    <div className={`server-status ${online ? "is-online" : "is-offline"}`}>
      <div className="server-status__top">
        <span className="server-status__dot" />
        <span className="server-status__label">
          {online ? "ONLINE" : status ? "OFFLINE" : "PINGING…"}
        </span>
        {online && status && (
          <span className="server-status__ping num">{status.latency_ms} ms</span>
        )}
      </div>
      <div className="server-status__host">{label}</div>
      {online && status && (
        <div className="server-status__players">
          <strong className="num">{status.players_online}</strong>
          <span>/ {status.players_max} pilots in orbit</span>
        </div>
      )}
      {status && !online && (
        <div className="server-status__players">
          <span>Server unreachable</span>
        </div>
      )}
    </div>
  );
}
