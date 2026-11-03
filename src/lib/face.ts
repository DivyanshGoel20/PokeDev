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
 * Detection of all faces for live tracking, with how face-on each one is. Uses the fast tiny
 * detector, and when it sees nothing, falls back to the slower but more robust SSD detector.
 */
export async function detectBoxes(input: HTMLVideoElement | HTMLCanvasElement): Promise<TrackedFace[]> {
  const faceapi = await loadFace();
  let res = await faceapi
    .detectAllFaces(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
    .withFaceLandmarks();
  if (res.length === 0) {
    res = await faceapi.detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 })).withFaceLandmarks();
  }
  return res.map((r) => {
    const b = r.detection.box;
    return { x: b.x, y: b.y, width: b.width, height: b.height, frontal: frontalScore(r.landmarks.positions) };
  });
}

/** Accurate detection + 128-number face descriptors, with how face-on each face is. */
export async function describeFaces(input: HTMLVideoElement | HTMLCanvasElement) {
  const faceapi = await loadFace();
  const res = await faceapi
    .detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  return res.map((r) => ({
    box: { x: r.detection.box.x, y: r.detection.box.y, width: r.detection.box.width, height: r.detection.box.height },
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
