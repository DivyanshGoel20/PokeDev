"use client";
// Tiny synthesized sound effects (no audio files needed).
let ctx: AudioContext | null = null;

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.15, slideTo?: number, delay = 0) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export const sfx = {
  unlock: () => ac(),
  throw: () => tone(300, 0.35, "triangle", 0.12, 900),
  hit: () => {
    tone(1200, 0.25, "sine", 0.15, 200);
    tone(80, 0.3, "square", 0.05);
  },
  wobble: () => tone(180, 0.12, "triangle", 0.18, 120),
  click: () => {
    tone(1400, 0.06, "square", 0.08);
    tone(2000, 0.08, "square", 0.06, undefined, 0.07);
  },
  success: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, "triangle", 0.13, undefined, 0.1 + i * 0.09)),
  fail: () => tone(400, 0.4, "sawtooth", 0.07, 90),
  miss: () => tone(500, 0.3, "sine", 0.08, 150),
};
