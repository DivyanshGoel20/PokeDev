"use client";
import type * as FaceApiNS from "@vladmandic/face-api";

type FaceApi = typeof FaceApiNS;
let loading: Promise<FaceApi> | null = null;

function withTimeout<T>(ms: number, message: string, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(message)), ms);
    fn().then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

/** Lazily load face-api + model weights (only once per page load). */
export function loadFace(): Promise<FaceApi> {
  if (!loading) {
    loading = withTimeout(60_000, "The face scanner took too long to load. Check your connection and try again.", async () => {
      const faceapi = (await import("@vladmandic/face-api")) as FaceApi;
      // The bundled tfjs is typed loosely; setBackend/ready exist at runtime.
      const tf = faceapi.tf as unknown as { setBackend(b: string): Promise<boolean>; ready(): Promise<void> };
      // WebGL on every modern phone; plain CPU otherwise (we don't ship the wasm backend).
      const okGl = await tf.setBackend("webgl").catch(() => false);
      if (!okGl) await tf.setBackend("cpu");
      await tf.ready();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
        faceapi.nets.ssdMobilenetv1.loadFromUri("/models"),
        faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
        faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
      ]);
      // Warm-up: the first run of each network compiles GPU shaders (can take seconds on phones).
      // Doing it now, on a blank canvas, means the first real catch is instant.
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 160;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#888";
        ctx.fillRect(0, 0, 160, 160);
        await faceapi.detectAllFaces(c, new faceapi.TinyFaceDetectorOptions({ inputSize: 416 }));
        await faceapi.detectAllFaces(c, new faceapi.SsdMobilenetv1Options());
        await faceapi.detectFaceLandmarks(c);
        await faceapi.computeFaceDescriptor(c);
      } catch {
        /* warm-up is best effort */
      }
      return faceapi;
    }).catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

export type Box = { x: number; y: number; width: number; height: number };

type Pt = { x: number; y: number };
const mean = (pts: Pt[]) => ({ x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length });

/**
 * How directly a face looks at the camera, from its 68 landmarks: 1 = straight on, 0 = side profile.
 * Projects the nose tip onto the line between the eyes; turning the head pushes it towards one eye.
 * Measuring along the eye line makes it ignore head tilt.
 */
export function frontalScore(positions: Pt[]): number {
  const nose = positions[30];
  const le = mean(positions.slice(36, 42));
  const re = mean(positions.slice(42, 48));
  const ex = re.x - le.x;
  const ey = re.y - le.y;
  const len2 = ex * ex + ey * ey;
  if (len2 < 1) return 0;
  const t = ((nose.x - le.x) * ex + (nose.y - le.y) * ey) / len2; // 0 = at left eye, 1 = at right eye
  if (t <= 0 || t >= 1) return 0;
  return Math.min(t, 1 - t) / Math.max(t, 1 - t);
}

export type TrackedFace = Box & { frontal: number };

/**
 * Copy the current video frame into a reusable canvas, scaled so its long side is at most `maxSide`.
 * Running the models on a canvas instead of the <video> element is far more reliable on phones
 * (some mobile browsers hand WebGL blank or stale video frames), and smaller frames are faster.
 * Returns the canvas and the factor to scale results back to video pixels.
 */
const frameCanvases = new Map<number, HTMLCanvasElement>();
function grabFrame(input: HTMLVideoElement | HTMLCanvasElement, maxSide: number) {
  if (!(input instanceof HTMLVideoElement)) return { canvas: input, back: 1 };
  const vw = input.videoWidth;
  const vh = input.videoHeight;
  if (!vw || !vh) throw new Error("Camera not ready");
  const s = Math.min(1, maxSide / Math.max(vw, vh));
  const w = Math.round(vw * s);
  const h = Math.round(vh * s);
  let c = frameCanvases.get(maxSide);
  if (!c) {
    c = document.createElement("canvas");
    frameCanvases.set(maxSide, c);
  }
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  c.getContext("2d")!.drawImage(input, 0, 0, w, h);
  return { canvas: c, back: 1 / s };
}

const scaleBox = (b: Box, k: number): Box => ({ x: b.x * k, y: b.y * k, width: b.width * k, height: b.height * k });

/** At most this many faces are tracked at once (the closest / most central ones). */
export const MAX_TRACKED = 3;
const cropCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;

/**
 * Live tracking for the catch screen, built for crowded halls:
 *  - confident detections only, and faces too small (far away) to catch are ignored;
 *  - only the MAX_TRACKED biggest, most central faces are kept;
 *  - the face-direction check (landmarks) runs only on those few, so a crowd doesn't slow it down.
 * Boxes are in video pixels.
 */
