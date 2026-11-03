"use client";
import { useState } from "react";
import { postJSON } from "@/lib/client";
import { Lid } from "@/components/ui";
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
    window.scrollTo(0, 0);
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
    <>
      {step === 0 ? (
        <Lid title="NEW TRAINER" subtitle="Step 1 of 3" backHref="/" big={false} />
      ) : (
        <Lid title="NEW TRAINER" subtitle="Step 2 of 3" onBack={() => setStep(0)} big={false} />
      )}
      <main className="wrap plain">
        <div className="steps">
          <i data-on="true" />
          <i data-on={step >= 1} />
          <i />
        </div>

        {step === 0 ? (
          <form onSubmit={next} className="screen" key="s0">
            <div className="dialog" style={{ marginBottom: 22 }}>
              Hi there, future trainer! First things first: what should we call you?
            </div>
            {error && <div className="error">{error}</div>}
            <div className="field">
              <label>Username</label>
              <div className="input-icon">
                <span>@</span>
                <input
                  className="input"
                  autoCapitalize="none"
                  autoCorrect="off"
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
              <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className="btn btn-red" style={{ marginTop: 10 }}>
              Next
            </button>
          </form>
        ) : (
          <form onSubmit={submit} className="screen" key="s1">
            <div className="dialog" style={{ marginBottom: 22 }}>
              Now, tell us about yourself. This is your dex entry: what trainers see when they catch you.
            </div>
            {error && <div className="error">{error}</div>}
            <ProfileFields value={profile} onChange={setProfile} />
            <button className="btn btn-red" disabled={busy} style={{ marginTop: 10 }}>
              {busy ? "Registering..." : "Next: scan your face"}
            </button>
          </form>
        )}
      </main>
    </>
  );
}
