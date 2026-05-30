import { useEffect, useRef } from "react";

/**
 * Canvas-based parallax starfield. Lightweight (~2KB heap) and pegs at
 * 60fps on integrated GPUs because we only redraw moving stars per frame.
 */
export function StarField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let stars: Star[] = [];
    let width = 0;
    let height = 0;

    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function seed() {
      const count = Math.floor((width * height) / 6500);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        z: Math.random() * 0.9 + 0.1,
        r: Math.random() * 1.4 + 0.2,
        hue: Math.random() > 0.7 ? 290 : 190,
        flicker: Math.random() * Math.PI * 2,
      }));
    }

    function tick(t: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      // Vignette-ish overlay gradient.
      const g = ctx.createRadialGradient(
        width * 0.7, height * 0.2, 60,
        width * 0.5, height * 0.5, Math.max(width, height) * 0.8,
      );
      g.addColorStop(0, "rgba(124, 78, 255, 0.08)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);

      for (const s of stars) {
        s.y += s.z * 0.18;
        if (s.y > height + 2) {
          s.y = -2;
          s.x = Math.random() * width;
        }
        const a = 0.45 + Math.sin(t * 0.001 + s.flicker) * 0.35;
        ctx.beginPath();
        ctx.fillStyle = `hsla(${s.hue}, 100%, 80%, ${a * s.z})`;
        ctx.arc(s.x, s.y, s.r * s.z, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    }

    resize();
    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="starfield" />;
}

interface Star {
  x: number;
  y: number;
  z: number;
  r: number;
  hue: number;
  flicker: number;
}
