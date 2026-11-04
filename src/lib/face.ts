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
/* ---------- model download with progress (so nobody stares at a frozen "booting" screen) ---------- */
const MODEL_FILES: [string, number][] = [
  ["/models/tiny_face_detector_model.bin", 193321],
  ["/models/face_landmark_68_model.bin", 356840],
  ["/models/ssd_mobilenetv1_model.bin", 5616957],
  ["/models/face_recognition_model.bin", 6444032],
];
let progress = 0;
const progressListeners = new Set<(p: number) => void>();
/** Subscribe to scanner download progress (0..1). Returns an unsubscribe function. */
export function onScannerProgress(cb: (p: number) => void) {
  progressListeners.add(cb);
  cb(progress);
  return () => progressListeners.delete(cb);
}
function setProgress(p: number) {
  progress = p;
  progressListeners.forEach((cb) => cb(p));
}
/** Download the model files into the browser cache, reporting progress (they're cached for a year). */
let fetching: Promise<void> | null = null;
/**
 * Download only (no heavy work on the main thread), safe to call while someone fills in a form.
 * Used on entry pages so the scanner is ready when they reach it. Retries after a failure.
 */
export function preloadScanner(): Promise<void> {
  if (!fetching) {
    fetching = prefetchModels().catch((e) => {
      fetching = null;
      throw e;
    });
  }
  return fetching;
}

async function prefetchModels() {
  const total = MODEL_FILES.reduce((a, [, n]) => a + n, 0);
  let done = 0;
  await Promise.all(
    MODEL_FILES.map(async ([url, size]) => {
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error("Couldn't download the face scanner");
      const reader = res.body.getReader();
      let got = 0;
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        got += value.length;
        done += value.length;
        setProgress(Math.min(0.99, done / total));
      }
      if (got < size * 0.5) throw new Error("Face scanner download was interrupted");
    }),
  );
  setProgress(1);
}

export function loadFace(): Promise<FaceApi> {
  if (!loading) {
    loading = withTimeout(60_000, "The face scanner took too long to load. Check your connection and try again.", async () => {
      const faceapi = (await import("@vladmandic/face-api")) as FaceApi;
      await preloadScanner();
      // The bundled tfjs is typed loosely; setBackend/ready exist at runtime.
      const tf = faceapi.tf as unknown as { setBackend(b: string): Promise<boolean>; ready(): Promise<void> };
      // WebGL on every modern phone; plain CPU otherwise (we don't ship the wasm backend).
      // Some phones stall while setting up WebGL: give it a few seconds, then use the CPU.
      const okGl = await Promise.race([
        tf.setBackend("webgl").catch(() => false),
        new Promise<boolean>((r) => setTimeout(() => r(false), 8000)),
      ]);
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

export type FaceRead = { box: Box; score: number; frontal: number; descriptor: number[] };

const zoomCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;

/**
 * Read the fingerprint of the face inside `region` (video pixels): crop that area from the
 * full-resolution frame and enlarge it, so the face is big and alone. Detection on a crop is far
 * more reliable in dim or busy venues than searching the whole frame, and faster too.
 * Tries the accurate detector first, then the fast one, with forgiving thresholds.
 */
async function readRegion(video: HTMLVideoElement, region: Box): Promise<FaceRead | null> {
  const faceapi = await loadFace();
  if (!zoomCanvas || !video.videoWidth) return null;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const side = Math.max(region.width, region.height) * 2.2;
  const cx = region.x + region.width / 2;
  const cy = region.y + region.height / 2;
  const sx = Math.max(0, Math.min(vw - 1, cx - side / 2));
  const sy = Math.max(0, Math.min(vh - 1, cy - side / 2));
  const sw = Math.max(1, Math.min(vw - sx, side));
  const sh = Math.max(1, Math.min(vh - sy, side));
  const OUT = 416;
  const k = OUT / Math.max(sw, sh);
  zoomCanvas.width = Math.round(sw * k);
  zoomCanvas.height = Math.round(sh * k);
  zoomCanvas.getContext("2d")!.drawImage(video, sx, sy, sw, sh, 0, 0, zoomCanvas.width, zoomCanvas.height);

  type R = { detection: { box: Box; score: number }; landmarks: { positions: Pt[] }; descriptor: Float32Array };
  let res: R[] = (await faceapi
    .detectAllFaces(zoomCanvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
    .withFaceLandmarks()
    .withFaceDescriptors()) as unknown as R[];
  if (!res.length) {
    res = (await faceapi
      .detectAllFaces(zoomCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
      .withFaceLandmarks()
      .withFaceDescriptors()) as unknown as R[];
  }
  if (!res.length) return null;
  // The face nearest the middle of the crop is the one we were aiming at.
  const mx = zoomCanvas.width / 2;
  const my = zoomCanvas.height / 2;
  const r = res.reduce((a, z) => {
    const da = Math.hypot(a.detection.box.x + a.detection.box.width / 2 - mx, a.detection.box.y + a.detection.box.height / 2 - my);
    const dz = Math.hypot(z.detection.box.x + z.detection.box.width / 2 - mx, z.detection.box.y + z.detection.box.height / 2 - my);
    return dz < da ? z : a;
  });
  const b = r.detection.box;
  return {
    box: { x: sx + b.x / k, y: sy + b.y / k, width: b.width / k, height: b.height / k },
    score: r.detection.score,
    frontal: frontalScore(r.landmarks.positions),
    descriptor: Array.from(r.descriptor),
  };
}

/**
 * Read one face's fingerprint from the live video. With `near` (where the face was last seen)
 * it reads that face directly; otherwise it first finds the biggest face in the frame.
 */
export async function describeFace(video: HTMLVideoElement, near?: Box | null): Promise<FaceRead | null> {
  if (near) {
    const r = await readRegion(video, near);
    if (r) return r;
  }
  const faceapi = await loadFace();
  const { canvas, back } = grabFrame(video, 640);
  let dets = await faceapi.detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35 }));
  if (!dets.length) dets = await faceapi.detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }));
  if (!dets.length) return null;
  const big = dets.reduce((a, z) => (z.box.width > a.box.width ? z : a)).box;
  return readRegion(video, scaleBox({ x: big.x, y: big.y, width: big.width, height: big.height }, back));
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

export function startCamera(video: HTMLVideoElement, facing: "user" | "environment"): Promise<MediaStream> {
  const opening = openCamera(video, facing);
  return withTimeout(15_000, "The camera didn't start. Tap Try again (and allow camera access if asked).", () => opening).catch((e) => {
    opening.then(stopCamera, () => {}); // if it starts after we gave up, don't leave the camera on
    throw e;
  });
}

/** Camera + face models together; if either fails the camera is released, ready for Try again. */
export async function startScanner(video: HTMLVideoElement, facing: "user" | "environment"): Promise<MediaStream> {
  const camera = startCamera(video, facing);
  try {
    const [stream] = await Promise.all([camera, loadFace()]);
    return stream;
  } catch (e) {
    camera.then(stopCamera, () => {});
    throw e;
  }
}

async function openCamera(video: HTMLVideoElement, facing: "user" | "environment") {
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
