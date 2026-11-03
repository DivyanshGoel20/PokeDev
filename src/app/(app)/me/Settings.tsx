"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicUser } from "@/lib/types";
import { postJSON } from "@/lib/client";
import { PlayerCard } from "@/components/PlayerCard";
import { ProfileFields, type Profile } from "@/components/ProfileFields";

export default function Settings({ user, catchable, hasFace }: { user: PublicUser; catchable: boolean; hasFace: boolean }) {
  const router = useRouter();
  const [isCatchable, setCatchable] = useState(catchable);
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    displayName: user.displayName,
    building: user.building,
    type: user.type,
    xHandle: user.xHandle,
    farcaster: user.farcaster,
    telegram: user.telegram,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function toggleCatchable() {
    const next = !isCatchable;
    setCatchable(next);
    const r = await postJSON("/api/me", { catchable: next }, "PATCH");
    if (r.error) setCatchable(!next);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await postJSON("/api/me", { profile }, "PATCH");
    setBusy(false);
    if (r.error) return setError(r.error);
    setEditing(false);
    router.refresh();
  }

  async function logout() {
    await postJSON("/api/logout", {});
    window.location.href = "/";
  }

  async function del() {
    if (!confirm("Delete your account, face data and all catches? This can't be undone.")) return;
    await postJSON("/api/me", undefined, "DELETE");
    window.location.href = "/";
  }

  return (
    <main className="page">
      <h1 className="title">My card</h1>
      <div style={{ marginTop: 18 }}>
        {editing ? (
          <form onSubmit={save} className="panel fade-up">
            {error && <div className="error">{error}</div>}
            <ProfileFields value={profile} onChange={setProfile} />
            <div className="row">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <PlayerCard user={user} />
            <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => setEditing(true)}>
              ✏️ Edit card
            </button>
          </>
        )}
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="row spread">
          <div>
            <b>{isCatchable ? "Catchable" : "Hide mode"}</b>
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              {isCatchable ? "Other players can catch you." : "Nobody can catch you right now."}
            </p>
          </div>
          <button className="toggle" data-on={isCatchable} onClick={toggleCatchable} aria-label="Toggle catchable" />
        </div>
      </div>

      <div className="panel stack" style={{ marginTop: 12 }}>
        <div className="row spread">
          <div>
            <b>Face fingerprint</b>
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              {hasFace ? "Saved as 128 numbers. No photo stored." : "Not scanned yet."}
            </p>
          </div>
          <Link href="/scan" className="btn btn-ghost btn-sm">
            {hasFace ? "Rescan" : "Scan"}
          </Link>
        </div>
      </div>

      <div className="stack" style={{ marginTop: 18 }}>
        <button className="btn btn-ghost" onClick={logout}>
          Log out
        </button>
        <button className="btn btn-danger" onClick={del}>
          Delete my account &amp; data
        </button>
      </div>
    </main>
  );
}
