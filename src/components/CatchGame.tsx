"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { cameraErrorMessage, coverMap, describeFace, detectBoxes, distance, meanDescriptor, startScanner, stopCamera, type Box, type TrackedFace } from "@/lib/face";
import QRCode from "qrcode";
import { ScannerProgressText } from "./PreloadScanner";
import { postJSON } from "@/lib/client";
import { sfx } from "@/lib/sfx";
import { FRONTAL_MIN, SAME_FACE_FRAMES, builderTitle, type DexEntry } from "@/lib/types";
import { Icon, Portrait, TypeBadge, dexNo } from "./ui";
import { DevBall } from "./DevBall";

type Track = TrackedFace & { id: number; seen: number };

/**
 * Follow faces between frames: match each detection to the nearest previous track, smooth its
 * box (so targets glide instead of jumping), and keep a lost face for a moment so it doesn't flicker.
 */
let nextTrackId = 1;
function updateTracks(prev: Track[], dets: TrackedFace[], now: number): Track[] {
  const used = new Set<number>();
  const out: Track[] = [];
  for (const d of dets) {
    let best: Track | null = null;
    let bestD = Infinity;
    for (const p of prev) {
      if (used.has(p.id)) continue;
      const dd = Math.hypot(p.x + p.width / 2 - (d.x + d.width / 2), p.y + p.height / 2 - (d.y + d.height / 2));
      if (dd < Math.max(p.width, d.width) * 0.9 && dd < bestD) {
        bestD = dd;
        best = p;
      }
    }
    if (best) {
      used.add(best.id);
      const a = 0.55;
      out.push({
        id: best.id,
        x: best.x + (d.x - best.x) * a,
        y: best.y + (d.y - best.y) * a,
        width: best.width + (d.width - best.width) * a,
        height: best.height + (d.height - best.height) * a,
        frontal: d.frontal,
        seen: now,
      });
    } else {
      out.push({ ...d, id: nextTrackId++, seen: now });
    }
  }
  for (const p of prev) if (!used.has(p.id) && now - p.seen < 500) out.push(p);
  return out;
}

type CatchResult = "caught" | "already" | "nomatch" | "unknown" | "hidden" | "self" | "unclear" | "side" | "far" | "error";
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

