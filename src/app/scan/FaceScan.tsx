"use client";
import { useEffect, useRef, useState } from "react";
import { cameraErrorMessage, describeFace, detectBoxes, distance, loadFace, meanDescriptor, startCamera, stopCamera, type Box, type FaceRead } from "@/lib/face";
import { postJSON } from "@/lib/client";
import { DevBall } from "@/components/DevBall";
import { Lid } from "@/components/ui";
import { ScannerProgressText } from "@/components/PreloadScanner";
import { FRONTAL_MIN_SCAN, LIVENESS, SAME_FACE_FRAMES } from "@/lib/types";

const SAMPLES = 5;
type Phase = "intro" | "loading" | "scanning" | "saving" | "done" | "error";

export default function FaceScan({
  isNew,
  hasFace,
  name,
  mode = "register",
  upgrade = false,
  password,
  username,
  onBack,
}: {
  isNew: boolean;
  hasFace: boolean;
  name: string;
  /** "recover": find the account that owns this face and give it a new passcode. */
  mode?: "register" | "recover";
  /** existing player re-scanning with the new scanner */
  upgrade?: boolean;
  password?: string;
  username?: string;
  onBack?: () => void;
}) {
  const recover = mode === "recover";
  const [duplicate, setDuplicate] = useState(false);
  const [dupHint, setDupHint] = useState("");
  const [recovered, setRecovered] = useState("");
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
    let failures = 0;
    let last: Box | null = null; // where the face was last seen: read it directly next time
    let misses = 0;
    while (runningRef.current && samples.length < SAMPLES) {
      let f: FaceRead | null = null;
      try {
        f = await describeFace(video, last);
        failures = 0;
      } catch (err) {
        // Don't spin forever on a broken scanner: tell the person what happened.
        console.warn("face scan failed", err);
        if (++failures >= 12) {
          runningRef.current = false;
          stopCamera(streamRef.current);
          setError("The face scanner stopped working on this phone. Reload the page and try again.");
          setPhase("error");
          return;
        }
      }
      if (!runningRef.current) return;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!f) {
        last = null;
        // Only nag after a few misses in a row (a single missed frame is normal).
        if (++misses >= 3) setHint("Can't see your face yet. Hold the phone at eye level, facing a light, and look at the screen");
      } else {
        misses = 0;
        last = f.box;
        const cx = (f.box.x + f.box.width / 2) / vw;
        const cy = (f.box.y + f.box.height / 2) / vh;
        if (f.box.width < Math.min(vw, vh) * 0.15) setHint("Move a little closer");
        else if (Math.abs(cx - 0.5) > 0.3 || Math.abs(cy - 0.5) > 0.32) setHint("Center your face in the circle");
        else if (f.frontal < FRONTAL_MIN_SCAN) setHint("Look straight at the camera, not to the side");
        else if (f.score < 0.45) setHint("Hold still. A bit more light helps");
        else {
          // Keep samples consistent (same person, steady); a wild one restarts the count.
          if (samples.length >= 2 && distance(meanDescriptor(samples), f.descriptor) > SAME_FACE_FRAMES) {
            samples.length = 0;
          }
          samples.push(f.descriptor);
          setProgress(samples.length / SAMPLES);
          setHint(samples.length < SAMPLES ? "Perfect, hold still..." : "Got it!");
        }
      }
      await new Promise((r) => setTimeout(r, 60));
    }
    if (!runningRef.current) return;

    // Anti-impersonation: a quick head turn (a printed photo can't do this).
    setProgress(1);
    setHint("Last step: slowly turn your head to one side ↔");
    const turnUntil = performance.now() + 20_000;
    let turned = false;
    while (runningRef.current && performance.now() < turnUntil) {
      const faces = await detectBoxes(video).catch(() => []);
      const ref = last;
      const f = ref
        ? faces.find((x) => Math.hypot(x.x + x.width / 2 - (ref.x + ref.width / 2), x.y + x.height / 2 - (ref.y + ref.height / 2)) < ref.width * 1.5)
        : faces[0];
      if (f) last = f;
      if (f && f.frontal <= LIVENESS.TURN_FRONTAL) {
        turned = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    if (!runningRef.current) return;
    if (!turned) {
      runningRef.current = false;
      stopCamera(streamRef.current);
      setError("We didn't see your head turn. Tap Try again, look at the camera, then slowly turn your head to the side.");
      setPhase("error");
      return;
    }
    setHint("Got it!");

    runningRef.current = false;
    stopCamera(streamRef.current);
    setPhase("saving");
    if (recover) {
      const r = await postJSON<{ username?: string }>("/api/recover", { descriptor: meanDescriptor(samples), password, username });
      if (r.error) {
        setError(r.error);
        setPhase("error");
      } else {
        setRecovered(r.username ?? "");
        setPhase("done");
      }
      return;
    }
    const r = await postJSON<{ code?: string; hint?: string }>("/api/face", { descriptor: meanDescriptor(samples) });
    if (r.error) {
      setError(r.error + (r.hint ? ` (It's @${r.hint}.)` : ""));
      setDuplicate(r.code === "duplicate");
      setDupHint(r.hint ?? "");
      setPhase("error");
    } else {
      setPhase("done");
    }
  }

  const live = phase === "loading" || phase === "scanning";

  return (
    <>
      {recover ? (
        <Lid title="RECOVER" subtitle="Unlock with your face" onBack={onBack} big={false} />
      ) : isNew ? (
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
            {phase === "loading" ? <ScannerProgressText fallback="Starting camera..." /> : hint}
          </div>
          <p className="center small muted" style={{ marginTop: 12 }}>
            No video or photo leaves your phone. Your face becomes 128 numbers here, and only those are saved.
          </p>
        </div>

        {phase === "intro" && (
          <div className="screen">
            <div className="dialog">
              {recover
                ? "Now look at the camera. If your face matches your account, it gets the new passcode and you're back in."
                : upgrade
                  ? "PokeDev has a new, much more accurate face scanner! Re-scan your face once (about 5 seconds) so other players can catch you."
                  : isNew
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
                  <span className="num-dot">3</span>Then slowly turn your head to one side. (This stops anyone using a photo of you.)
                </li>
                <li>
                  <span className="num-dot">4</span>No photo is stored, just a face fingerprint (numbers) you can delete anytime.
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
              {recover ? "LOOKING YOU UP..." : "SAVING..."}
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className="screen" style={{ marginTop: 10 }}>
            <div className="error">{error}</div>
            {duplicate ? (
              <div className="stack">
                <button className="btn btn-red" onClick={() => window.location.replace(`/recover?from=signup&hint=${encodeURIComponent(dupHint)}`)}>
                  That&apos;s me: use my existing account
                </button>
                <button className="btn btn-quiet" onClick={begin}>
                  Scan again
                </button>
              </div>
            ) : (
              <button className="btn btn-red" onClick={begin}>
                Try again
              </button>
            )}
          </div>
        )}

        {phase === "done" && (
          <div className="center screen" style={{ marginTop: 20 }}>
            <div className="bezel">
              <div className="lcd" style={{ padding: "30px 16px" }}>
                <DevBall size={96} className="pop" />
                <div className="px" style={{ fontSize: 14, marginTop: 22, lineHeight: 1.5 }}>
                  {recover ? "WELCOME BACK!" : isNew ? "REGISTERED!" : "UPDATED!"}
                </div>
              </div>
            </div>
            <div className="dialog" style={{ marginTop: 14, textAlign: "left" }}>
              {recover
                ? `You're back in as @${recovered}. Your new passcode is set, and any other logins were signed out.`
                : isNew
                  ? "Your journey begins! Find other builders and throw a DevBall at them."
                  : "Your face fingerprint was updated."}
            </div>
            {/* full page load (fresh server state), replacing history so Back doesn't return to the scan */}
            <button className="btn btn-red" style={{ marginTop: 18 }} onClick={() => window.location.replace(isNew || recover ? "/" : "/#me")}>
              {recover ? "Continue" : isNew ? "Let's go!" : "Back to PokeDev"}
            </button>
          </div>
        )}
      </main>
    </>
  );
}
