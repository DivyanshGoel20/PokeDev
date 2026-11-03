"use client";
import { useMemo, useState } from "react";
import type { AppState } from "@/lib/types";
import { DevBall } from "../DevBall";
import { Icon, Lid, Portrait, TypeBadge } from "../ui";

type Filter = "all" | "caught" | "missing";

export default function Dex({ state, onEntry }: { state: AppState; onEntry: (no: number) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const others = state.dex.filter((e) => !e.isMe);
  const owned = others.filter((e) => e.caught).length;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^no\.?/, "");
    return state.dex.filter((e) => {
      if (filter === "caught" && !(e.caught || e.isMe)) return false;
      if (filter === "missing" && (e.caught || e.isMe)) return false;
      if (!q) return true;
      return (
        String(e.no).padStart(3, "0").includes(q) ||
        (e.displayName ?? "").toLowerCase().includes(q) ||
        (e.username ?? "").includes(q)
      );
    });
  }, [state.dex, filter, query]);

  return (
    <>
      <Lid title="POKEDEV" subtitle={`${others.length} builders registered`} />
      <main className="wrap">
        <div className="bezel">
          <div className="lcd" style={{ padding: 10 }}>
            <div className="dex-head">
              <span>SEEN {String(others.length).padStart(3, "0")}</span>
              <span>OWN {String(owned).padStart(3, "0")}</span>
            </div>
            <div className="search">
              <div style={{ position: "relative", flex: 1 }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.6 }}>
                  <Icon.search />
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Name or number"
                  inputMode="search"
                  style={{
                    width: "100%",
                    height: 40,
                    padding: "0 10px 0 34px",
                    borderRadius: 10,
                    border: "2px solid rgba(0,0,0,.15)",
                    background: "rgba(255,255,255,.55)",
                    outline: "none",
                    fontSize: 16,
                    color: "var(--lcd-ink)",
                  }}
                />
              </div>
            </div>
            <div className="row" style={{ gap: 6, marginBottom: 12 }}>
              {(["all", "caught", "missing"] as Filter[]).map((f) => (
                <button key={f} className="chip" data-on={filter === f} onClick={() => setFilter(f)}>
                  {f === "all" ? "All" : f === "caught" ? "Caught" : "Not caught"}
                </button>
              ))}
            </div>

            <div className="dex-list">
              {rows.map((e) => {
                const known = e.caught || e.isMe;
                return (
                  <button key={e.no} className={`dex-row${known ? "" : " unknown"}`} onClick={() => onEntry(e.no)}>
                    <span className="dex-no">
                      No.
                      <br />
                      {String(e.no).padStart(3, "0")}
                    </span>
                    <Portrait
                      size={44}
                      radius={10}
                      username={e.username}
                      displayName={e.displayName}
                      type={e.type}
                      caught={e.caught || e.isMe}
                      avatar={e?.avatar}
                    />
                    <span className="dex-name">
                      {known ? e.displayName : "- - - - -"}
                      {e.isMe && <small>That&apos;s you</small>}
                    </span>
                    {known ? <TypeBadge type={e.type} small /> : null}
                    <span style={{ width: 20, display: "grid", placeItems: "center" }}>
                      {e.caught && <DevBall size={18} />}
                    </span>
                  </button>
                );
              })}
              {rows.length === 0 && (
                <div className="center px" style={{ fontSize: 10, padding: "30px 0", lineHeight: 1.8 }}>
                  NO ENTRIES FOUND
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
