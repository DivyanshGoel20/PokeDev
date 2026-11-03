"use client";
import type { AppState, RankRow } from "@/lib/types";
import { Lid, Portrait, TypeBadge } from "../ui";
import { PrizeBanner } from "../DevconBits";

export default function Ranks({ state, onEntry }: { state: AppState; onEntry: (no: number) => void }) {
  const { ranks, dex, me } = state;
  const byUser = new Map(dex.filter((d) => d.username).map((d) => [d.username!, d]));
  const top = ranks.slice(0, 3);
  const rest = ranks.slice(3);
  const meInList = ranks.some((r) => r.isMe);

  function face(r: RankRow, size: number) {
    const d = byUser.get(r.username);
    return (
      <Portrait
        size={size}
        radius={size / 3.5}
        username={r.username}
        displayName={r.displayName}
        type={r.type}
        caught
        avatar={d?.avatar}
      />
    );
  }
  const tap = (r: RankRow) => {
    const d = byUser.get(r.username);
    if (d) onEntry(d.no);
  };

  const podium = [top[1], top[0], top[2]];
  const heights = [74, 100, 58];
  const colors = ["#d9dde3", "#ffcc33", "#e8a565"];
  const labels = ["2", "1", "3"];

  return (
    <>
      <Lid title="RANKS" subtitle="PokeDev masters" />
      <main className="wrap">
        <div style={{ marginBottom: 18 }}>
          <PrizeBanner rank={me.catchCount ? me.rank : undefined} />
        </div>
        <p className="small muted center" style={{ margin: "-4px 0 18px", lineHeight: 1.5 }}>
          Most builders caught wins. Tied? Whoever got there first ranks higher.
        </p>
        {top.length > 0 && (
          <div className="podium">
            {podium.map((r, i) =>
              r ? (
                <button
                  key={r.username}
                  className="podium-col"
                  onClick={() => tap(r)}
                  style={{ background: "none", border: 0, padding: 0, color: "inherit" }}
                >
                  <div style={{ display: "flex", justifyContent: "center" }}>{face(r, i === 1 ? 74 : 60)}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.displayName}
                  </div>
                  <div className="small muted" style={{ fontWeight: 600 }}>
                    {r.catches} caught
                  </div>
                  <div className="podium-step" style={{ height: heights[i], background: colors[i] }}>
                    {labels[i]}
                  </div>
                </button>
              ) : (
                <div key={i} />
              ),
            )}
          </div>
        )}

        {rest.map((r) => (
          <Row key={r.username} r={r} n={r.rank} face={face(r, 42)} onClick={() => tap(r)} />
        ))}

        {!meInList && (
          <>
            <div className="section-label">
              <span>You</span>
            </div>
            <Row
              r={{ username: me.username, displayName: me.displayName, type: me.type, catches: me.catchCount, rank: me.rank, isMe: true }}
              n={me.rank}
              face={face({ username: me.username, displayName: me.displayName, type: me.type, catches: 0, rank: me.rank, isMe: true }, 42)}
            />
          </>
        )}
      </main>
    </>
  );
}

function Row({ r, n, face, onClick }: { r: RankRow; n: number; face: React.ReactNode; onClick?: () => void }) {
  return (
    <button className={`rank-row${r.isMe ? " me" : ""}`} onClick={onClick} style={{ width: "100%", textAlign: "left" }}>
      <span className="rank-n">{n}</span>
      {face}
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {r.displayName}
          {r.isMe && <span className="muted"> (you)</span>}
        </b>
        <span style={{ marginTop: 4, display: "inline-block" }}>
          <TypeBadge type={r.type} small />
        </span>
      </span>
      <span style={{ textAlign: "right" }}>
        <span className="px" style={{ fontSize: 14, display: "block" }}>
          {r.catches}
        </span>
        <span className="small muted">caught</span>
      </span>
    </button>
  );
}
