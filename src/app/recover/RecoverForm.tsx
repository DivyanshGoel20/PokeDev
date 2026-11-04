"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Lid } from "@/components/ui";
import { focusField } from "@/lib/client";
import FaceScan from "../scan/FaceScan";

export default function RecoverForm() {
  const [step, setStep] = useState<0 | 1>(0);
  const [username, setUsername] = useState("");
  const [hint, setHint] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<{ username?: string; password?: string; confirm?: string }>({});
  const [fromSignup, setFromSignup] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setFromSignup(sp.get("from") === "signup");
    setHint((sp.get("hint") ?? "").replace(/[^a-z0-9_*]/gi, "").slice(0, 12));
  }, []);

  function next(e: React.FormEvent) {
    e.preventDefault();
    const e2: typeof err = {};
    if (!/^[a-z0-9_]{3,20}$/.test(username)) e2.username = "Enter the username of your account";
    if (password.length < 6) e2.password = "At least 6 characters";
    else if (confirm !== password) e2.confirm = "Passcodes don't match";
    setErr(e2);
    if (e2.username) return focusField("f-username");
    if (e2.password) return focusField("f-password");
    if (e2.confirm) return focusField("f-confirm");
    setStep(1);
    window.scrollTo(0, 0);
  }

  if (step === 1) return <FaceScan mode="recover" password={password} username={username} isNew={false} hasFace={false} name="" onBack={() => setStep(0)} />;

  return (
    <>
      <Lid title="RECOVER" subtitle="Forgot your passcode?" backHref="/login" big={false} />
      <main className="wrap plain screen">
        <div className="dialog" style={{ marginBottom: 22 }}>
          {fromSignup
            ? `You already have a PokeDev account${hint ? ` (@${hint})` : ""}! Enter its username, set a new passcode and scan your face to get back in.`
            : "No worries! Enter your username, pick a new passcode, then scan your face to unlock your account."}
        </div>
        <form onSubmit={next}>
          <div className="field" id="f-username" data-invalid={!!err.username}>
            <label htmlFor="in-username">
              Your username<span className="req">*</span>
            </label>
            <div className="input-icon">
              <span>@</span>
              <input
                id="in-username"
                className="input"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              />
            </div>
            {err.username && <div className="field-msg">{err.username}</div>}
          </div>
          <div className="field" id="f-password" data-invalid={!!err.password}>
            <label htmlFor="in-password">
              New passcode (6+ characters)<span className="req">*</span>
            </label>
            <input
              id="in-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {err.password && <div className="field-msg">{err.password}</div>}
          </div>
          <div className="field" id="f-confirm" data-invalid={!!err.confirm}>
            <label htmlFor="in-confirm">
              Repeat new passcode<span className="req">*</span>
            </label>
            <input
              id="in-confirm"
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {err.confirm && <div className="field-msg">{err.confirm}</div>}
          </div>
          <button className="btn btn-red" style={{ marginTop: 10 }}>
            Next: scan my face
          </button>
        </form>
        <p className="center small muted" style={{ marginTop: 22 }}>
          Remembered it?{" "}
          <Link href="/login" style={{ color: "var(--red)", fontWeight: 700 }}>
            Log in
          </Link>
        </p>
      </main>
    </>
  );
}
