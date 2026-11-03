"use client";
import type * as FaceApiNS from "@vladmandic/face-api";

type FaceApi = typeof FaceApiNS;
let loading: Promise<FaceApi> | null = null;

/** Lazily load face-api + model weights (only once per page load). */
export function loadFace(): Promise<FaceApi> {
  if (!loading) {
    loading = (async () => {
      const faceapi = (await import("@vladmandic/face-api")) as FaceApi;
      // The bundled tfjs is typed loosely; setBackend/ready exist at runtime.
      const tf = faceapi.tf as unknown as { setBackend(b: string): Promise<boolean>; ready(): Promise<void> };
      try {
        await tf.setBackend("webgl");
      } catch {
        /* fall back to whatever is available */
      }
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
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

export type Box = { x: number; y: number; width: number; height: number };

/**
 * Detection of all faces (boxes only) for live tracking. Uses the fast tiny detector, and when it
 * sees nothing, falls back to the slower but more robust SSD detector.
 */
export async function detectBoxes(input: HTMLVideoElement | HTMLCanvasElement): Promise<Box[]> {
  const faceapi = await loadFace();
  let res = await faceapi.detectAllFaces(
    input,
    new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }),
  );
  if (res.length === 0) {
    res = await faceapi.detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }));
  }
  return res.map((d) => {
    const b = d.box;
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  });
}

/** Accurate detection + 128-number face descriptors. */
export async function describeFaces(input: HTMLVideoElement | HTMLCanvasElement) {
  const faceapi = await loadFace();
  const res = await faceapi
    .detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  return res.map((r) => ({
    box: { x: r.detection.box.x, y: r.detection.box.y, width: r.detection.box.width, height: r.detection.box.height },
    score: r.detection.score,
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
  return (e as Error)?.message || "Couldn't start the camera.";
}

/* ---------------- liveness (blink check) ---------------- */

type Landmarker = import("@mediapipe/tasks-vision").FaceLandmarker;
let blinkLoading: Promise<Landmarker> | null = null;

/**
 * MediaPipe Face Landmarker, used only for its blink scores (eyeBlinkLeft/Right).
 * face-api's landmarks don't respond reliably to closed eyes, MediaPipe's blendshapes do.
 */
export function loadBlink(): Promise<Landmarker> {
  if (!blinkLoading) {
    blinkLoading = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks("/mediapipe");
      const make = (delegate: "GPU" | "CPU") =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate },
          outputFaceBlendshapes: true,
          runningMode: "IMAGE",
          numFaces: 1,
        });
      const lm = await make("GPU").catch(() => make("CPU"));
      // warm-up
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      try {
        lm.detect(c);
      } catch {
        /* ignore */
      }
      return lm;
    })().catch((e) => {
      blinkLoading = null;
      throw e;
    });
  }
  return blinkLoading;
}

/**
 * Watch a face in the live video and resolve true as soon as it blinks.
 * A printed photo or a face on another screen never blinks, so it never passes.
 * `center` is the target's position in video pixels; the watcher follows the face as it moves.
 * The face is cropped and enlarged before analysis, so it also works from a few metres away.
 */
export async function watchForBlink(
  video: HTMLVideoElement,
  center: { x: number; y: number },
  size: number,
  timeoutMs: number,
): Promise<boolean> {
  const [faceapi, lm] = await Promise.all([loadFace(), loadBlink()]);
  const start = performance.now();
  let c = { ...center };
  let side = size * 1.9;
  let open = -1; // baseline blink score with eyes open
  const crop = document.createElement("canvas");
  crop.width = crop.height = 256;
  const cctx = crop.getContext("2d")!;

  let lost = 0;
  while (performance.now() - start < timeoutMs) {
    cctx.drawImage(video, c.x - side / 2, c.y - side / 2, side, side, 0, 0, 256, 256);
    let score = -1;
    try {
      const r = lm.detect(crop);
      const cats = r.faceBlendshapes?.[0]?.categories;
      const pts = r.faceLandmarks?.[0];
      if (cats && pts) {
        const get = (k: string) => cats.find((x) => x.categoryName === k)?.score ?? 0;
        score = (get("eyeBlinkLeft") + get("eyeBlinkRight")) / 2;
        // Follow the face using MediaPipe's own landmarks (cheap, no extra detector pass).
        let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
        for (const p of pts) {
          if (p.x < x0) x0 = p.x;
          if (p.y < y0) y0 = p.y;
          if (p.x > x1) x1 = p.x;
          if (p.y > y1) y1 = p.y;
        }
        const ox = c.x - side / 2;
        const oy = c.y - side / 2;
        c = { x: ox + ((x0 + x1) / 2) * side, y: oy + ((y0 + y1) / 2) * side };
        side = Math.max(Math.max(x1 - x0, y1 - y0) * side * 1.9, 48);
        lost = 0;
      } else {
        lost++;
      }
    } catch {
      lost++;
    }

    // Lost the face in the crop: re-acquire it with the face detector.
    if (lost >= 2) {
      try {
        const boxes = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 }));
        let bestD = Infinity;
        for (const d of boxes) {
          const b = d.box;
          const dd = Math.hypot(b.x + b.width / 2 - c.x, b.y + b.height / 2 - c.y);
          if (dd < bestD && dd < Math.max(b.width, 80) * 2) {
            bestD = dd;
            c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
            side = Math.max(b.width, b.height) * 1.9;
          }
        }
      } catch {
        /* keep last position */
      }
      lost = 0;
    }

    // Debug trace for automated tests (cheap, bounded).
    const dbg = (window as unknown as { __blinkTrace?: number[] }).__blinkTrace;
    if (dbg && dbg.length < 200) dbg.push(Math.round(score * 1000) / 1000);
    if (score >= 0) {
      if (open >= 0 && score > 0.35 && score - open > 0.18) return true;
      // Baseline follows the open-eye level, ignoring partial closures.
      open = open < 0 ? score : score < open ? score : open * 0.9 + score * 0.1;
    }
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
  return false;
}
