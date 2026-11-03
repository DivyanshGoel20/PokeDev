"use client";
import { useEffect, useRef, useState } from "react";
import { cameraErrorMessage, describeFaces, distance, loadFace, meanDescriptor, startCamera, stopCamera } from "@/lib/face";
import { postJSON } from "@/lib/client";
import { DevBall } from "@/components/DevBall";
import { Lid } from "@/components/ui";

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
    loadFace().catch(() => {}); // download + warm up models while the user reads the intro
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
      if (faces.length === 0) setHint("No face found. Look at the camera");
      else if (faces.length > 1) setHint("Only your face in the frame, please");
      else {
        const f = faces[0];
        const cx = (f.box.x + f.box.width / 2) / vw;
        const cy = (f.box.y + f.box.height / 2) / vh;
        if (f.box.width < Math.min(vw, vh) * 0.28) setHint("Move a little closer");
        else if (Math.abs(cx - 0.5) > 0.2 || Math.abs(cy - 0.5) > 0.22) setHint("Center your face in the circle");
        else if (f.score < 0.8) setHint("Hold still. Good light helps");
        else {
          if (samples.length && distance(meanDescriptor(samples), f.descriptor) > 0.45) samples.length = 0;
          samples.push(f.descriptor);
          setProgress(samples.length / SAMPLES);
          setHint(samples.length < SAMPLES ? "Perfect, hold still..." : "Got it!");
        }
      }
      await new Promise((r) => setTimeout(r, 80));
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
    <>
      {isNew ? (
        <Lid title="NEW TRAINER" subtitle="Step 3 of 3" big={false} />
      ) : (
        <Lid title="FACE SCAN" subtitle="Update your fingerprint" backHref={hasFace ? "/#me" : "/"} big={false} />
      )}
      <main className="wrap plain">
        {isNew && (
          <div className="steps">
            <i data-on="true" />
            <i data-on="true" />
            <i data-on="true" />
          </div>
        )}

        <div style={{ display: live ? "block" : "none" }}>
          <div className="bezel">
            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "3 / 4",
                borderRadius: 8,
                overflow: "hidden",
                background: "#000",
              }}
            >
              <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "47%",
                  width: "70%",
                  aspectRatio: "1 / 1.22",
                  transform: "translate(-50%,-50%)",
                  borderRadius: "50%",
                  boxShadow: "0 0 0 9999px rgba(29,29,34,.62)",
                }}
              />
              <svg
                viewBox="0 0 100 122"
                style={{ position: "absolute", left: "50%", top: "47%", width: "70%", transform: "translate(-50%,-50%)", overflow: "visible" }}
              >
                <ellipse cx="50" cy="61" rx="50" ry="61" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="2" />
                <ellipse
                  cx="50"
                  cy="61"
                  rx="50"
                  ry="61"
                  fill="none"
                  stroke="#4cc76b"
                  strokeWidth="4"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray={`${progress * 100} 100`}
                  transform="rotate(-90 50 61)"
                  style={{ transition: "stroke-dasharray .25s" }}
                />
              </svg>
              {phase === "loading" && (
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                  <DevBall size={56} className="bob" />
                </div>
              )}
            </div>
          </div>
          <div className="dialog" style={{ marginTop: 14, fontSize: 16 }}>
            {phase === "loading" ? "Booting scanner..." : hint}
          </div>
          <p className="center small muted" style={{ marginTop: 12 }}>
            Nothing is recorded. Your face becomes 128 numbers on this phone, and only those are saved.
          </p>
        </div>

        {phase === "intro" && (
          <div className="screen">
            <div className="dialog">
              {isNew
                ? `Last step, ${name.split(" ")[0]}! Let's scan your face so other trainers can catch you.`
                : "Let's rescan your face. Use good light and hold your phone at eye level."}
            </div>
            <div className="panel" style={{ marginTop: 14 }}>
              <ul className="list-plain">
                <li>
                  <span className="num-dot">1</span>Hold your phone at eye level, in good light.
                </li>
                <li>
                  <span className="num-dot">2</span>Fit your face in the circle and hold still for about 3 seconds.
                </li>
                <li>
                  <span className="num-dot">3</span>No photo is stored, just a 128-number fingerprint you can delete anytime.
                </li>
              </ul>
            </div>
            <button className="btn btn-red" style={{ marginTop: 18 }} onClick={begin}>
              Start face scan
            </button>
          </div>
        )}

        {phase === "saving" && (
          <div className="center" style={{ marginTop: 70 }}>
            <DevBall size={84} className="bob" />
            <p className="px" style={{ fontSize: 10, marginTop: 22 }}>
              SAVING...
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className="screen" style={{ marginTop: 10 }}>
            <div className="error">{error}</div>
            <button className="btn btn-red" onClick={begin}>
              Try again
            </button>
          </div>
        )}

        {phase === "done" && (
          <div className="center screen" style={{ marginTop: 20 }}>
            <div className="bezel">
              <div className="lcd" style={{ padding: "30px 16px" }}>
                <DevBall size={96} className="pop" />
                <div className="px" style={{ fontSize: 14, marginTop: 22, lineHeight: 1.5 }}>
                  {isNew ? "REGISTERED!" : "UPDATED!"}
                </div>
              </div>
            </div>
            <div className="dialog" style={{ marginTop: 14, textAlign: "left" }}>
              {isNew
                ? "Your journey begins! Find other builders and throw a DevBall at them."
                : "Your face fingerprint was updated."}
            </div>
            {/* full page load on purpose: the home page needs fresh server state */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="btn btn-red" style={{ marginTop: 18 }}>
              {isNew ? "Let's go!" : "Back to PokeDev"}
            </a>
          </div>
        )}
      </main>
    </>
  );
}
