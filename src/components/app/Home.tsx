"use client";
import { TYPES, TYPE_KEYS, type AppState } from "@/lib/types";
import { levelInfo } from "@/lib/levels";
import { DevBall } from "../DevBall";
import { Lid, Portrait, dexNo } from "../ui";
import type { Tab } from "./AppShell";
import { PrizeBanner } from "../DevconBits";

export default function Home({
  state,
  onCatch,
  onEntry,
  onInvite,
  setTab,
}: {
  state: AppState;
  onCatch: () => void;
  onEntry: (no: number) => void;
  onInvite: () => void;
  setTab: (t: Tab) => void;
}) {
  const { me, dex } = state;
  const others = dex.filter((e) => !e.isMe);
  const caught = others.filter((e) => e.caught);
  const recent = [...caught].sort((a, b) => Date.parse(b.caughtAt!) - Date.parse(a.caughtAt!)).slice(0, 10);
  const typesCaught = new Set(caught.map((c) => c.type));
  const pct = others.length ? Math.round((caught.length / others.length) * 100) : 0;
  const lv = levelInfo(me.catchCount);

  return (
    <>
      <Lid
        right={
          <button
            onClick={() => setTab("me")}
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, background: "none", border: 0, padding: 0, color: "#fff", minWidth: 0 }}
          >
            <span style={{ textAlign: "right", minWidth: 0 }}>
              <b style={{ display: "block", fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "52vw" }}>
                {me.displayName}
              </b>
              <span className="px" style={{ fontSize: 8, opacity: 0.85, letterSpacing: ".04em" }}>
                LV.{lv.level} {lv.title.toUpperCase()}
              </span>
            </span>
            <span style={{ border: "3px solid #fff", borderRadius: 16, boxShadow: "0 0 0 2px var(--ink)", display: "block" }}>
              <Portrait size={46} radius={12} displayName={me.displayName} username={me.username} type={me.type} caught avatar={me.avatar} />
            </span>
          </button>
        }
      />
      <main className="wrap">
        {/* catch hero */}
        <button
          onClick={onCatch}
          style={{
            display: "block",
            width: "100%",
            marginTop: 4,
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
              <div className="px" style={{ fontSize: 9, opacity: 0.85, letterSpacing: ".06em", lineHeight: 1.7 }}>
                {me.catchable ? "CATCH EVERY BUILDER" : "HIDE MODE ON"}
              </div>
              <div style={{ fontSize: 25, fontWeight: 700, lineHeight: 1.1, margin: "8px 0 14px" }}>
                Catch people
                <br />
                like Pokémon.
              </div>
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

        {/* prize */}
        <div style={{ marginTop: 16 }}>
          <PrizeBanner rank={me.catchCount ? me.rank : undefined} onClick={() => setTab("ranks")} />
        </div>

        {/* level */}
        <div className="section-label">
          <span>Trainer level</span>
          <span>
            {me.catchCount} caught
          </span>
        </div>
        <div className="panel">
          <div className="row spread" style={{ marginBottom: 10 }}>
            <div className="row" style={{ gap: 10 }}>
              <span
                className="px"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: "var(--red)",
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 14,
                  border: "2.5px solid var(--ink)",
                }}
              >
                {lv.level}
              </span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{lv.title}</div>
                <div className="small muted">
                  {lv.next
                    ? `${lv.next.need} more ${lv.next.need === 1 ? "catch" : "catches"} to Lv.${lv.next.level} ${lv.next.title}`
                    : "Max level. Legendary."}
                </div>
              </div>
            </div>
          </div>
          <div className="bar">
            <i style={{ width: `${Math.round(lv.progress * 100)}%` }} />
          </div>
        </div>

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
            <b>{me.catchCount ? `#${me.rank}` : "-"}</b>
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
                  avatar={e?.avatar}
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

        {/* caught by */}
        {state.caughtBy.length > 0 && (
          <>
            <div className="section-label">
              <span>Caught by</span>
              <span>{state.caughtBy.length}</span>
            </div>
            <div className="panel" style={{ padding: "4px 14px" }}>
              {state.caughtBy.slice(0, 6).map((c, i) => (
                <div
                  key={c.username}
                  className="row"
                  style={{ padding: "10px 0", borderTop: i ? "1.5px dashed var(--line)" : "none" }}
                >
                  <Portrait size={38} radius={10} displayName={c.displayName} username={c.username} type={c.type} caught avatar={c.avatar} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.displayName} caught you
                    </div>
                    <div className="small muted">
                      {new Date(c.at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
                    </div>
                  </div>
                  {c.caughtBack ? (
                    <button className="btn btn-sm btn-quiet" onClick={() => onEntry(c.no)}>
                      View
                    </button>
                  ) : (
                    <button className="btn btn-sm btn-red" onClick={onCatch}>
                      Catch back
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* invite */}
        <button
          onClick={onInvite}
          className="btn btn-yellow"
          style={{ marginTop: 22, justifyContent: "space-between" }}
        >
          <span>Invite a builder with your QR code</span>
          <span>→</span>
        </button>

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
