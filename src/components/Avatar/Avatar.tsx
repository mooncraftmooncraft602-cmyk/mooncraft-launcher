import { useEffect, useMemo, useState } from "react";
import { api } from "@/api";
import "./Avatar.css";

interface Props {
  /** Account ID. If provided, the locally imported skin is fetched first. */
  accountId?: string;
  /** UUID for the Crafatar fallback. */
  uuid?: string | null;
  username: string;
  size?: number;
  active?: boolean;
  premium?: boolean;
}

/**
 * Player avatar. Priority:
 *   1. Locally imported skin (`get_skin_data_url`) — renders the face crop
 *      from the PNG via a canvas, so the skin looks identical to in-game.
 *   2. Crafatar — works for premium accounts (Mojang-signed UUIDs).
 *   3. Letter fallback.
 */
export function Avatar({ accountId, uuid, username, size = 56, active = false, premium }: Props) {
  const cleanedUuid = useMemo(() => (uuid ?? "").replace(/-/g, ""), [uuid]);
  const crafatar = cleanedUuid
    ? `https://crafatar.com/avatars/${cleanedUuid}?size=${size * 2}&overlay&default=MHF_Steve`
    : null;
  const [localFace, setLocalFace] = useState<string | null>(null);
  const [crafatarErr, setCrafatarErr] = useState(false);
  const letter = username.slice(0, 1).toUpperCase();

  // Async: pull the imported skin and slice the 8x8 face out so we don't
  // need an HTTP roundtrip OR a stretched whole-skin preview.
  useEffect(() => {
    if (!accountId) { setLocalFace(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const dataUrl = await api.getSkinDataUrl(accountId);
        if (cancelled || !dataUrl) { setLocalFace(null); return; }
        const cropped = await cropFace(dataUrl, size * 2);
        if (!cancelled) setLocalFace(cropped);
      } catch {
        if (!cancelled) setLocalFace(null);
      }
    })();
    return () => { cancelled = true; };
  }, [accountId, size]);

  const src = localFace ?? (!crafatarErr ? crafatar : null);

  return (
    <div
      className={`avatar ${active ? "is-active" : ""}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Skin de ${username}`}
    >
      {src ? (
        <img
          src={src}
          width={size}
          height={size}
          loading="lazy"
          onError={() => setCrafatarErr(true)}
          alt=""
          draggable={false}
        />
      ) : (
        <span className="avatar__letter" style={{ fontSize: size * 0.42 }}>{letter}</span>
      )}
      {premium === false && <span className="avatar__pip avatar__pip--offline" title="Compte hors-ligne" />}
      {premium === true  && <span className="avatar__pip avatar__pip--premium" title="Compte premium" />}
    </div>
  );
}

/**
 * Crop the 8×8 face from a 64×64 (or 64×32 legacy) Minecraft skin PNG, then
 * upscale to `out` pixels and return a fresh data URL. We also overlay the
 * hat layer (8×8 at x=40..47, y=8..15) for the familiar in-game look.
 */
function cropFace(srcDataUrl: string, out: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = out;
      canvas.height = out;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("no 2d ctx")); return; }
      ctx.imageSmoothingEnabled = false;
      // Base head (8..15, 8..15) → scaled to full out
      ctx.drawImage(img, 8, 8, 8, 8, 0, 0, out, out);
      // Hat overlay (40..47, 8..15) → same destination, slightly inset
      ctx.drawImage(img, 40, 8, 8, 8, 0, 0, out, out);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("skin decode failed"));
    img.src = srcDataUrl;
  });
}
