/**
 * Web Audio synthesized SFX — zero asset files, ~150 lines.
 * Each cue is an envelope on one or two oscillators. Volume is muted in
 * Settings via `setSfxVolume(0)`. Calls before a user gesture are queued
 * (browsers block AudioContext until interaction).
 */

type CueName =
  | "click"
  | "hover"
  | "open"
  | "close"
  | "success"
  | "error"
  | "play"
  | "complete"
  | "transmission"
  | "achievement"
  | "tick";

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let sfxVolume = 0.4;       // 0..1
let primed = false;        // user-gesture passed

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = sfxVolume;
    masterGain.connect(ctx.destination);
  }
  // resume after first user gesture
  if (ctx.state === "suspended" && primed) {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function setSfxVolume(v: number) {
  sfxVolume = Math.max(0, Math.min(1, v));
  if (masterGain) masterGain.gain.value = sfxVolume;
}

export function getSfxVolume() { return sfxVolume; }

/** Call once on first user gesture so the context isn't suspended. */
export function primeAudio() {
  primed = true;
  const c = ensure();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

interface ToneOpts {
  freq: number;
  duration: number;
  type?: OscillatorType;
  attack?: number;
  release?: number;
  detune?: number;
  glide?: number; // target freq for portamento
  gain?: number;
}

function tone(o: ToneOpts) {
  const c = ensure();
  if (!c || !masterGain) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.value = o.freq;
  if (o.detune) osc.detune.value = o.detune;
  const now = c.currentTime;
  const peak = (o.gain ?? 0.3);
  const a = o.attack ?? 0.005;
  const r = o.release ?? 0.05;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(peak, now + a);
  g.gain.exponentialRampToValueAtTime(0.0001, now + o.duration + r);
  if (o.glide) {
    osc.frequency.linearRampToValueAtTime(o.glide, now + o.duration);
  }
  osc.connect(g).connect(masterGain);
  osc.start(now);
  osc.stop(now + o.duration + r + 0.02);
}

/** Soft white-noise burst — used for woosh / boom. */
function noise(duration: number, gain = 0.25, filter: number | null = null) {
  const c = ensure();
  if (!c || !masterGain) return;
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * duration)), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.8;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  const now = c.currentTime;
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  let head: AudioNode = src;
  if (filter !== null) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = filter;
    src.connect(f);
    head = f;
  }
  head.connect(g).connect(masterGain);
  src.start(now);
  src.stop(now + duration + 0.02);
}

export function play(name: CueName) {
  if (sfxVolume === 0) return;
  switch (name) {
    case "click":
      tone({ freq: 880, duration: 0.04, type: "triangle", gain: 0.22 });
      break;
    case "hover":
      tone({ freq: 1400, duration: 0.025, type: "sine", gain: 0.08 });
      break;
    case "open":
      tone({ freq: 320, duration: 0.16, glide: 720, type: "sine", gain: 0.2 });
      break;
    case "close":
      tone({ freq: 720, duration: 0.16, glide: 320, type: "sine", gain: 0.2 });
      break;
    case "success":
      tone({ freq: 660, duration: 0.08, type: "triangle", gain: 0.24 });
      setTimeout(() => tone({ freq: 990, duration: 0.12, type: "triangle", gain: 0.24 }), 70);
      break;
    case "error":
      tone({ freq: 220, duration: 0.18, type: "square", gain: 0.18, glide: 110 });
      break;
    case "play":
      // Sweep up "ignition"
      tone({ freq: 110, duration: 0.4, glide: 880, type: "sawtooth", gain: 0.18 });
      noise(0.45, 0.18, 1200);
      break;
    case "complete":
      tone({ freq: 523, duration: 0.08, type: "triangle", gain: 0.22 });
      setTimeout(() => tone({ freq: 783, duration: 0.08, type: "triangle", gain: 0.22 }), 90);
      setTimeout(() => tone({ freq: 1046, duration: 0.16, type: "triangle", gain: 0.22 }), 180);
      break;
    case "transmission":
      tone({ freq: 1800, duration: 0.04, type: "square", gain: 0.16 });
      setTimeout(() => tone({ freq: 1200, duration: 0.06, type: "square", gain: 0.16 }), 60);
      break;
    case "achievement":
      tone({ freq: 880, duration: 0.1, type: "triangle", gain: 0.26 });
      setTimeout(() => tone({ freq: 1320, duration: 0.1, type: "triangle", gain: 0.26 }), 110);
      setTimeout(() => tone({ freq: 1760, duration: 0.22, type: "triangle", gain: 0.26 }), 230);
      break;
    case "tick":
      tone({ freq: 2400, duration: 0.015, type: "square", gain: 0.06 });
      break;
  }
}
