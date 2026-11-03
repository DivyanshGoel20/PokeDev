"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  cameraErrorMessage,
  coverMap,
  describeFaces,
  detectBoxes,
  loadFace,
  startCamera,
  stopCamera,
  type Box,
} from "@/lib/face";
import { postJSON } from "@/lib/client";
import { sfx } from "@/lib/sfx";
import { typeInfo, type PublicUser } from "@/lib/types";
import { PlayerCard } from "@/components/PlayerCard";

type CatchResult = "caught" | "already" | "nomatch" | "hidden" | "self" | "unclear" | "error";
type ApiResult = { result?: CatchResult; user?: PublicUser; error?: string };

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; star?: boolean };

type BallState =
  | { k: "idle"; t0: number }
  | { k: "drag"; x: number; y: number }
  | { k: "fly"; t0: number; x0: number; y0: number; x1: number; y1: number; s1: number; hit: Box | null }
  | { k: "absorb"; t0: number; x: number; y: number; s: number; face: Box }
  | { k: "drop"; t0: number; x: number; y0: number; y1: number; s: number }
  | { k: "wobble"; t0: number; x: number; y: number; s: number; ticks: number }
  | { k: "click"; t0: number; x: number; y: number; s: number }
  | { k: "burst"; t0: number; x: number; y: number; s: number }
  | { k: "fall"; t0: number; x: number; y: number; vx: number; vy: number; s: number };

const R = 40; // ball radius in CSS px
const FLIGHT = 620;
const ABSORB = 520;
const DROP = 380;
const WOBBLE = 720; // per wobble (swing + rest)
const MIN_WOBBLES = 3;

const MESSAGES: Record<Exclude<CatchResult, "caught" | "already">, string> = {
  nomatch: "They broke free! They're not a PokeDev player yet — tell them to join 👀",
  hidden: "They're in hide mode right now 🙈",
  self: "That's you! You can't catch yourself 😄",
  unclear: "Couldn't get a clear look — get closer and try again",
  error: "Connection hiccup — try again",
};

