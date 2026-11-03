"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cameraErrorMessage, describeFaces, distance, loadFace, meanDescriptor, startCamera, stopCamera } from "@/lib/face";
import { postJSON } from "@/lib/client";
import { DevBall } from "@/components/DevBall";

const SAMPLES = 5;
type Phase = "intro" | "loading" | "scanning" | "saving" | "done" | "error";

export default function FaceScan({ isNew, hasFace, name }: { isNew: boolean; hasFace: boolean; name: string }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [hint, setHint] = useState("Look straight at the camera");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    loadFace().catch(() => {}); // warm up models while the user reads the intro
    return () => {
      runningRef.current = false;
      stopCamera(streamRef.current);
    };
  }, []);

  async function begin() {
    setError("");
    setProgress(0);
    setPhase("loading");
    try {
      const [stream] = await Promise.all([startCamera(videoRef.current!, "user"), loadFace()]);
      streamRef.current = stream;
    } catch (e) {
      setError(cameraErrorMessage(e));
      setPhase("error");
      return;
    }
    setPhase("scanning");
    runningRef.current = true;
    scanLoop();
  }

  async function scanLoop() {
    const video = videoRef.current!;
    const samples: number[][] = [];
    while (runningRef.current && samples.length < SAMPLES) {
      const faces = await describeFaces(video).catch(() => []);
      if (!runningRef.current) return;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (faces.length === 0) setHint("No face found — look at the camera");
      else if (faces.length > 1) setHint("Only your face in the frame please");
      else {
        const f = faces[0];
        const cx = (f.box.x + f.box.width / 2) / vw;
        const cy = (f.box.y + f.box.height / 2) / vh;
        if (f.box.width < Math.min(vw, vh) * 0.28) setHint("Move a bit closer");
        else if (Math.abs(cx - 0.5) > 0.2 || Math.abs(cy - 0.5) > 0.22) setHint("Center your face in the oval");
        else if (f.score < 0.8) setHint("Hold still, good light helps");
        else {
          if (samples.length && distance(meanDescriptor(samples), f.descriptor) > 0.45) samples.length = 0;
          samples.push(f.descriptor);
          setProgress(samples.length / SAMPLES);
          setHint(samples.length < SAMPLES ? "Perfect, hold still…" : "Got it!");
        }
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    if (!runningRef.current) return;
    runningRef.current = false;
    stopCamera(streamRef.current);
    setPhase("saving");
    const r = await postJSON("/api/face", { descriptor: meanDescriptor(samples) });
    if (r.error) {
      setError(r.error);
      setPhase("error");
    } else {
      setPhase("done");
    }
  }

  const live = phase === "loading" || phase === "scanning";

  return (
    <main className="page no-nav" style={{ minHeight: "100dvh" }}>
      {!isNew && (
        <Link href={hasFace ? "/me" : "/"} className="small muted">
          ← Back
        </Link>
      )}

      {isNew && (
        <div className="steps">
          <i data-on="true" />
          <i data-on="true" />
          <i data-on="true" />
        </div>
      )}

      <div style={{ display: live ? "block" : "none" }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "3 / 4",
            borderRadius: 28,
            overflow: "hidden",
            background: "#000",
            marginTop: 16,
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "48%",
              width: "66%",
              height: "62%",
              transform: "translate(-50%,-50%)",
              borderRadius: "50%",
              boxShadow: "0 0 0 9999px rgba(7,6,15,.72)",
            }}
          />
          <svg
            viewBox="0 0 300 300"
            preserveAspectRatio="none"
            style={{ position: "absolute", left: "17%", top: "17%", width: "66%", height: "62%" }}
          >
            <ellipse cx="150" cy="150" rx="146" ry="146" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            <ellipse
              cx="150"
              cy="150"
              rx="146"
              ry="146"
              fill="none"
              stroke="url(#ringg)"
              strokeWidth="6"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              pathLength={100}
              strokeDasharray={`${progress * 100} 100`}
              transform="rotate(-90 150 150)"
              style={{ transition: "stroke-dasharray .3s" }}
            />
            <defs>
              <linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#8b5cf6" />
                <stop offset="1" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
          </svg>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 20, textAlign: "center", padding: "0 16px" }}>
            <span className="social" style={{ background: "rgba(0,0,0,.6)", fontSize: 15 }}>
              {phase === "loading" ? "Starting camera…" : hint}
            </span>
          </div>
        </div>
        <p className="center small muted" style={{ marginTop: 14 }}>
          Nothing is recorded. Your face is turned into 128 numbers on this phone, and only those numbers are saved.
        </p>
      </div>

      {phase === "intro" && (
        <div className="fade-up" style={{ marginTop: 20 }}>
          <div className="center">
            <div style={{ fontSize: 72 }}>🤳</div>
            <h1 className="title" style={{ marginTop: 10 }}>
              {isNew ? `Last step, ${name.split(" ")[0]}` : "Scan your face"}
            </h1>
            <p className="subtitle">
              This is how other players catch you. Hold your phone at eye level in good light — it takes about 3 seconds.
            </p>
          </div>
          <div className="panel" style={{ marginTop: 24 }}>
            <ul className="list-check">
              <li>🔒 No photo or video is ever uploaded or stored.</li>
              <li>🔢 We save a face fingerprint: 128 numbers that can&apos;t be turned back into a picture.</li>
              <li>🗑️ Delete it any time from your profile.</li>
            </ul>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={begin}>
            Start face scan
          </button>
        </div>
      )}

      {phase === "saving" && (
        <div className="center" style={{ marginTop: 80 }}>
          <DevBall size={90} className="float" />
          <p className="subtitle">Saving your fingerprint…</p>
        </div>
      )}

      {phase === "error" && (
        <div className="fade-up" style={{ marginTop: 40 }}>
          <div className="error">{error}</div>
          <button className="btn btn-primary" onClick={begin}>
            Try again
          </button>
        </div>
      )}

      {phase === "done" && (
        <div className="center fade-up" style={{ marginTop: 50 }}>
          <div className="float" style={{ display: "inline-block", filter: "drop-shadow(0 20px 40px rgba(139,92,246,.6))" }}>
            <DevBall size={120} />
          </div>
          <h1 className="title" style={{ marginTop: 24 }}>
            {isNew ? "You're in the game!" : "Face updated"}
          </h1>
          <p className="subtitle">Now find other builders and throw a DevBall at them.</p>
          <Link href="/play" className="btn btn-primary" style={{ marginTop: 28 }}>
            Start catching
          </Link>
        </div>
      )}
    </main>
  );
}