export async function detectBoxes(input: HTMLVideoElement | HTMLCanvasElement): Promise<TrackedFace[]> {
  const faceapi = await loadFace();
  const { canvas, back } = grabFrame(input, 640);
  let dets = await faceapi.detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }));
  if (dets.length === 0) {
    dets = await faceapi.detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }));
  }
  const W = canvas.width;
  const H = canvas.height;
  const minW = Math.min(W, H) * 0.07; // smaller than this is too far away to catch reliably
  const ranked = dets
    .map((d) => d.box)
    .filter((b) => b.width >= minW)
    .map((b) => {
      const dx = (b.x + b.width / 2 - W / 2) / W;
      const dy = (b.y + b.height / 2 - H / 2) / H;
      return { b, score: b.width * (1 - Math.min(0.6, Math.hypot(dx, dy))) }; // big and central first
    })
    .sort((a, z) => z.score - a.score)
    .slice(0, MAX_TRACKED);

  const out: TrackedFace[] = [];
  for (const { b } of ranked) {
    let frontal = 0;
    if (cropCanvas) {
      // Landmarks on a crop of just this face (cheap, and unaffected by everyone else in frame).
      // The landmark model expects the crop to be exactly the detection box (no extra margin).
      const sx = Math.max(0, b.x);
      const sy = Math.max(0, b.y);
      const sw = Math.min(W - sx, b.width);
      const sh = Math.min(H - sy, b.height);
      cropCanvas.width = 150;
      cropCanvas.height = Math.max(1, Math.round((150 * sh) / sw));
      cropCanvas.getContext("2d")!.drawImage(canvas, sx, sy, sw, sh, 0, 0, cropCanvas.width, cropCanvas.height);
      try {
        const lm = (await faceapi.detectFaceLandmarks(cropCanvas)) as FaceApiNS.FaceLandmarks68;
        frontal = frontalScore(lm.positions);
      } catch {
        /* treat as not face-on */
      }
    }
    out.push({ ...scaleBox({ x: b.x, y: b.y, width: b.width, height: b.height }, back), frontal });
  }
  return out;
}

/** Accurate detection + 128-number face descriptors, with how face-on each face is. Boxes in video pixels. */
export async function describeFaces(input: HTMLVideoElement | HTMLCanvasElement) {
  const faceapi = await loadFace();
  const { canvas, back } = grabFrame(input, 1280);
  const res = await faceapi
    .detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  return res.map((r) => ({
    box: scaleBox({ x: r.detection.box.x, y: r.detection.box.y, width: r.detection.box.width, height: r.detection.box.height }, back),
    score: r.detection.score,
    frontal: frontalScore(r.landmarks.positions),
    descriptor: Array.from(r.descriptor),
  }));
}

export function distance(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

export function meanDescriptor(list: number[][]) {
  const out = new Array(128).fill(0);
  for (const d of list) for (let i = 0; i < 128; i++) out[i] += d[i] / list.length;
  return out;
}

/* ---------------- camera ---------------- */

export async function startCamera(video: HTMLVideoElement, facing: "user" | "environment") {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera not available. Open this site over HTTPS in Safari or Chrome.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    // 720p: plenty for face fingerprints, and light enough for every phone to analyse smoothly.
    video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  video.muted = true;
  await video.play();
  if (!video.videoWidth) {
    await new Promise<void>((r) => video.addEventListener("loadedmetadata", () => r(), { once: true }));
  }
  return stream;
}

export function stopCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Map between video pixel coords and on-screen coords for an object-fit: cover video. */
export function coverMap(vw: number, vh: number, cw: number, ch: number, mirrored: boolean) {
  const scale = Math.max(cw / vw, ch / vh);
  const ox = (cw - vw * scale) / 2;
  const oy = (ch - vh * scale) / 2;
  return {
    toScreen(b: Box): Box {
      const x = b.x * scale + ox;
      return {
        x: mirrored ? cw - x - b.width * scale : x,
        y: b.y * scale + oy,
        width: b.width * scale,
        height: b.height * scale,
      };
    },
  };
}

export function cameraErrorMessage(e: unknown) {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError") return "Camera permission was blocked. Allow camera access in your browser settings and reload.";
  if (name === "NotFoundError") return "No camera found on this device.";
  if (name === "NotReadableError") return "Your camera is busy in another app. Close it and try again.";
  if (e instanceof TypeError || /fetch|network|load/i.test((e as Error)?.message ?? ""))
    return "Couldn't load the scanner. Check your connection and try again.";
  return (e as Error)?.message || "Couldn't start the camera.";
}