export default function CatchGame({ initialCount }: { initialCount: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [count, setCount] = useState(initialCount);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<{ user: PublicUser; fresh: boolean } | null>(null);
  const [facesSeen, setFacesSeen] = useState(0);
  const [hintGone, setHintGone] = useState(false);

  // mutable game state shared with the render loop
  const g = useRef({
    boxes: [] as Box[],
    ball: { k: "idle", t0: 0 } as BallState,
    particles: [] as Particle[],
    flash: 0,
    trail: [] as { x: number; y: number; t: number }[],
    result: null as ApiResult | null,
    tracking: true,
    mirrored: false,
    modalOpen: false,
  });

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? "" : t)), 3200);
  }, []);

  /* ---------------- camera + models ---------------- */
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
        stopCamera(streamRef.current);
        const [stream] = await Promise.all([startCamera(videoRef.current!, facing), loadFace()]);
        if (cancelled) return stopCamera(stream);
        streamRef.current = stream;
        g.current.mirrored = facing === "user";
        setStatus("ready");
      } catch (e) {
        if (!cancelled) {
          setError(cameraErrorMessage(e));
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [facing]);

  useEffect(() => () => stopCamera(streamRef.current), []);

  /* ---------------- live face tracking ---------------- */
  useEffect(() => {
    if (status !== "ready") return;
    let alive = true;
    let lastSeen = 0;
    (async () => {
      while (alive) {
        const v = videoRef.current;
        if (g.current.tracking && v && v.readyState >= 2) {
          const boxes = await detectBoxes(v).catch((e) => {
            console.warn("face tracking failed", e);
            return [] as Box[];
          });
          if (!alive) break;
          // Hold the last seen faces briefly so the reticle doesn't flicker on a missed frame.
          const now = performance.now();
          if (boxes.length || now - lastSeen > 600) {
            g.current.boxes = boxes;
            setFacesSeen(boxes.length);
            const c = canvasRef.current;
            if (c && v.videoWidth) {
              // expose on-screen face centers (used by automated tests)
              const m = coverMap(v.videoWidth, v.videoHeight, window.innerWidth, window.innerHeight, g.current.mirrored);
              c.dataset.faces = JSON.stringify(
                boxes.map(m.toScreen).map((b) => [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)]),
              );
            }
          }
          if (boxes.length) lastSeen = now;
        }
        await new Promise((r) => setTimeout(r, 90));
      }
    })();
    return () => {
      alive = false;
    };
  }, [status]);

  /* ---------------- catch: snapshot -> descriptor -> server ---------------- */
  const resolveCatch = useCallback(async (target: Box) => {
    const v = videoRef.current!;
    const snap = document.createElement("canvas");
    snap.width = v.videoWidth;
    snap.height = v.videoHeight;
    snap.getContext("2d")!.drawImage(v, 0, 0);
    g.current.tracking = false;
    try {
      const faces = await describeFaces(snap);
      const tcx = target.x + target.width / 2;
      const tcy = target.y + target.height / 2;
      let best: (typeof faces)[number] | null = null;
      let bestD = Infinity;
      for (const f of faces) {
        const d = Math.hypot(f.box.x + f.box.width / 2 - tcx, f.box.y + f.box.height / 2 - tcy);
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
      // The face we aimed at may have moved slightly between the live frame and the snapshot.
      if (!best || bestD > target.width) {
        g.current.result = { result: "unclear" };
        return;
      }
      const r = await postJSON<ApiResult>("/api/catch", { descriptor: best.descriptor });
      g.current.result = r.error ? { result: "error", error: r.error } : r;
    } catch {
      g.current.result = { result: "error" };
    } finally {
      g.current.tracking = true;
    }
  }, []);

  /* ---------------- render loop + input ---------------- */
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let W = 0;
    let H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
    }
    resize();
    window.addEventListener("resize", resize);

    const rest = () => ({ x: W / 2, y: H - 120 });
    const S = g.current;

    function screenBoxes(): Box[] {
      const v = videoRef.current;
      if (!v || !v.videoWidth) return [];
      const m = coverMap(v.videoWidth, v.videoHeight, W, H, S.mirrored);
      return S.boxes.map(m.toScreen);
    }

    function burst(x: number, y: number, n: number, colors: string[], speed = 6, star = false) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = speed * (0.4 + Math.random());
        S.particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - (star ? 2 : 0),
          life: 0,
          max: 40 + Math.random() * 30,
          color: colors[(Math.random() * colors.length) | 0],
          size: star ? 6 + Math.random() * 6 : 2 + Math.random() * 3,
          star,
        });
      }
    }

    /* ----- input ----- */
    let pts: { x: number; y: number; t: number }[] = [];
    function onDown(e: PointerEvent) {
      if (S.modalOpen || S.ball.k !== "idle") return;
      const r = rest();
      if (Math.hypot(e.clientX - r.x, e.clientY - r.y) > R * 2) return;
      sfx.unlock();
      canvas.setPointerCapture(e.pointerId);
      S.ball = { k: "drag", x: e.clientX, y: e.clientY };
      pts = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
      setHintGone(true);
    }
    function onMove(e: PointerEvent) {
      if (S.ball.k !== "drag") return;
      S.ball = { k: "drag", x: e.clientX, y: e.clientY };
      pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (pts.length > 12) pts.shift();
    }
    function onUp(e: PointerEvent) {
      if (S.ball.k !== "drag") return;
      const now = performance.now();
      const recent = pts.filter((p) => now - p.t < 110);
      const p0 = recent[0] ?? pts[0];
      const dt = Math.max(16, now - p0.t);
      const vx = (e.clientX - p0.x) / dt;
      const vy = (e.clientY - p0.y) / dt;
      const speed = Math.hypot(vx, vy);
      if (vy < -0.35 && speed > 0.45) {
        throwBall(e.clientX, e.clientY, vx / speed, vy / speed, speed, now);
        return;
      }
      // Slow but long upward drag also counts as a throw (helps on laggy phones).
      const start = rest();
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const len = Math.hypot(dx, dy);
      if (dy < -90) {
        throwBall(e.clientX, e.clientY, dx / len, dy / len, 1, now);
        return;
      }
      S.ball = { k: "idle", t0: now }; // not a throw, snap back
    }

    function throwBall(x: number, y: number, dx: number, dy: number, speed: number, now: number) {
      sfx.throw();
      // find the face closest to the throw line
      const boxes = screenBoxes();
      let hitIdx = -1;
      let bestPerp = Infinity;
      boxes.forEach((b, i) => {
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        const wx = cx - x;
        const wy = cy - y;
        const along = wx * dx + wy * dy;
        const perp = Math.abs(wx * dy - wy * dx);
        const tol = Math.max(b.width * 1.2, 90); // generous aim assist
        if (along > 0 && perp < tol && perp < bestPerp) {
          bestPerp = perp;
          hitIdx = i;
        }
      });
      if (hitIdx >= 0) {
        const b = boxes[hitIdx];
        const s1 = Math.min(1, Math.max(0.42, b.width / 260));
        S.result = null;
        void resolveCatch(S.boxes[hitIdx]);
        S.ball = { k: "fly", t0: now, x0: x, y0: y, x1: b.x + b.width / 2, y1: b.y + b.height / 2, s1, hit: b };
      } else {
        const dist = Math.min(H * 0.6, 200 + speed * 220);
        S.ball = { k: "fly", t0: now, x0: x, y0: y, x1: x + dx * dist, y1: y + dy * dist, s1: 0.5, hit: null };
      }
    }

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    /* ----- drawing helpers ----- */
    function drawBall(x: number, y: number, s: number, rot = 0, open = 0, glow = 0) {
      const r = R * s;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      if (glow > 0) {
        ctx.shadowColor = `rgba(34,211,238,${glow})`;
        ctx.shadowBlur = 40 * glow;
      }
      // bottom half
      const gb = ctx.createRadialGradient(-r * 0.3, -r * 0.2, r * 0.1, 0, 0, r);
      gb.addColorStop(0, "#3a3560");
      gb.addColorStop(1, "#0d0b1c");
      ctx.fillStyle = gb;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI);
      ctx.fill();
      // top half (hinged open)
      ctx.save();
      if (open > 0) {
        ctx.translate(-r, 0);
        ctx.rotate(-open * 1.1);
        ctx.translate(r, -open * r * 0.15);
      }
      const gt = ctx.createRadialGradient(-r * 0.35, -r * 0.55, r * 0.05, 0, -r * 0.2, r * 1.1);
      gt.addColorStop(0, "#e2d6ff");
      gt.addColorStop(0.35, "#8b5cf6");
      gt.addColorStop(1, "#3b1680");
      ctx.fillStyle = gt;
      ctx.beginPath();
      ctx.arc(0, 0, r, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#07060f";
      ctx.fillRect(-r, -r * 0.08, r * 2, r * 0.08);
      ctx.fillStyle = "rgba(255,255,255,.35)";
      ctx.beginPath();
      ctx.ellipse(-r * 0.35, -r * 0.55, r * 0.26, r * 0.13, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.shadowBlur = 0;
      // band + button
      ctx.fillStyle = "#07060f";
      ctx.fillRect(-r, 0, r * 2, r * 0.08);
      if (open < 0.05) {
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
        const gbtn = ctx.createRadialGradient(0, -r * 0.05, 0, 0, 0, r * 0.22);
        gbtn.addColorStop(0, "#fff");
        gbtn.addColorStop(0.6, glow > 0 ? "#67e8f9" : "#a5f3fc");
        gbtn.addColorStop(1, "#22d3ee");
        ctx.fillStyle = gbtn;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.21, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawReticle(b: Box, t: number, active: boolean) {
      const pad = b.width * 0.12;
      const x = b.x - pad;
      const y = b.y - pad;
      const w = b.width + pad * 2;
      const h = b.height + pad * 2;
      const L = Math.min(w, h) * 0.24;
      const pulse = 1 + Math.sin(t / 220) * 0.03;
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(pulse, pulse);
      ctx.translate(-(x + w / 2), -(y + h / 2));
      ctx.strokeStyle = active ? "#ff4d8d" : "#22d3ee";
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const [cx, cy, sx, sy] of [
        [x, y, 1, 1],
        [x + w, y, -1, 1],
        [x, y + h, 1, -1],
        [x + w, y + h, -1, -1],
      ]) {
        ctx.moveTo(cx, cy + sy * L);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + sx * L, cy);
      }
      ctx.stroke();
      ctx.restore();
    }

    function star(x: number, y: number, r: number, rot: number) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 ? r * 0.45 : r;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    /* ----- main loop ----- */
    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const b = S.ball;
      const boxes = screenBoxes();
      const showReticles = b.k === "idle" || b.k === "drag" || b.k === "fly";
      if (showReticles) boxes.forEach((bx) => drawReticle(bx, now, b.k === "fly" && !!b.hit));

      // ground glow under resting ball
      const r0 = rest();
      if (b.k === "idle" || b.k === "drag") {
        const gg = ctx.createRadialGradient(r0.x, r0.y + R, 0, r0.x, r0.y + R, R * 2);
        gg.addColorStop(0, "rgba(139,92,246,.45)");
        gg.addColorStop(1, "rgba(139,92,246,0)");
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.ellipse(r0.x, r0.y + R + 6, R * 2, R * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      switch (b.k) {
        case "idle": {
          const pop = Math.min(1, (now - b.t0) / 300);
          const s = pop < 1 ? 0.6 + 0.4 * ease(pop) + Math.sin(pop * Math.PI) * 0.15 : 1;
          drawBall(r0.x, r0.y + Math.sin(now / 400) * 5, s, Math.sin(now / 700) * 0.12);
          break;
        }
        case "drag":
          drawBall(b.x, b.y, 1.05, (b.x - r0.x) / 200);
          break;
        case "fly": {
          const t = Math.min(1, (now - b.t0) / FLIGHT);
          const e = ease(t);
          const arc = Math.sin(t * Math.PI) * Math.min(160, H * 0.18);
          const x = b.x0 + (b.x1 - b.x0) * e;
          const y = b.y0 + (b.y1 - b.y0) * e - arc;
          const s = 1 + (b.s1 - 1) * e;
          S.trail.push({ x, y, t: now });
          drawBall(x, y, s, t * 14);
          if (t >= 1) {
            if (b.hit) {
              sfx.hit();
              S.flash = 1;
              burst(x, y, 40, ["#fff", "#22d3ee", "#c4b5fd"], 9);
              S.ball = { k: "absorb", t0: now, x, y, s: b.s1, face: b.hit };
              navigator.vibrate?.(40);
            } else {
              sfx.miss();
              S.ball = { k: "fall", t0: now, x, y, vx: (b.x1 - b.x0) / 60, vy: -2, s: b.s1 };
              showToast("Missed! Swipe the ball toward a glowing face 🎯");
            }
          }
          break;
        }
        case "absorb": {
          const t = Math.min(1, (now - b.t0) / ABSORB);
          const open = t < 0.25 ? t / 0.25 : t > 0.75 ? (1 - t) / 0.25 : 1;
          // beam of light pulling the face into the ball
          const f = b.face;
          ctx.save();
          ctx.globalAlpha = Math.sin(t * Math.PI) * 0.9;
          const beam = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, f.width);
          beam.addColorStop(0, "rgba(255,255,255,1)");
          beam.addColorStop(0.5, "rgba(196,181,253,.6)");
          beam.addColorStop(1, "rgba(139,92,246,0)");
          ctx.fillStyle = beam;
          ctx.beginPath();
          ctx.arc(b.x, b.y, f.width * (1.2 - t * 0.9), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          drawBall(b.x, b.y - open * 10, b.s, 0, open);
          if (t >= 1) S.ball = { k: "drop", t0: now, x: b.x, y0: b.y, y1: b.y + f.height * 0.6, s: b.s };
          break;
        }
        case "drop": {
          const t = Math.min(1, (now - b.t0) / DROP);
          const bounce = t < 0.7 ? (t / 0.7) ** 2 : 1 - Math.sin(((t - 0.7) / 0.3) * Math.PI) * 0.12;
          drawBall(b.x, b.y0 + (b.y1 - b.y0) * bounce, b.s);
          if (t >= 1) S.ball = { k: "wobble", t0: now, x: b.x, y: b.y1, s: b.s, ticks: 0 };
          break;
        }
        case "wobble": {
          const el = now - b.t0;
          const n = Math.floor(el / WOBBLE);
          const ph = (el % WOBBLE) / WOBBLE;
          if (n >= b.ticks && n < MIN_WOBBLES + 3) {
            b.ticks = n + 1;
            sfx.wobble();
          }
          const rot = ph < 0.5 ? Math.sin(ph * 2 * Math.PI * 2) * 0.45 * (1 - ph) : 0;
          // ground shadow
          ctx.fillStyle = "rgba(0,0,0,.35)";
          ctx.beginPath();
          ctx.ellipse(b.x, b.y + R * b.s * 0.95, R * b.s * 0.9, R * b.s * 0.25, 0, 0, Math.PI * 2);
          ctx.fill();
          const blink = Math.sin(el / 120) > 0 ? 0.6 : 0;
          drawBall(b.x + rot * 8, b.y, b.s, rot, 0, blink);
          const res = S.result;
          if (n >= MIN_WOBBLES && ph > 0.55 && res) {
            if (res.result === "caught" || res.result === "already") {
              sfx.click();
              S.ball = { k: "click", t0: now, x: b.x, y: b.y, s: b.s };
            } else {
              sfx.fail();
              burst(b.x, b.y, 50, ["#fff", "#e9d5ff", "#a78bfa"], 7);
              S.ball = { k: "burst", t0: now, x: b.x, y: b.y, s: b.s };
            }
          }
          break;
        }
        case "click": {
          const t = Math.min(1, (now - b.t0) / 900);
          if (t > 0.15 && !(b as { burst?: boolean }).burst) {
            (b as { burst?: boolean }).burst = true;
            sfx.success();
            navigator.vibrate?.([30, 50, 30]);
            burst(b.x, b.y, 22, ["#fbbf24", "#fde68a", "#fff"], 5, true);
          }
          drawBall(b.x, b.y, b.s * (1 + Math.sin(Math.min(t * 4, 1) * Math.PI) * 0.15), 0, 0, 1 - t * 0.5);
          if (t >= 1) {
            const res = S.result!;
            S.ball = { k: "idle", t0: now };
            S.modalOpen = true;
            if (res.result === "caught") setCount((c) => c + 1);
            setModal({ user: res.user!, fresh: res.result === "caught" });
          }
          break;
        }
        case "burst": {
          const t = Math.min(1, (now - b.t0) / 700);
          ctx.globalAlpha = 1 - t;
          drawBall(b.x, b.y - t * 20, b.s, 0, Math.min(1, t * 3));
          ctx.globalAlpha = 1;
          if (t >= 1) {
            const res = S.result;
            showToast(MESSAGES[(res?.result as keyof typeof MESSAGES) ?? "error"] ?? MESSAGES.error);
            S.ball = { k: "idle", t0: now };
          }
          break;
        }
        case "fall": {
          b.vy += 0.9;
          b.x += b.vx;
          b.y += b.vy;
          drawBall(b.x, b.y, b.s, (now - b.t0) / 60);
          if (b.y > H + 80 || now - b.t0 > 2000) S.ball = { k: "idle", t0: now };
          break;
        }
      }

      // throw trail
      S.trail = S.trail.filter((p) => now - p.t < 220);
      S.trail.forEach((p) => {
        const a = 1 - (now - p.t) / 220;
        ctx.fillStyle = `rgba(196,181,253,${a * 0.35})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10 * a, 0, Math.PI * 2);
        ctx.fill();
      });

      // particles
      S.particles = S.particles.filter((p) => p.life < p.max);
      for (const p of S.particles) {
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.96;
        p.vy = p.vy * 0.96 + (p.star ? 0.12 : 0.05);
        ctx.globalAlpha = 1 - p.life / p.max;
        ctx.fillStyle = p.color;
        if (p.star) star(p.x, p.y, p.size, p.life / 8);
        else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // white flash on hit
      if (S.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${S.flash * 0.7})`;
        ctx.fillRect(0, 0, W, H);
        S.flash = Math.max(0, S.flash - 0.06);
      }
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, [resolveCatch, showToast]);

  function closeModal() {
    setModal(null);
    g.current.modalOpen = false;
  }

  const t = modal ? typeInfo(modal.user.type) : null;

  return (
    <main style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden", touchAction: "none" }}>
      <video
        ref={videoRef}
        playsInline
        muted
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: facing === "user" ? "scaleX(-1)" : undefined,
        }}
      />
      {/* vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(7,6,15,.65) 100%), linear-gradient(180deg, rgba(7,6,15,.6), transparent 18%, transparent 75%, rgba(7,6,15,.75))",
        }}
      />
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, touchAction: "none" }} />

      {/* top HUD */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: "calc(env(safe-area-inset-top) + 14px) 16px 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pointerEvents: "none",
        }}
      >
        <Link href="/dex" className="social" style={{ pointerEvents: "auto", background: "rgba(0,0,0,.5)", fontSize: 15 }}>
          ← 📇 <b className="mono">{count}</b>
        </Link>
        <div className="social mono" style={{ background: "rgba(0,0,0,.5)", fontSize: 13 }}>
          {status === "ready" ? (facesSeen ? `🎯 ${facesSeen} in sight` : "🔍 scanning…") : "…"}
        </div>
        <button
          className="social"
          style={{ pointerEvents: "auto", background: "rgba(0,0,0,.5)", fontSize: 18, cursor: "pointer" }}
          onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
          aria-label="Flip camera"
        >
          🔄
        </button>
      </div>

      {/* hints */}
      {status === "ready" && !hintGone && !toast && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 190, textAlign: "center", pointerEvents: "none" }}>
          <span className="social fade-up" style={{ background: "rgba(0,0,0,.6)", fontSize: 14 }}>
            {facesSeen ? "Swipe the DevBall up at a player ☝️" : "Point your camera at another player"}
          </span>
        </div>
      )}
      {toast && (
        <div style={{ position: "absolute", left: 16, right: 16, bottom: 190, textAlign: "center", pointerEvents: "none" }}>
          <span
            className="social fade-up"
            style={{ background: "rgba(17,14,36,.92)", fontSize: 15, padding: "12px 16px", lineHeight: 1.4, display: "inline-block" }}
          >
            {toast}
          </span>
        </div>
      )}

      {status === "loading" && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "var(--bg)" }}>
          <div className="center">
            <div className="float" style={{ fontSize: 56 }}>
              📷
            </div>
            <p className="subtitle">Warming up the DevBall…</p>
          </div>
        </div>
      )}
      {status === "error" && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "var(--bg)", padding: 16 }}>
          <div style={{ maxWidth: 420, width: "100%" }}>
            <div className="error">{error}</div>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Try again
            </button>
            <Link href="/dex" className="btn btn-ghost" style={{ marginTop: 10 }}>
              Back to my PokeDev
            </Link>
          </div>
        </div>
      )}

      {/* caught modal */}
      {modal && t && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(7,6,15,.82)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            overflowY: "auto",
            padding: "calc(env(safe-area-inset-top) + 24px) 16px 32px",
            zIndex: 10,
          }}
        >
          <div style={{ maxWidth: 440, margin: "0 auto" }}>
            <div className="center fade-up">
              <p className="mono small" style={{ color: "var(--gold)", letterSpacing: ".2em", margin: 0 }}>
                {modal.fresh ? "★ NEW ENTRY ★" : "ALREADY IN YOUR POKEDEV"}
              </p>
              <h1 className="title" style={{ fontSize: 40, margin: "6px 0 18px" }}>
                {modal.fresh ? (
                  <>
                    Gotcha! <span className="grad-text">{modal.user.displayName.split(" ")[0]}</span>
                  </>
                ) : (
                  <>Caught before!</>
                )}
              </h1>
            </div>
            <div className="fade-up" style={{ animationDelay: ".1s" }}>
              <PlayerCard user={modal.user} />
            </div>
            <div className="stack fade-up" style={{ marginTop: 18, animationDelay: ".2s" }}>
              <button className="btn btn-primary" onClick={closeModal}>
                Keep catching
              </button>
              <Link href={`/u/${modal.user.username}`} className="btn btn-ghost">
                Open card
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
