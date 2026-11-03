"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Lid } from "@/components/ui";
import { focusField } from "@/lib/client";
import FaceScan from "../scan/FaceScan";

export default function RecoverForm() {
  const [step, setStep] = useState<0 | 1>(0);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<{ password?: string; confirm?: string }>({});
  const [fromSignup, setFromSignup] = useState(false);

  useEffect(() => {
    setFromSignup(new URLSearchParams(window.location.search).get("from") === "signup");
  }, []);

  function next(e: React.FormEvent) {
    e.preventDefault();
    const e2: typeof err = {};
    if (password.length < 6) e2.password = "At least 6 characters";
    else if (confirm !== password) e2.confirm = "Passcodes don't match";
    setErr(e2);
    if (e2.password) return focusField("f-password");
    if (e2.confirm) return focusField("f-confirm");
    setStep(1);
    window.scrollTo(0, 0);
  }

  if (step === 1) return <FaceScan mode="recover" password={password} isNew={false} hasFace={false} name="" onBack={() => setStep(0)} />;

  return (
    <>
      <Lid title="RECOVER" subtitle="Forgot your passcode?" backHref="/login" big={false} />
      <main className="wrap plain screen">
        <div className="dialog" style={{ marginBottom: 22 }}>
          {fromSignup
            ? "You already have a PokeDev account! Set a new passcode and scan your face to get back into it."
            : "No worries! Your face is your key. Pick a new passcode, then scan your face to unlock your account."}
        </div>
        <form onSubmit={next}>
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
