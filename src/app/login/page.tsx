"use client";
import Link from "next/link";
import { useState } from "react";
import { DevBall } from "@/components/DevBall";
import { postJSON } from "@/lib/client";

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
    <main className="page no-nav">
      <Link href="/" className="small muted">
        ← Back
      </Link>
      <div className="center" style={{ margin: "28px 0" }}>
        <DevBall size={72} className="float" />
        <h1 className="title" style={{ marginTop: 16 }}>
          Welcome back
        </h1>
        <p className="subtitle">Your PokeDev is waiting.</p>
      </div>
      <form onSubmit={submit} className="fade-up">
        {error && <div className="error">{error}</div>}
        <div className="field">
          <label>Username</label>
          <input
            className="input"
            autoCapitalize="none"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Passcode</label>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" disabled={busy || !username || !password} style={{ marginTop: 8 }}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="center small muted" style={{ marginTop: 20 }}>
        New here?{" "}
        <Link href="/join" style={{ color: "var(--accent2)" }}>
          Join the hunt
        </Link>
      </p>
    </main>
  );
}
