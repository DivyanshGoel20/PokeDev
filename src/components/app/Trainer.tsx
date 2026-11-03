"use client";
import { useState } from "react";
import { TYPES, TYPE_KEYS, trainerLevel, type AppState } from "@/lib/types";
import { postJSON } from "@/lib/client";
import { Lid, Portrait, TypeBadge } from "../ui";
import { ProfileFields, type Profile } from "../ProfileFields";

export default function Trainer({ state, refresh, onInvite }: { state: AppState; refresh: () => Promise<unknown>; onInvite: () => void }) {
  const { me, dex } = state;
  const [catchable, setCatchable] = useState(me.catchable);
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    displayName: me.displayName,
    building: me.building,
    type: me.type,
    xHandle: me.xHandle,
    farcaster: me.farcaster,
    telegram: me.telegram,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const typesCaught = new Set(dex.filter((e) => e.caught).map((e) => e.type));

  async function toggleCatchable() {
    const next = !catchable;
    setCatchable(next);
    const r = await postJSON("/api/me", { catchable: next }, "PATCH");
    if (r.error) setCatchable(!next);
    else refresh();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await postJSON("/api/me", { profile }, "PATCH");
    if (r.error) {
      setBusy(false);
      return setError(r.error);
    }
    await refresh();
    setBusy(false);
    setEditing(false);
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
    <>
      <Lid title="TRAINER" subtitle="Your ID card" />
      <main className="wrap">
        {editing ? (
          <form onSubmit={save} className="panel screen">
            {error && <div className="error">{error}</div>}
            <ProfileFields value={profile} onChange={setProfile} />
            <div className="row" style={{ marginTop: 6 }}>
              <button type="button" className="btn btn-quiet" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button className="btn btn-red" disabled={busy}>
                {busy ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* Trainer ID card */}
            <div
              style={{
                border: "3px solid var(--ink)",
                borderRadius: 20,
                overflow: "hidden",
                background: "var(--card)",
                boxShadow: "0 5px 0 var(--ink)",
              }}
            >
              <div
                className="row spread px"
                style={{ background: "var(--red)", color: "#fff", padding: "12px 14px", fontSize: 10, borderBottom: "3px solid var(--ink)" }}
              >
                <span>TRAINER ID</span>
                <span>IDNo.{String(me.no).padStart(5, "0")}</span>
              </div>
              <div style={{ padding: 16, display: "flex", gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="px muted" style={{ fontSize: 8 }}>
                    NAME
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 22, marginTop: 6, lineHeight: 1.15 }}>{me.displayName}</div>
                  <div className="muted small" style={{ fontWeight: 600, marginTop: 2 }}>
                    @{me.username}
                  </div>
                  <div className="row" style={{ marginTop: 12, gap: 8 }}>
                    <TypeBadge type={me.type} />
                    <span className="px" style={{ fontSize: 11 }}>
                      LV.{trainerLevel(me.catchCount)}
                    </span>
                  </div>
                </div>
                <Portrait size={96} radius={14} displayName={me.displayName} username={me.username} type={me.type} caught />
              </div>
              {me.building && (
                <div style={{ padding: "0 16px 14px", fontSize: 14, lineHeight: 1.45 }}>
                  <span className="px muted" style={{ fontSize: 8 }}>
                    BUILDING
                  </span>
                  <div style={{ marginTop: 6 }}>{me.building}</div>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderTop: "2px dashed var(--line)" }}>
                {[
                  ["CAUGHT", me.catchCount],
                  ["TIMES CAUGHT", me.caughtCount],
                  ["RANK", `#${me.rank}`],
                ].map(([l, v]) => (
                  <div key={l} style={{ padding: "12px 8px", textAlign: "center" }}>
                    <div className="px" style={{ fontSize: 14 }}>
                      {v}
                    </div>
                    <div className="muted" style={{ fontSize: 10, fontWeight: 600, marginTop: 6 }}>
                      {l}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: "12px 14px 14px", borderTop: "2px dashed var(--line)" }}>
                <div className="px muted" style={{ fontSize: 8, marginBottom: 10 }}>
                  TYPE BADGES
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {TYPE_KEYS.map((k) => (
                    <span
                      key={k}
                      title={TYPES[k].name}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        border: "2.5px solid var(--ink)",
                        background: typesCaught.has(k) ? TYPES[k].color : "var(--paper-2)",
                        opacity: typesCaught.has(k) ? 1 : 0.35,
                        boxShadow: typesCaught.has(k) ? "inset 0 -3px 0 rgba(0,0,0,.2)" : "none",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn" onClick={() => setEditing(true)}>
                Edit card
              </button>
              <button className="btn btn-yellow" onClick={onInvite}>
                My QR code
              </button>
            </div>
          </>
        )}

        <div className="section-label">
          <span>Settings</span>
        </div>
        <div className="panel">
          <div className="row spread">
            <div>
              <b>{catchable ? "Catchable" : "Hide mode"}</b>
              <div className="small muted" style={{ marginTop: 3 }}>
                {catchable ? "Other players can catch you." : "Nobody can catch you right now."}
              </div>
            </div>
            <button className="toggle" data-on={catchable} onClick={toggleCatchable} aria-label="Toggle catchable" />
          </div>
        </div>
        <div className="panel" style={{ marginTop: 10 }}>
          <div className="row spread">
            <div>
              <b>Face fingerprint</b>
              <div className="small muted" style={{ marginTop: 3 }}>
                Saved as 128 numbers, not a photo.
              </div>
            </div>
            <a href="/scan" className="btn btn-sm">
              Rescan
            </a>
          </div>
        </div>

        <div className="stack" style={{ marginTop: 18 }}>
          <button className="btn btn-quiet" onClick={logout}>
            Log out
          </button>
          <button className="btn btn-danger" onClick={del}>
            Delete my account &amp; data
          </button>
        </div>
      </main>
    </>
  );
}
