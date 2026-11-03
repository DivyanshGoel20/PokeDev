"use client";
import Link from "next/link";
import { useState } from "react";
import { postJSON } from "@/lib/client";
import { ProfileFields, emptyProfile, type Profile } from "@/components/ProfileFields";

export default function Join() {
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function next(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return setError("Username: 3-20 lowercase letters, numbers or _");
    if (password.length < 6) return setError("Passcode must be at least 6 characters");
    setStep(1);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!profile.displayName.trim()) return setError("Add your name");
    if (!profile.type) return setError("Pick your type");
    setBusy(true);
    const r = await postJSON("/api/signup", { username, password, ...profile });
    if (r.error) {
      setError(r.error);
      setBusy(false);
      if (/username/i.test(r.error)) setStep(0);
    } else {
      window.location.href = "/scan?new=1";
    }
  }

  return (
    <main className="page no-nav">
      {step === 0 ? (
        <Link href="/" className="small muted">
          ← Back
        </Link>
      ) : (
        <button className="small muted" style={{ background: "none", border: 0, padding: 0 }} onClick={() => setStep(0)}>
          ← Back
        </button>
      )}
      <div className="steps">
        <i data-on="true" />
        <i data-on={step >= 1} />
        <i data-on={false} />
      </div>

      {step === 0 ? (
        <form onSubmit={next} className="fade-up" key="s0">
          <h1 className="title">Create your trainer</h1>
          <p className="subtitle">Pick a username and a passcode to log back in.</p>
          <div style={{ height: 20 }} />
          {error && <div className="error">{error}</div>}
          <div className="field">
            <label>Username</label>
            <div className="input-prefix">
              <span>@</span>
              <input
                className="input mono"
                autoCapitalize="none"
                autoComplete="username"
                maxLength={20}
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="satoshi"
              />
            </div>
          </div>
          <div className="field">
            <label>Passcode (6+ characters)</label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" style={{ marginTop: 8 }}>
            Next
          </button>
        </form>
      ) : (
        <form onSubmit={submit} className="fade-up" key="s1">
          <h1 className="title">Your builder card</h1>
          <p className="subtitle">This is what people get when they catch you.</p>
          <div style={{ height: 20 }} />
          {error && <div className="error">{error}</div>}
          <ProfileFields value={profile} onChange={setProfile} />
          <button className="btn btn-primary" disabled={busy} style={{ marginTop: 8 }}>
            {busy ? "Creating…" : "Next: scan your face"}
          </button>
        </form>
      )}
    </main>
  );
}
