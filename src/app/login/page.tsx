"use client";
import Link from "next/link";
import { useState } from "react";
import { postJSON } from "@/lib/client";
import { Lid } from "@/components/ui";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await postJSON("/api/login", { username, password });
    if (r.error) {
      setError(r.error);
      setBusy(false);
    } else {
      window.location.href = "/";
    }
  }

  return (
    <>
      <Lid title="CONTINUE" subtitle="Welcome back, trainer" backHref="/" big={false} />
      <main className="wrap plain screen">
        <div className="dialog" style={{ marginBottom: 22 }}>
          Welcome back! Enter your trainer name and passcode to continue your adventure.
        </div>
        <form onSubmit={submit}>
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
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
              />
            </div>
          </div>
          <div className="field">
            <label>Passcode</label>
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn btn-red" disabled={busy || !username || !password} style={{ marginTop: 10 }}>
            {busy ? "Loading..." : "Continue"}
          </button>
        </form>
        <p className="center small muted" style={{ marginTop: 22 }}>
          New here?{" "}
          <Link href="/join" style={{ color: "var(--red)", fontWeight: 700 }}>
            Become a trainer
          </Link>
        </p>
      </main>
    </>
  );
}