const MESSAGES: Record<Exclude<CatchResult, "caught" | "already" | "nomatch" | "unknown">, string> = {
  hidden: "This builder is in hide mode right now. Try again later!",
  self: "That's you! You can't catch yourself.",
  unclear: "Almost! Couldn't get a clear enough look. Get closer, face to face, in good light, and throw again.",
  side: "It broke free! They were facing sideways. Builders can only be caught face to face!",
  far: "Too far away! Get a little closer so the DevBall can read their face.",
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
  const [notLive, setNotLive] = useState<{ token: string | null; unsure: boolean } | null>(null);
  const [locked, setLocked] = useState(false); // a target is locked on
  const [focusFacing, setFocusFacing] = useState(true); // ...and it's face-on
  const [lonely, setLonely] = useState(false); // no face found for a while
  const [retry, setRetry] = useState(0); // "Try again" restarts camera + scanner without reloading

  const [hintGone, setHintGone] = useState(false);

  const g = useRef({
    boxes: [] as Track[],
    focus: 0 as number, // id of the locked target
    ball: { k: "idle", t0: 0 } as BallState,
    particles: [] as Particle[],
    flash: 0,
    trail: [] as { x: number; y: number; t: number }[],
    result: null as (ApiResult & { entry?: DexEntry | null; invite?: string | null }) | null,
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
        const stream = await startScanner(videoRef.current!, facing);
        if (cancelled) return stopCamera(stream);
        streamRef.current = stream;
        g.current.mirrored = facing === "user";
        g.current.boxes = [];
        g.current.focus = 0;
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
  }, [facing, retry]);

  useEffect(() => () => stopCamera(streamRef.current), []);

  /* ---------------- live face tracking ---------------- */
  useEffect(() => {
    if (status !== "ready") return;
    let alive = true;
    let lastSeen = performance.now();
    let failures = 0;
    (async () => {
      while (alive) {
        const v = videoRef.current;
        if (g.current.tracking && v && v.readyState >= 2) {
          let boxes: TrackedFace[] = [];
          try {
            boxes = await detectBoxes(v);
            failures = 0;
          } catch (err) {
            // Never fail silently: if the scanner keeps erroring, say so instead of "searching" forever.
            console.warn("face tracking failed", err);
            if (++failures >= 12) {
              setError("The face scanner stopped working on this phone. Reload the app and try again.");
              setStatus("error");
              break;
            }
          }
          if (!alive) break;
          const now = performance.now();
          const S0 = g.current;
          const tracks = updateTracks(S0.boxes, boxes, now);
          // Target lock: keep the current target while it's in view; otherwise lock the biggest,
          // most central face. Tapping a face also locks it.
          if (!tracks.some((x) => x.id === S0.focus)) {
            const vw = v.videoWidth;
            const vh = v.videoHeight;
            const rank = (x: Track) =>
              x.width * (1 - Math.min(0.6, Math.hypot((x.x + x.width / 2 - vw / 2) / vw, (x.y + x.height / 2 - vh / 2) / vh)));
            S0.focus = tracks.length ? tracks.reduce((a, z) => (rank(z) > rank(a) ? z : a)).id : 0;
          }
          tracks.sort((a, z) => (a.id === S0.focus ? -1 : z.id === S0.focus ? 1 : 0));
          S0.boxes = tracks;
          const focus = tracks[0];
          setLocked(!!focus);
          setFocusFacing(!focus || focus.frontal >= FRONTAL_MIN);
          if (tracks.length) lastSeen = now;
          setLonely(now - lastSeen > 7000);
          const c = canvasRef.current;
          if (c && v.videoWidth) {
            // expose on-screen face centers, locked target first (used by automated tests)
            const m = coverMap(v.videoWidth, v.videoHeight, window.innerWidth, window.innerHeight, g.current.mirrored);
            c.dataset.faces = JSON.stringify(
              tracks.map(m.toScreen).map((b) => [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)]),
            );
          }
        }
        await new Promise((r) => setTimeout(r, 60));
      }
    })();
    return () => {
      alive = false;
    };
  }, [status]);

  /* ---------------- catch: video frame -> face fingerprint -> server ---------------- */
  // The video frame is only analysed in memory on this phone; no photo is kept or uploaded.
  const resolveCatch = useCallback(
    async (target: Box) => {
      const v = videoRef.current!;
      g.current.tracking = false;
      try {
        // Read the target's face over several frames while the ball flies and wobbles, and
        // average them: one frame is noisy, a few averaged frames match far more reliably.
        // Read the locked face directly (zoomed crop around it), following it if it moves.
        let box: Box = { ...target };
        const samples: number[][] = [];
        let sawFace = false;
        let sawFrontal = false;
        let tooSmall = false;
        const deadline = performance.now() + 2200;
        while (samples.length < 4 && performance.now() < deadline) {
          const f = await describeFace(v, box).catch(() => null);
          if (!f) continue;
          // Must still be the same person we aimed at (not someone walking past).
          const moved = Math.hypot(f.box.x + f.box.width / 2 - (box.x + box.width / 2), f.box.y + f.box.height / 2 - (box.y + box.height / 2));
          if (moved > Math.max(box.width, 60) * 1.2) continue;
          sawFace = true;
          box = f.box;
          if (f.frontal < FRONTAL_MIN) continue; // side-on frames give unreliable fingerprints
          sawFrontal = true;
          if (f.box.width < 60) {
            tooSmall = true;
            continue;
          }
          samples.push(f.descriptor);
        }
        if (!samples.length) {
          g.current.result = { result: !sawFace ? "unclear" : !sawFrontal ? "side" : tooSmall ? "far" : "unclear" };
          return;
        }
        // Average the frames, dropping an outlier (mid-blink, motion blur) first.
        const blend = (list: number[][]) => {
          let use = list;
          if (list.length >= 3) {
            const m = meanDescriptor(list);
            const worst = list.reduce((a, b) => (distance(a, m) > distance(b, m) ? a : b));
            if (distance(worst, m) > SAME_FACE_FRAMES * 0.6) use = list.filter((s) => s !== worst);
          }
          return meanDescriptor(use);
        };
        const ask = () =>
          postJSON<ApiResult>("/api/catch", { descriptor: blend(samples), facing: g.current.mirrored ? "user" : "environment" });

        let r = await ask();
        if (r.result === "unclear" || r.result === "unknown") {
          // Borderline: take a second look (a few more frames, averaged with the first ones)
          // while the ball is still wobbling, before bothering the player with a message.
          const more = performance.now() + 1800;
          let added = 0;
          while (added < 4 && performance.now() < more) {
            const f = await describeFace(v, box).catch(() => null);
            if (!f || f.frontal < FRONTAL_MIN || f.box.width < 60) continue;
            box = f.box;
            samples.push(f.descriptor);
            added++;
          }
          if (added) r = await ask();
        }
        if (r.error) {
          g.current.result = { result: "error", error: r.error };
        } else if ((r.result === "caught" || r.result === "already") && r.username) {
          const entry = await onCaught(r.username);
          g.current.result = { ...r, entry };
        } else if (r.result === "nomatch" || r.result === "unknown") {
          // Clearly not a player: nothing about them is kept. Create a one-time invite so that if
          // they join right now from your QR code, the catch is yours.
          const inv = await postJSON<{ token?: string }>("/api/invite", {});
          g.current.result = { result: r.result, invite: inv.token ?? null };
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
      if (Math.hypot(e.clientX - r.x, e.clientY - r.y) > R * 2.2) {
        // Tapped a face? Throw straight at it.
        const sb = screenBoxes();
        const hitIdx = sb.findIndex(
          (b) =>
            e.clientX > b.x - b.width * 0.25 &&
            e.clientX < b.x + b.width * 1.25 &&
            e.clientY > b.y - b.height * 0.25 &&
            e.clientY < b.y + b.height * 1.25,
        );
        const hit = sb[hitIdx];
        if (hit) {
          S.focus = S.boxes[hitIdx]?.id ?? S.focus; // tapping a face locks it
          sfx.unlock();
          setHintGone(true);
          const dx = hit.x + hit.width / 2 - r.x;
          const dy = hit.y + hit.height / 2 - r.y;
          const len = Math.hypot(dx, dy) || 1;
          throwBall(r.x, r.y, dx / len, dy / len, 1.2, performance.now());
        }
        return;
      }
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
        const facing = S.boxes[i]?.frontal >= FRONTAL_MIN;
        const isFocus = S.boxes[i]?.id === S.focus;
        const cost = perp + (isFocus ? 0 : 90) + (facing ? 0 : 120); // prefer the locked, face-on target
        if (along > 0 && perp < tol && cost < bestPerp) {
          bestPerp = cost;
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
    // The PokeDev ball artwork (the only ball design used anywhere in the app).
    const ballImg = new Image();
    ballImg.src = "/brand/ball.png";

    function drawBall(x: number, y: number, s: number, rot = 0, open = 0, glow = 0) {
      if (!ballImg.complete || !ballImg.naturalWidth) return; // artwork still loading (a few ms)
      const r = R * s;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      if (open <= 0.01) {
        ctx.drawImage(ballImg, -r, -r, r * 2, r * 2);
      } else {
        // bottom half
        ctx.save();
        ctx.beginPath();
        ctx.rect(-r - 2, 0, r * 2 + 4, r + 2);
        ctx.clip();
        ctx.drawImage(ballImg, -r, -r, r * 2, r * 2);
        ctx.restore();
        // light spilling out
        ctx.fillStyle = `rgba(255,240,200,${open})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.95, r * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        // top half, hinged open at the back
        ctx.save();
        ctx.translate(-r, 0);
        ctx.rotate(-open * 1.1);
        ctx.translate(r, 0);
        ctx.beginPath();
        ctx.rect(-r - 2, -r - 2, r * 2 + 4, r + 2);
        ctx.clip();
        ctx.drawImage(ballImg, -r, -r, r * 2, r * 2);
        ctx.restore();
      }
      if (glow > 0 && open <= 0.01) {
        // the center button lights up while the ball wobbles
        ctx.fillStyle = `rgba(255,214,90,${0.65 * glow})`;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.17, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawReticle(b: Box, t: number, active: boolean, facing: boolean, isFocus = true) {
      if (!isFocus && !active) {
        // other faces in view: faint, small corner marks so the screen stays calm
        const L2 = Math.min(b.width, b.height) * 0.16;
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        for (const [cx, cy, sx, sy] of [
          [b.x, b.y, 1, 1],
          [b.x + b.width, b.y, -1, 1],
          [b.x, b.y + b.height, 1, -1],
          [b.x + b.width, b.y + b.height, -1, -1],
        ] as [number, number, number, number][]) {
          ctx.moveTo(cx, cy + sy * L2);
          ctx.lineTo(cx, cy);
          ctx.lineTo(cx + sx * L2, cy);
        }
        ctx.stroke();
        ctx.restore();
        return;
      }
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
        [active ? "#f2553a" : facing ? "#ffffff" : "#f6a54c", 4.5],
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
      if (!facing && !active) {
        // "turn to face me" tag above side-on faces
        const label = "FACE ME";
        ctx.font = "10px 'Press Start 2P', monospace";
        const tw = ctx.measureText(label).width + 14;
        const lx = x + w / 2 - tw / 2;
        const ly = y - 30;
        ctx.fillStyle = "#f6a54c";
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(lx, ly, tw, 22, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = INK;
        ctx.fillText(label, lx + 7, ly + 16);
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
        const sb = screenBoxes();
        const hitBox = b.k === "fly" ? b.hit : null;
        sb.forEach((bx, i) => {
          const isFocus = S.boxes[i]?.id === S.focus;
          if (hitBox && !isFocus) return; // while the ball flies, only the target matters
          drawReticle(bx, now, !!hitBox && isFocus, (S.boxes[i]?.frontal ?? 1) >= FRONTAL_MIN, isFocus);
        });
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
              showToast("Missed! Swipe the DevBall toward a face in a target box, or just tap the face.");
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
          const glow = Math.sin(el / 110) > 0 ? 1 : 0;
          drawBall(b.x + rot * 8, b.y, b.s, rot, 0, glow);
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
            if (res?.result === "nomatch" || res?.result === "unknown") {
              S.modalOpen = true;
              setNotLive({ token: res.invite ?? null, unsure: res.result === "unknown" });
            } else {
              if (res?.result === "error" && res.error === "Not signed in") {
                window.location.replace("/login"); // session ended: log in again instead of a confusing message
              } else if (res?.result === "error" && res.error && !/Network error/i.test(res.error)) {
                showToast(res.error); // e.g. "Too many tries. Wait a minute and try again."
              } else {
                showToast(MESSAGES[(res?.result as keyof typeof MESSAGES) ?? "error"] ?? MESSAGES.error);
              }
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
    setNotLive(null);
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
          <span style={{ color: locked ? "#2f2c9e" : "#847c6d" }}>{status === "ready" ? (locked ? "TARGET LOCKED" : "SEARCHING") : "..."}</span>
        </div>
        <button style={roundBtn} onClick={() => {
            if (g.current.ball.k !== "idle" || g.current.modalOpen) return;
            setFacing((f) => (f === "user" ? "environment" : "user"));
          }} aria-label="Flip camera">
          <Icon.flip />
        </button>
      </div>

      {/* hint / messages */}
      {status === "ready" && (toast || !hintGone || lonely || (locked && !focusFacing)) && !modal && !notLive && (
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
          <div className="dialog pop" key={toast || (focusFacing ? "hint" : "side")} style={{ maxWidth: 440, width: "100%", fontSize: 15 }}>
            {toast ||
              (locked && !focusFacing
                ? "They're side-on! Builders can only be caught face to face. Get them to look at you."
                : locked
                  ? "Target locked! Swipe the DevBall at them, or tap any face to switch."
                  : lonely
                    ? "Can't find a face. Point the camera at someone 1-2 m away, in good light, with their whole face in view."
                    : "Point your camera at another player...")}
          </div>
        </div>
      )}

      {status === "loading" && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#1d1d22" }}>
          <div className="center" style={{ color: "#fff" }}>
            <DevBall size={70} className="bob" />
            <p className="px" style={{ fontSize: 10, marginTop: 22, letterSpacing: ".1em" }}>
              <ScannerProgressText fallback="STARTING CAMERA..." />
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
              <button className="btn btn-red" onClick={() => {
                setError("");
                setStatus("loading");
                setRetry((n) => n + 1);
              }}>
                Try again
              </button>
              <button className="btn" onClick={onClose}>
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {notLive && <NotLiveModal token={notLive.token} unsure={notLive.unsure} inviter={inviter} onContinue={closeModal} />}

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
    if (typed >= text.length) {
      // Auto-advance to the next line after a short pause (tapping skips ahead).
      if (line < lines.length - 1) {
        const id = window.setTimeout(() => {
          setLine((l) => l + 1);
          setTyped(0);
        }, 900);
        return () => window.clearTimeout(id);
      }
      return;
    }
    const id = window.setTimeout(() => setTyped((n) => n + 1), 22);
    return () => window.clearTimeout(id);
  }, [typed, text, line, lines.length]);

  function advance() {
    if (typed < text.length) return setTyped(text.length);
    if (line < lines.length - 1) {
      setLine(line + 1);
      setTyped(0);
    }
  }
  const done = line === lines.length - 1 && typed >= text.length;

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
                avatar={entry.avatar}
              />
            </div>
            <div className="row spread" style={{ marginTop: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 20, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
                <div className="small" style={{ opacity: 0.75 }}>
                  {builderTitle(entry.type, entry.type2)}
                </div>
              </div>
              <TypeBadge type={entry.type} type2={entry.type2} />
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

const INVITE_MS = 30 * 60 * 1000;

function NotLiveModal({
  token,
  unsure,
  inviter,
  onContinue,
}: {
  token: string | null;
  /** couldn't tell a non-player from a poor reading: offer both options, claim neither */
  unsure: boolean;
  inviter: string;
  onContinue: () => void;
}) {
  const [svg, setSvg] = useState("");
  const [expires] = useState(() => Date.now() + INVITE_MS);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const left = Math.max(0, expires - now);
  const mmss = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`;
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/join?${token ? `invite=${token}` : `ref=${inviter}`}`;
  useEffect(() => {
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1d1d22", light: "#ffffff" } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [url]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 5,
        background: "rgba(20,20,24,.78)",
        overflowY: "auto",
        padding: "calc(env(safe-area-inset-top) + 16px) 14px calc(env(safe-area-inset-bottom) + 16px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div style={{ maxWidth: 420, width: "100%", margin: "0 auto" }}>
        <div className="dialog pop">
          <div className="px" style={{ fontSize: 10, color: "var(--red)", marginBottom: 8 }}>
            {unsure ? "WHO'S THIS?" : "NOT LIVE YET"}
          </div>
          {unsure ? (
            <>
              Couldn&apos;t recognise this builder. Not on PokeDev yet? Let them scan this
              {token ? ", and they're yours the moment they finish signing up." : "."}
              <span style={{ display: "block", marginTop: 8 }}>Already playing? Get closer, face to face, and throw again.</span>
            </>
          ) : (
            <>
              This builder isn&apos;t on PokeDev. Onboard them now or they&apos;ll be lost! Let them scan this
              {token ? ", and they're yours the moment they finish signing up." : "."}
            </>
          )}

        </div>
        <div
          className="pop"
          style={{
            marginTop: 14,
            background: "#fff",
            border: "3px solid var(--ink)",
            borderRadius: 20,
            padding: 14,
            boxShadow: "0 5px 0 var(--ink)",
            animationDelay: ".08s",
          }}
        >
          <div className="qr" style={{ width: "100%", aspectRatio: "1 / 1" }} dangerouslySetInnerHTML={{ __html: svg }} />
          {token ? (
            <div
              className="row px"
              style={{
                justifyContent: "center",
                gap: 8,
                marginTop: 12,
                fontSize: 9,
                lineHeight: 1.6,
                color: left ? "var(--ink)" : "var(--danger)",
              }}
            >
              <span>{left ? "EXPIRES IN" : "EXPIRED"}</span>
              {left > 0 && (
                <span
                  style={{
                    background: left < 5 * 60 * 1000 ? "var(--danger)" : "var(--red)",
                    color: "#fff",
                    borderRadius: 6,
                    padding: "4px 7px",
                    fontSize: 11,
                  }}
                >
                  {mmss}
                </span>
              )}
            </div>
          ) : (
            <div className="px center muted" style={{ fontSize: 8, marginTop: 10, lineHeight: 1.6 }}>
              INVITE LINK
            </div>
          )}
        </div>
        <button className="btn btn-red" style={{ marginTop: 16 }} onClick={onContinue}>
          Done, keep catching
        </button>
      </div>
    </div>
  );
}
