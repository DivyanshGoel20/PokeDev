"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { cameraErrorMessage, coverMap, describeFaces, detectBoxes, loadFace, startCamera, stopCamera, watchForBlink, type Box } from "@/lib/face";
import { addPending, type Pending } from "@/lib/pending";
import QrSheet from "./QrSheet";
import { postJSON } from "@/lib/client";
import { sfx } from "@/lib/sfx";
import { typeInfo, type DexEntry } from "@/lib/types";
import { Icon, Portrait, TypeBadge, dexNo } from "./ui";
import { DevBall } from "./DevBall";

type CatchResult = "caught" | "already" | "nomatch" | "hidden" | "self" | "unclear" | "nolive" | "error";
type ApiResult = { result?: CatchResult; username?: string; error?: string };

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; star?: boolean };

type BallState =
  | { k: "idle"; t0: number }
  | { k: "drag"; x: number; y: number }
  | { k: "fly"; t0: number; x0: number; y0: number; x1: number; y1: number; s1: number; hit: Box | null }
  | { k: "absorb"; t0: number; x: number; y: number; s: number; face: Box }
  | { k: "drop"; t0: number; x: number; y0: number; y1: number; s: number }
  | { k: "wobble"; t0: number; x: number; y: number; s: number; ticks: number }
  | { k: "click"; t0: number; x: number; y: number; s: number; burst?: boolean }
  | { k: "burst"; t0: number; x: number; y: number; s: number }
  | { k: "fall"; t0: number; x: number; y: number; vx: number; vy: number; s: number };

const R = 38; // ball radius (CSS px)
const FLIGHT = 560;
const ABSORB = 480;
const DROP = 340;
const WOBBLE = 640;
const MIN_WOBBLES = 3;

const MESSAGES: Record<Exclude<CatchResult, "caught" | "already">, string> = {
  nomatch: "Oh no! It broke free! This builder isn't a PokeDev player yet. Tell them to join!",
  hidden: "This builder is in hide mode right now. Try again later!",
  self: "That's you! You can't catch yourself.",
  unclear: "Couldn't get a clear look. Get a bit closer and try again!",
  nolive: "It broke free! The blink check failed. Real builders blink, photos don't. Try again and catch them mid-blink!",
  error: "Signal lost! Check your connection and try again.",
};

