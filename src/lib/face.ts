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
      return faceapi;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

export type Box = { x: number; y: number; width: number; height: number };

/** Fast detection of all faces (boxes only) for live tracking. */
export async function detectBoxes(input: HTMLVideoElement | HTMLCanvasElement): Promise<Box[]> {
  const faceapi = await loadFace();
  const res = await faceapi.detectAllFaces(
    input,
    new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 }),
  );
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
