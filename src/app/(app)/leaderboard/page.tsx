import Link from "next/link";
import type { CSSProperties } from "react";
import { getUser } from "@/lib/auth";
import { leaderboard } from "@/lib/users";
import { typeInfo } from "@/lib/types";
import { Avatar } from "@/components/PlayerCard";

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function LeaderboardPage() {
  const me = (await getUser())!;
  const rows = await leaderboard(100);

  return (
    <main className="page">
      <h1 className="title">Top trainers</h1>
      <p className="subtitle">Most builders caught at Devcon.</p>
      <div style={{ marginTop: 20 }}>
        {rows.map((u, i) => {
          const t = typeInfo(u.type);
          return (
            <Link
              href={`/u/${u.username}`}
              key={u.username}
              className={`rank-row${u.username === me.username ? " me" : ""}`}
              style={{ "--c": t.color } as CSSProperties}
            >
              <div className="rank-n">{MEDALS[i] ?? i + 1}</div>
              <Avatar name={u.displayName} />
              <div className="rank-main">
                <b>{u.displayName}</b>
                <span>
                  {t.emoji} {t.label} · caught {u.caughtCount}×
                </span>
              </div>
              <div className="rank-score">
                {u.catchCount}
                <small>catches</small>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