export default function CatchGame({
  caughtCount,
  inviter,
  onClose,
  onCaught,
  onOpenEntry,
}: {
  caughtCount: number;
  /** Your username, used in the invite QR code. */
  inviter: string;
  onClose: () => void;
  /** Refreshes app state and returns the caught player's entry. */
  onCaught: (username: string) => Promise<DexEntry | null>;
  onOpenEntry: (no: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<{ entry: DexEntry; fresh: boolean } | null>(null);
  const [pendingModal, setPendingModal] = useState<Pending | null>(null);
  const [qrFor, setQrFor] = useState<Pending | null>(null);
  const [blink, setBlink] = useState<"watching" | "ok" | null>(null);
  const [facesSeen, setFacesSeen] = useState(0);
  const [hintGone, setHintGone] = useState(false);

  const g = useRef({
    boxes: [] as Box[],
    ball: { k: "idle", t0: 0 } as BallState,
    particles: [] as Particle[],
    flash: 0,
    trail: [] as { x: number; y: number; t: number }[],
    result: null as (ApiResult & { entry?: DexEntry | null; pending?: Pending }) | null,
    tracking: true,
    mirrored: false,
    modalOpen: false,
  });

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? "" : t)), 3600);
  }, []);

  /* ---------------- camera + models ---------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        stopCamera(streamRef.current);
        const [stream] = await Promise.all([startCamera(videoRef.current!, facing), loadFace()]);
        if (cancelled) return stopCamera(stream);
        streamRef.current = stream;
        g.current.mirrored = facing === "user";
        g.current.boxes = [];
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
          const boxes = await detectBoxes(v).catch(() => [] as Box[]);
          if (!alive) break;
          // Hold the last seen faces briefly so the target doesn't flicker on a missed frame.
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
        await new Promise((r) => setTimeout(r, 60));
      }
    })();
    return () => {
      alive = false;
    };
  }, [status]);

  /* ---------------- catch: snapshot -> descriptor + photo -> server ---------------- */
  const resolveCatch = useCallback(
    async (target: Box) => {
      const v = videoRef.current!;
      const snap = document.createElement("canvas");
      snap.width = v.videoWidth;
      snap.height = v.videoHeight;
      snap.getContext("2d")!.drawImage(v, 0, 0);
      g.current.tracking = false;
      const tcx = target.x + target.width / 2;
      const tcy = target.y + target.height / 2;
      try {
        // 1) Liveness: the target has to blink while the ball is in the air / wobbling.
        setBlink("watching");
        const blinkP = watchForBlink(v, { x: tcx, y: tcy }, Math.max(target.width, target.height), 5500).then((ok) => {
          if (ok) setBlink("ok");
          return ok;
        });

        // 2) Face fingerprint of the person we aimed at, from the snapshot at the throw.
        const faces = await describeFaces(snap);
        let best: (typeof faces)[number] | null = null;
        let bestD = Infinity;
        for (const f of faces) {
          const d = Math.hypot(f.box.x + f.box.width / 2 - tcx, f.box.y + f.box.height / 2 - tcy);
          if (d < bestD) {
            bestD = d;
            best = f;
          }
        }
        if (!best || bestD > Math.max(target.width, 60)) {
          await blinkP;
          g.current.result = { result: "unclear" };
          return;
        }

        // Head-and-shoulders snapshot from the moment of the throw.
        const b = best.box;
        const side = Math.min(Math.max(b.width, b.height) * 2.1, snap.width, snap.height);
        const sx = Math.min(Math.max(b.x + b.width / 2 - side / 2, 0), snap.width - side);
        const sy = Math.min(Math.max(b.y + b.height * 0.55 - side / 2, 0), snap.height - side);
        const out = document.createElement("canvas");
        out.width = out.height = 360;
        const octx = out.getContext("2d")!;
        if (g.current.mirrored) {
          octx.translate(360, 0);
          octx.scale(-1, 1);
        }
        octx.drawImage(snap, sx, sy, side, side, 0, 0, 360, 360);
        const photo = out.toDataURL("image/jpeg", 0.82);

        if (!(await blinkP)) {
          g.current.result = { result: "nolive" };
          return;
        }

        // 3) Match. Only the 128 numbers are sent here; the photo is uploaded only after a match.
        const r = await postJSON<ApiResult>("/api/catch", { descriptor: best.descriptor });
        if (r.error) {
          g.current.result = { result: "error", error: r.error };
        } else if ((r.result === "caught" || r.result === "already") && r.username) {
          await postJSON("/api/catch/photo", { username: r.username, photo });
          const entry = await onCaught(r.username);
          g.current.result = { ...r, entry };
        } else if (r.result === "nomatch") {
          // Not a player yet: keep them as a pending entry on THIS phone only.
          g.current.result = { result: "nomatch", pending: addPending(best.descriptor, photo) };
        } else {
          g.current.result = r;
        }
      } catch {
        g.current.result = { result: "error" };
      } finally {
        g.current.tracking = true;
      }
    },
    [onCaught],
  );

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

    const rest = () => ({ x: W / 2, y: H - 140 });
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
          max: 36 + Math.random() * 26,
          color: colors[(Math.random() * colors.length) | 0],
          size: star ? 7 + Math.random() * 6 : 3 + Math.random() * 3,
          star,
        });
      }
    }

    /* ----- input ----- */
    let pts: { x: number; y: number; t: number }[] = [];
    function onDown(e: PointerEvent) {
      if (S.modalOpen || S.ball.k !== "idle") return;
      const r = rest();
      if (Math.hypot(e.clientX - r.x, e.clientY - r.y) > R * 2.2) return;
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
      // A slow but long upward drag also counts as a throw (helps on laggy phones).
      const start = rest();
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const len = Math.hypot(dx, dy);
      if (dy < -90) {
        throwBall(e.clientX, e.clientY, dx / len, dy / len, 1, now);
        return;
      }
      S.ball = { k: "idle", t0: now };
    }

    function throwBall(x: number, y: number, dx: number, dy: number, speed: number, now: number) {
      sfx.throw();
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
        const s1 = Math.min(1, Math.max(0.45, b.width / 250));
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

    /* ----- drawing ----- */
    const INK = "#1d1d22";
    function drawBall(x: number, y: number, s: number, rot = 0, open = 0, glow = 0) {
      const r = R * s;
      const lw = Math.max(2, 4 * s);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      // bottom (cream)
      ctx.fillStyle = "#fffdf8";
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#e7ddcb";
      ctx.lineWidth = r * 0.14;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.8, Math.PI * 0.18, Math.PI * 0.82);
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI);
      ctx.stroke();
      // inside glow when open
      if (open > 0) {
        ctx.fillStyle = `rgba(255,240,200,${open})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.95, r * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // top (red), hinged open at the back
      ctx.save();
      if (open > 0) {
        ctx.translate(-r, 0);
        ctx.rotate(-open * 1.1);
        ctx.translate(r, 0);
      }
      ctx.fillStyle = "#f2553a";
      ctx.beginPath();
      ctx.arc(0, 0, r, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      ctx.lineWidth = r * 0.13;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.74, Math.PI * 1.12, Math.PI * 1.42);
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(0, 0, r, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      // band + button
      if (open < 0.05) {
        ctx.fillStyle = INK;
        ctx.fillRect(-r, -r * 0.08, r * 2, r * 0.16);
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.33, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = glow > 0 ? `rgba(255,${200 - glow * 140},${200 - glow * 160},1)` : "#fffdf8";
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2f2c9e";
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.13);
        ctx.lineTo(r * 0.1, 0);
        ctx.lineTo(0, r * 0.13);
        ctx.lineTo(-r * 0.1, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    function drawReticle(b: Box, t: number, active: boolean) {
      const pad = b.width * 0.14;
      const x = b.x - pad;
      const y = b.y - pad;
      const w = b.width + pad * 2;
      const h = b.height + pad * 2;
      const L = Math.min(w, h) * 0.22;
      const pulse = Math.sin(t / 200) * 3;
      const corners: [number, number, number, number][] = [
        [x - pulse, y - pulse, 1, 1],
        [x + w + pulse, y - pulse, -1, 1],
        [x - pulse, y + h + pulse, 1, -1],
        [x + w + pulse, y + h + pulse, -1, -1],
      ];
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const [color, width] of [
        [INK, 9],
        [active ? "#ff5a4e" : "#ffffff", 4.5],
      ] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        for (const [cx, cy, sx, sy] of corners) {
          ctx.moveTo(cx, cy + sy * L);
          ctx.lineTo(cx, cy);
          ctx.lineTo(cx + sx * L, cy);
        }
        ctx.stroke();
      }
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
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const b = S.ball;
      if (b.k === "idle" || b.k === "drag" || b.k === "fly") {
        screenBoxes().forEach((bx) => drawReticle(bx, now, b.k === "fly" && !!b.hit));
      }

      const r0 = rest();
      if (b.k === "idle" || b.k === "drag") {
        ctx.fillStyle = "rgba(0,0,0,.28)";
        ctx.beginPath();
        ctx.ellipse(r0.x, r0.y + R + 10, R * 0.9, R * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      switch (b.k) {
        case "idle": {
          const pop = Math.min(1, (now - b.t0) / 300);
          const s = pop < 1 ? 0.6 + 0.4 * ease(pop) + Math.sin(pop * Math.PI) * 0.15 : 1;
          drawBall(r0.x, r0.y + Math.sin(now / 380) * 5, s, Math.sin(now / 650) * 0.12);
          break;
        }
        case "drag":
          drawBall(b.x, b.y, 1.06, (b.x - r0.x) / 200);
          break;
        case "fly": {
          const t = Math.min(1, (now - b.t0) / FLIGHT);
          const e = ease(t);
          const arc = Math.sin(t * Math.PI) * Math.min(150, H * 0.17);
          const x = b.x0 + (b.x1 - b.x0) * e;
          const y = b.y0 + (b.y1 - b.y0) * e - arc;
          const s = 1 + (b.s1 - 1) * e;
          S.trail.push({ x, y, t: now });
          drawBall(x, y, s, t * 14);
          if (t >= 1) {
            if (b.hit) {
              sfx.hit();
              S.flash = 1;
              burst(x, y, 34, ["#fff", "#ffe08a", "#ffffff"], 9);
              S.ball = { k: "absorb", t0: now, x, y, s: b.s1, face: b.hit };
              navigator.vibrate?.(40);
            } else {
              sfx.miss();
              S.ball = { k: "fall", t0: now, x, y, vx: (b.x1 - b.x0) / 60, vy: -2, s: b.s1 };
              showToast("Missed! Swipe the ball toward a face in a target box.");
            }
          }
          break;
        }
        case "absorb": {
          const t = Math.min(1, (now - b.t0) / ABSORB);
          const open = t < 0.25 ? t / 0.25 : t > 0.75 ? (1 - t) / 0.25 : 1;
          const f = b.face;
          ctx.save();
          ctx.globalAlpha = Math.sin(t * Math.PI) * 0.85;
          ctx.fillStyle = "#fff6d6";
          ctx.beginPath();
          ctx.arc(b.x, b.y, f.width * (1.15 - t * 0.95), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          drawBall(b.x, b.y - open * 8, b.s, 0, open);
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
          if (n >= b.ticks && n < MIN_WOBBLES + 4) {
            b.ticks = n + 1;
            sfx.wobble();
          }
          const rot = ph < 0.5 ? Math.sin(ph * 2 * Math.PI * 2) * 0.42 * (1 - ph) : 0;
          ctx.fillStyle = "rgba(0,0,0,.3)";
          ctx.beginPath();
          ctx.ellipse(b.x, b.y + R * b.s * 0.98, R * b.s * 0.85, R * b.s * 0.22, 0, 0, Math.PI * 2);
          ctx.fill();
          const blink = Math.sin(el / 110) > 0 ? 1 : 0;
          drawBall(b.x + rot * 8, b.y, b.s, rot, 0, blink);
          const res = S.result;
          if (n >= MIN_WOBBLES && ph > 0.55 && res) {
            if ((res.result === "caught" || res.result === "already") && res.entry) {
              sfx.click();
              S.ball = { k: "click", t0: now, x: b.x, y: b.y, s: b.s };
            } else {
              sfx.fail();
              burst(b.x, b.y, 44, ["#fff", "#ffd6d2", "#f2553a"], 7);
              S.ball = { k: "burst", t0: now, x: b.x, y: b.y, s: b.s };
            }
          }
          break;
        }
        case "click": {
          const t = Math.min(1, (now - b.t0) / 850);
          if (t > 0.15 && !b.burst) {
            b.burst = true;
            sfx.success();
            navigator.vibrate?.([30, 50, 30]);
            burst(b.x, b.y, 18, ["#ffcc33", "#ffe08a", "#fff"], 5, true);
          }
          drawBall(b.x, b.y, b.s * (1 + Math.sin(Math.min(t * 4, 1) * Math.PI) * 0.15));
          if (t >= 1) {
            const res = S.result!;
            S.ball = { k: "idle", t0: now };
            S.modalOpen = true;
            setBlink(null);
            setModal({ entry: res.entry!, fresh: res.result === "caught" });
          }
          break;
        }
        case "burst": {
          const t = Math.min(1, (now - b.t0) / 650);
          ctx.globalAlpha = 1 - t;
          drawBall(b.x, b.y - t * 20, b.s, 0, Math.min(1, t * 3));
          ctx.globalAlpha = 1;
          if (t >= 1) {
            const res = S.result;
            setBlink(null);
            if (res?.result === "nomatch" && res.pending) {
              S.modalOpen = true;
              setPendingModal(res.pending);
            } else {
              showToast(MESSAGES[(res?.result as keyof typeof MESSAGES) ?? "error"] ?? MESSAGES.error);
            }
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

      S.trail = S.trail.filter((p) => now - p.t < 200);
      for (const p of S.trail) {
        const a = 1 - (now - p.t) / 200;
        ctx.fillStyle = `rgba(255,255,255,${a * 0.4})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9 * a, 0, Math.PI * 2);
        ctx.fill();
      }

      S.particles = S.particles.filter((p) => p.life < p.max);
      for (const p of S.particles) {
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy = p.vy * 0.95 + (p.star ? 0.12 : 0.05);
        ctx.globalAlpha = 1 - p.life / p.max;
        ctx.fillStyle = p.color;
        if (p.star) star(p.x, p.y, p.size, p.life / 8);
        else {
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); // pixel-style sparks
        }
      }
      ctx.globalAlpha = 1;

      if (S.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${S.flash * 0.75})`;
        ctx.fillRect(0, 0, W, H);
        S.flash = Math.max(0, S.flash - 0.07);
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
    setPendingModal(null);
    g.current.modalOpen = false;
  }

  const roundBtn: React.CSSProperties = {
    width: 46,
    height: 46,
    borderRadius: 14,
    border: "2.5px solid #1d1d22",
    background: "#fffdf8",
    color: "#1d1d22",
    display: "grid",
    placeItems: "center",
    boxShadow: "0 3px 0 #1d1d22",
    pointerEvents: "auto",
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "#000", overflow: "hidden", touchAction: "none" }}>
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
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: "linear-gradient(180deg, rgba(0,0,0,.45), transparent 20%, transparent 70%, rgba(0,0,0,.55))",
        }}
      />
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, touchAction: "none" }} />

      {/* HUD */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: "calc(env(safe-area-inset-top) + 12px) 14px 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pointerEvents: "none",
        }}
      >
        <button style={roundBtn} onClick={onClose} aria-label="Close">
          <Icon.close />
        </button>
        <div
          className="px"
          style={{
            background: "#fffdf8",
            border: "2.5px solid #1d1d22",
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 10,
            boxShadow: "0 3px 0 #1d1d22",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <DevBall size={16} />
          {caughtCount}
          <span style={{ width: 2, height: 14, background: "#ddd5c5" }} />
          <span style={{ color: facesSeen ? "#2f2c9e" : "#847c6d" }}>{status === "ready" ? (facesSeen ? `${facesSeen} IN SIGHT` : "SEARCHING") : "..."}</span>
        </div>
        <button style={roundBtn} onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} aria-label="Flip camera">
          <Icon.flip />
        </button>
      </div>

      {/* hint / messages */}
      {status === "ready" && (toast || !hintGone || blink) && !modal && !pendingModal && (
        <div
          style={{
            position: "absolute",
            left: 14,
            right: 14,
            bottom: "calc(env(safe-area-inset-bottom) + 210px)",
            pointerEvents: "none",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div className="dialog pop" key={toast || blink || "hint"} style={{ maxWidth: 440, width: "100%", fontSize: 15 }}>
            {toast ||
              (blink === "watching"
                ? "Blink check! Keep the camera on them, they need to blink..."
                : blink === "ok"
                  ? "Blink detected! Reading their face fingerprint..."
                  : facesSeen
                    ? "A builder appeared! Swipe the DevBall up at them. They'll need to blink!"
                    : "Point your camera at another player...")}
          </div>
        </div>
      )}

      {status === "loading" && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#1d1d22" }}>
          <div className="center" style={{ color: "#fff" }}>
            <DevBall size={70} className="bob" />
            <p className="px" style={{ fontSize: 10, marginTop: 22, letterSpacing: ".1em" }}>
              BOOTING SCANNER...
            </p>
          </div>
        </div>
      )}
      {status === "error" && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "var(--paper)", padding: 16 }}>
          <div style={{ maxWidth: 420, width: "100%" }}>
            <div className="dialog" style={{ marginBottom: 18 }}>
              {error}
            </div>
            <div className="stack">
              <button className="btn btn-red" onClick={() => window.location.reload()}>
                Try again
              </button>
              <button className="btn" onClick={onClose}>
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingModal && (
        <PendingModal pending={pendingModal} onContinue={closeModal} onQr={() => setQrFor(pendingModal)} />
      )}
      {qrFor && <QrSheet inviter={inviter} photo={qrFor.photo} onClose={() => setQrFor(null)} />}

      {modal && (
        <CaughtModal
          entry={modal.entry}
          fresh={modal.fresh}
          onContinue={closeModal}
          onOpen={() => {
            onOpenEntry(modal.entry.no);
          }}
        />
      )}
    </div>
  );
}

function CaughtModal({ entry, fresh, onContinue, onOpen }: { entry: DexEntry; fresh: boolean; onContinue: () => void; onOpen: () => void }) {
  const name = entry.displayName ?? "???";
  const lines = fresh
    ? [`Gotcha! ${name} was caught!`, `${name}'s data was added to your PokeDev!`]
    : [`${name} is already in your PokeDev!`];
  const [line, setLine] = useState(0);
  const [typed, setTyped] = useState(0);
  const text = lines[line];

  useEffect(() => {
    if (typed >= text.length) return;
    const id = window.setTimeout(() => setTyped((n) => n + 1), 22);
    return () => window.clearTimeout(id);
  }, [typed, text]);

  function advance() {
    if (typed < text.length) return setTyped(text.length);
    if (line < lines.length - 1) {
      setLine(line + 1);
      setTyped(0);
    }
  }
  const done = line === lines.length - 1 && typed >= text.length;
  const t = typeInfo(entry.type);

  return (
    <div
      onClick={advance}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 5,
        background: "rgba(20,20,24,.72)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: "calc(env(safe-area-inset-top) + 16px) 14px calc(env(safe-area-inset-bottom) + 16px)",
      }}
    >
      <div style={{ maxWidth: 460, width: "100%", margin: "0 auto" }}>
        <div className="bezel pop" style={{ marginBottom: 14 }}>
          <div className="lcd" style={{ padding: 10 }}>
            <div className="row spread px" style={{ fontSize: 10, marginBottom: 10 }}>
              <span>{dexNo(entry.no)}</span>
              {fresh && <span style={{ color: "#2f2c9e" }}>NEW!</span>}
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Portrait
                size={210}
                radius={10}
                username={entry.username}
                displayName={entry.displayName}
                type={entry.type}
                caught
                hasPhoto={entry.hasPhoto}
                caughtAt={entry.caughtAt}
              />
            </div>
            <div className="row spread" style={{ marginTop: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 20, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
                <div className="small" style={{ opacity: 0.75 }}>
                  The {t.name} Builder
                </div>
              </div>
              <TypeBadge type={entry.type} />
            </div>
          </div>
        </div>

        <div className="dialog" style={{ minHeight: 84 }}>
          {text.slice(0, typed)}
          {!done && typed >= text.length && <span className="caret">▼</span>}
        </div>

        <div
          className="row"
          style={{ marginTop: 14, opacity: done ? 1 : 0, transition: "opacity .2s", pointerEvents: done ? "auto" : "none" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="btn" onClick={onOpen}>
            View entry
          </button>
          <button className="btn btn-red" onClick={onContinue}>
            Keep catching
          </button>
        </div>
      </div>
    </div>
  );
}

function PendingModal({ pending, onContinue, onQr }: { pending: Pending; onContinue: () => void; onQr: () => void }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 5,
        background: "rgba(20,20,24,.72)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: "calc(env(safe-area-inset-top) + 16px) 14px calc(env(safe-area-inset-bottom) + 16px)",
      }}
    >
      <div style={{ maxWidth: 460, width: "100%", margin: "0 auto" }}>
        <div className="bezel pop" style={{ marginBottom: 14 }}>
          <div className="lcd" style={{ padding: 10 }}>
            <div className="row spread px" style={{ fontSize: 10, marginBottom: 10 }}>
              <span>No.???</span>
              <span style={{ color: "#2f2c9e" }}>PENDING</span>
            </div>
            <div style={{ display: "flex", justifyContent: "center", position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pending.photo} alt="" style={{ width: 190, height: 190, borderRadius: 10, objectFit: "cover", filter: "saturate(.6)" }} />
              <span
                className="px"
                style={{
                  position: "absolute",
                  bottom: -10,
                  background: "var(--ink)",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontSize: 14,
                }}
              >
                ?
              </span>
            </div>
            <div className="center" style={{ fontWeight: 700, fontSize: 19, marginTop: 18 }}>
              Unknown builder
            </div>
            <div className="center small" style={{ opacity: 0.75 }}>
              Saved on this phone only
            </div>
          </div>
        </div>

        <div className="dialog">
          Oh no, they got away! This builder isn&apos;t on PokeDev yet. We saved them as a pending entry, and the moment they join
          they&apos;ll land in your PokeDev automatically.
        </div>

        <button
          onClick={onQr}
          className="btn btn-yellow"
          style={{ marginTop: 14, justifyContent: "space-between" }}
        >
          <span>Show them your QR code to join</span>
          <span>→</span>
        </button>
        <button className="btn" style={{ marginTop: 10 }} onClick={onContinue}>
          Keep catching
        </button>
      </div>
    </div>
  );
}
