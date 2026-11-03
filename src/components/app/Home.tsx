"use client";
import { TYPES, TYPE_KEYS, trainerLevel, type AppState } from "@/lib/types";
import { DevBall } from "../DevBall";
import { Lid, Portrait, TypeBadge, dexNo } from "../ui";
import type { Tab } from "./AppShell";

export default function Home({
  state,
  onCatch,
  onEntry,
  setTab,
}: {
  state: AppState;
  onCatch: () => void;
  onEntry: (no: number) => void;
  setTab: (t: Tab) => void;
}) {
  const { me, dex } = state;
  const others = dex.filter((e) => !e.isMe);
  const caught = others.filter((e) => e.caught);
  const recent = [...caught].sort((a, b) => Date.parse(b.caughtAt!) - Date.parse(a.caughtAt!)).slice(0, 10);
  const typesCaught = new Set(caught.map((c) => c.type));
  const pct = others.length ? Math.round((caught.length / others.length) * 100) : 0;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <Lid title="POKEDEV" subtitle="Devcon edition" />
      <main className="wrap">
        {/* trainer strip */}
        <div className="row" style={{ marginTop: 4 }}>
          <Portrait size={56} displayName={me.displayName} username={me.username} type={me.type} caught radius={16} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="small muted">{greet}, trainer</div>
            <div style={{ fontWeight: 700, fontSize: 21, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {me.displayName}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="px" style={{ fontSize: 12 }}>
              LV.{trainerLevel(me.catchCount)}
            </div>
            <div style={{ marginTop: 6 }}>
              <TypeBadge type={me.type} small />
            </div>
          </div>
        </div>

        {/* catch hero */}
        <button
          onClick={onCatch}
          style={{
            display: "block",
            width: "100%",
            marginTop: 18,
            padding: 0,
            border: "3px solid var(--ink)",
            borderRadius: 22,
            background: "var(--red)",
            color: "#fff",
            textAlign: "left",
            boxShadow: "0 5px 0 var(--ink)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              right: -40,
              top: -40,
              width: 210,
              height: 210,
              borderRadius: "50%",
              border: "18px solid rgba(255,255,255,.12)",
            }}
          />
          <div style={{ padding: "20px 18px", display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
            <div style={{ flex: 1 }}>
              <div className="px" style={{ fontSize: 10, opacity: 0.85, letterSpacing: ".08em" }}>
                {me.catchable ? "SCANNER READY" : "HIDE MODE ON"}
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1, margin: "8px 0 14px" }}>Catch builders</div>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#fffdf8",
                  color: "var(--ink)",
                  border: "2.5px solid var(--ink)",
                  borderRadius: 12,
                  padding: "9px 14px",
                  fontWeight: 700,
                  fontSize: 15,
                  boxShadow: "0 3px 0 var(--ink)",
                }}
              >
                Open camera →
              </span>
            </div>
            <DevBall size={104} className="bob" />
          </div>
        </button>

        {/* progress */}
        <div className="section-label">
          <span>PokeDev progress</span>
          <button className="px" onClick={() => setTab("dex")} style={{ background: "none", border: 0, fontSize: 10, color: "var(--red)" }}>
            VIEW ›
          </button>
        </div>
        <div className="panel">
          <div className="row spread" style={{ marginBottom: 10 }}>
            <div>
              <span className="px" style={{ fontSize: 20 }}>{caught.length}</span>
              <span className="muted" style={{ fontWeight: 600 }}>
                {" "}
                / {others.length} builders caught
              </span>
            </div>
            <span className="px" style={{ fontSize: 11 }}>
              {pct}%
            </span>
          </div>
          <div className="bar">
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="stat-grid" style={{ marginTop: 10 }}>
          <div className="stat">
            <b>{me.catchCount}</b>
            <span>Caught</span>
          </div>
          <div className="stat">
            <b>{me.caughtCount}</b>
            <span>Times caught</span>
          </div>
          <div className="stat">
            <b>#{me.rank}</b>
            <span>Rank</span>
          </div>
        </div>

        {/* recent */}
        <div className="section-label">
          <span>Recent catches</span>
        </div>
        {recent.length === 0 ? (
          <div className="dialog">
            Find someone wearing a PokeDev smile, open the camera and throw a DevBall at them. Your first catch shows up here!
          </div>
        ) : (
          <div className="hscroll">
            {recent.map((e) => (
              <button
                key={e.no}
                onClick={() => onEntry(e.no)}
                style={{
                  width: 124,
                  padding: 8,
                  borderRadius: 16,
                  border: "2px solid var(--line)",
                  background: "var(--card)",
                  textAlign: "left",
                  boxShadow: "0 3px 0 var(--line)",
                }}
              >
                <Portrait
                  size={104}
                  username={e.username}
                  displayName={e.displayName}
                  type={e.type}
                  caught
                  hasPhoto={e.hasPhoto}
                  caughtAt={e.caughtAt}
                  radius={10}
                />
                <div className="px" style={{ fontSize: 8, marginTop: 8, color: "var(--muted)" }}>
                  {dexNo(e.no)}
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {e.displayName}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* types */}
        <div className="section-label">
          <span>Types collected</span>
          <span>
            {typesCaught.size}/{TYPE_KEYS.length}
          </span>
        </div>
        <div className="panel" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {TYPE_KEYS.map((k) => (
            <span key={k} style={{ opacity: typesCaught.has(k) ? 1 : 0.28, filter: typesCaught.has(k) ? "none" : "grayscale(1)" }}>
              <span className="type" style={{ background: TYPES[k].color, color: TYPES[k].fg }}>
                {TYPES[k].label}
              </span>
            </span>
          ))}
        </div>
      </main>
    </>
  );
}
